import SwiftUI

extension EnvironmentValues {
  @Entry var appState: AppState = AppState.shared
}

@Observable
final class AppState {
  static let shared = AppState()

  private init() {

  }
  
  var bonjourState = BonjourState()

  var activeHotline: HotlineState? = nil
  var activeServerState: ServerState? = nil

  var cloudKitReady: Bool = false

  // MARK: - Transfers

  /// All active transfers across all servers
  /// Transfers persist even if you disconnect from the server
  var transfers: [TransferInfo] = []
  
  @ObservationIgnored private var transferClients: [UUID: HotlineTransferClient] = [:]

  /// Track download tasks by reference number for cancellation
  @ObservationIgnored private var transferTasks: [UUID: Task<Void, Never>] = [:]
  
  /// Add a transfer to the transfer list
  @MainActor
  func addTransfer(_ transfer: TransferInfo) {
    self.transfers.append(transfer)
  }

  /// Cancel a transfer by transfer ID
  @MainActor
  func cancelTransfer(id: UUID) {
    guard let transferIndex = self.transfers.firstIndex(where: { $0.id == id }) else {
      return
    }
    
    // Cancel the task if it exists
    if let task = self.transferTasks[id] {
      task.cancel()
      self.transferTasks.removeValue(forKey: id)
    }
    
    if let client = self.transferClients[id] {
      client.cancel()
      self.transferClients.removeValue(forKey: id)
    }

    // Remove from transfers list
    self.transfers.remove(at: transferIndex)
  }

  /// Cancel all active transfers
  @MainActor
  func cancelAllTransfers() {
    for (_, task) in self.transferTasks {
      task.cancel()
    }
    self.transferTasks.removeAll()
    
    for (_, client) in self.transferClients {
      client.cancel()
    }
    self.transferClients.removeAll()

    // Clear transfers
    self.transfers.removeAll()
  }
  
  /// Remove all completed transfers
  @MainActor
  func sweepTransfers() {
    for t in self.transfers {
      if t.done {
        self.cancelTransfer(id: t.id)
      }
    }
  }

  /// Register a transfer task
  @MainActor
  func registerTransferTask(_ task: Task<Void, Never>, transferID: UUID) {
    self.transferTasks[transferID] = task
  }
  
  @MainActor
  func registerTransferTask(_ task: Task<Void, Never>, transferID: UUID, client: HotlineTransferClient) {
    self.transferTasks[transferID] = task
    self.transferClients[transferID] = client
  }
  
  /// Unregister a download task (called on completion/failure)
  @MainActor
  func unregisterTransferTask(for transferID: UUID) {
    self.transferTasks.removeValue(forKey: transferID)
    self.transferClients.removeValue(forKey: transferID)
  }
}
