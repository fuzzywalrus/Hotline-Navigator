import Foundation
import Network

@Observable
class BonjourState {
  var isExpanded: Bool = false
  var isBrowsing: Bool = false
  var discoveredServers: [BonjourServer] = []
  
  private var browser: NWBrowser?
  private var resolutionTasks: [UUID: Task<Void, Never>] = [:]
  
  private actor ConnectionResolverState {
    var completed = false
    func markComplete() {
      self.completed = true
    }
  }
  
  struct BonjourServer: Identifiable, Hashable {
    let id = UUID()
    let serviceName: String
    let name: String
    let address: String?
    let port: UInt16?
    let txtRecords: [String: String]
    
    var displayName: String {
      // Use the advertised name, fall back to service name
      self.name.isEmpty ? self.serviceName : self.name
    }
    
    var server: Server? {
      guard let address = self.address,
            let port = self.port else {
        return nil
      }
      return Server(name: self.displayName, description: nil, address: address, port: Int(port))
    }
    
    var isLoopback: Bool {
      guard let address = self.address else { return false }
      return address.hasPrefix("127.") || address.hasPrefix("::1")
    }
    
    static func == (lhs: BonjourServer, rhs: BonjourServer) -> Bool {
      lhs.address == rhs.address && lhs.port == rhs.port
    }
    
    func hash(into hasher: inout Hasher) {
      hasher.combine(self.id)
    }
  }
  
  func startBrowsing() {
    guard !self.isBrowsing else {
      return
    }
    
    self.isBrowsing = true
    self.discoveredServers.removeAll()
    
    let parameters = NWParameters()
    parameters.includePeerToPeer = true
    
    self.browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_hotline._tcp", domain: nil), using: parameters)
    
    self.browser?.stateUpdateHandler = { [weak self] newState in
      Task { @MainActor in
        switch newState {
        case .ready:
          print("BonjourState: Browser ready")
        case .failed(let error):
          print("BonjourState: Browser failed: \(error)")
          self?.stopBrowsing()
        case .cancelled:
          print("BonjourState: Browser cancelled")
          self?.isBrowsing = false
        default:
          break
        }
      }
    }
    
    self.browser?.browseResultsChangedHandler = { [weak self] results, changes in
      guard let self = self else {
        return
      }
      
      Task { @MainActor in
        print("BonjourState: Browse results changed, found \(results.count) services")
        
        // Handle removed services
        for change in changes {
          if case .removed(let result) = change {
            if case .service(let name, _, _, _) = result.endpoint {
              self.discoveredServers.removeAll { $0.serviceName == name }
              print("BonjourState: Removed service: \(name)")
            }
          }
        }
        
        // Handle added/updated services
        for change in changes {
          if case .added(let result) = change, case .service = result.endpoint {
            await self.resolveService(result)
          } else if case .changed(_, let new, _) = change, case .service = new.endpoint {
            await self.resolveService(new)
          }
        }
      }
    }
    
    self.browser?.start(queue: .main)
  }
  
  private func cleanAddress(_ addressString: String) -> String {
    // For link-local IPv6 addresses (fe80::), we MUST keep the zone identifier
    // because it tells the system which network interface to use for routing
    // For all other addresses (global IPv6, IPv4), strip the zone identifier
    if addressString.hasPrefix("fe80:") {
      return addressString
    }

    return addressString.components(separatedBy: "%").first ?? addressString
  }
  
  private func resolveService(_ result: NWBrowser.Result) async {
    guard case .service(let name, _, _, _) = result.endpoint else {
      return
    }

    // Create a connection to resolve the service
    let connection = NWConnection(to: result.endpoint, using: .tcp)
    let resolver = ConnectionResolverState()
    
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      connection.stateUpdateHandler = { [weak self] state in
        Task { @MainActor in
          if Task.isCancelled {
            await resolver.markComplete()
            return
          }
          
          if await resolver.completed {
            return
          }
          
          switch state {
          case .ready:
            await resolver.markComplete()

            // Extract address and port
            var address: String?
            var port: UInt16?

            guard let path = connection.currentPath, let endpoint = path.remoteEndpoint else {
              return
            }

            var isLoopback: Bool = false
            if path.usesInterfaceType(.loopback) {
              isLoopback = true
            }

            if case .hostPort(let host, let nwPort) = endpoint {
              switch host {
              case .ipv4(let ipv4):
                address = self?.cleanAddress(ipv4.debugDescription)
              case .ipv6(let ipv6):
                let ipv6String = ipv6.debugDescription
                address = self?.cleanAddress(ipv6String)
              case .name(let hostname, _):
                address = hostname
              @unknown default:
                break
              }

              if isLoopback {
                address = "127.0.0.1"
              }
              port = nwPort.rawValue
            }
            
            // Parse TXT records
            var txtRecords: [String: String] = [:]
            if case .bonjour(let txtRecord) = result.metadata {
              for (key, value) in txtRecord.dictionary {
                txtRecords[key] = value
              }
            }
            
            let server = BonjourServer(
              serviceName: name,
              name: name,
              address: address,
              port: port,
              txtRecords: txtRecords
            )
            
            // Update or add server
            if let index = self?.discoveredServers.firstIndex(where: { $0.serviceName ==
              name }) {
              self?.discoveredServers[index] = server
            } else {
              self?.discoveredServers.append(server)
            }
                        
            connection.cancel()
            continuation.resume()
            
          case .failed(let error):
            await resolver.markComplete()
            
            print("BonjourState: Failed to resolve \(name): \(error)")
            connection.cancel()
            continuation.resume()
            
          default:
            break
          }
        }
      }
      
      connection.start(queue: .main)
      
      // Timeout after 5 seconds
      Task {
        try? await Task.sleep(nanoseconds: 5_000_000_000)
        
        if await resolver.completed == false {
          await resolver.markComplete()
          connection.cancel()
          continuation.resume()
        }
      }
    }
  }
  
  func stopBrowsing() {
    guard self.isBrowsing else {
      return
    }
    
    print("BonjourState: Stopping Bonjour browsing")
    
    // Cancel all resolution tasks
    for (_, task) in self.resolutionTasks {
      task.cancel()
    }
    self.resolutionTasks.removeAll()
    
    self.browser?.cancel()
    self.browser = nil
    self.isBrowsing = false
    self.discoveredServers.removeAll()
  }
}
