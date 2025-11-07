//
//  HotlineFolderDownloadClientNew.swift
//  Hotline
//
//  Modern async/await folder download client using NetSocketNew
//

import Foundation
import Network

/// Item progress callback for folder downloads
public struct HotlineFolderItemProgress: Sendable {
  public let fileName: String
  public let itemNumber: Int
  public let totalItems: Int
}

/// Modern async/await folder download client for Hotline protocol
@MainActor
public class HotlineFolderDownloadClientNew {
  // MARK: - Configuration

  public struct Configuration: Sendable {
    public var publishProgress: Bool = true
    public init() {}
  }

  // MARK: - Properties

  private let serverAddress: String
  private let serverPort: UInt16
  private let referenceNumber: UInt32

  private let config: Configuration

  private let transferTotal: Int
  private let folderItemCount: Int
  private var transferSize: Int = 0

  private var socket: NetSocketNew?
  private var downloadTask: Task<URL, Error>?
  private var folderProgress: Progress?

  // MARK: - Initialization

  public init(
    address: String,
    port: UInt16,
    reference: UInt32,
    size: UInt32,
    itemCount: Int,
    configuration: Configuration = .init()
  ) {
    self.serverAddress = address
    self.serverPort = port
    self.referenceNumber = reference
    self.config = configuration
    self.transferTotal = Int(size)
    self.folderItemCount = itemCount

    print("HotlineFolderDownloadClientNew[\(reference)]: Server reported transferSize=\(size) bytes, folderItemCount=\(itemCount) items")
  }

  // MARK: - Public API

  public func download(
    to location: HotlineDownloadLocation,
    progress progressHandler: (@Sendable (HotlineTransferProgress) -> Void)? = nil,
    itemProgress itemProgressHandler: (@Sendable (HotlineFolderItemProgress) -> Void)? = nil
  ) async throws -> URL {
    self.downloadTask?.cancel()

    let task = Task<URL, Error> {
      try await performDownload(
        to: location,
        progressHandler: progressHandler,
        itemProgressHandler: itemProgressHandler
      )
    }
    self.downloadTask = task

    do {
      let url = try await task.value
      self.downloadTask = nil
      return url
    } catch {
      print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Failed to download folder: \(error)")
      self.downloadTask = nil
      progressHandler?(.error(error))
      throw error
    }
  }

  /// Cancel the current download
  public func cancel() {
    downloadTask?.cancel()
    downloadTask = nil

    if let socket = socket {
      Task {
        await socket.close()
      }
    }
  }

  // MARK: - Private Implementation

  private func performDownload(
    to destination: HotlineDownloadLocation,
    progressHandler: (@Sendable (HotlineTransferProgress) -> Void)?,
    itemProgressHandler: (@Sendable (HotlineFolderItemProgress) -> Void)?
  ) async throws -> URL {
    
    var destinationFilename: String

    progressHandler?(.connecting)

    // Connect to transfer server
    let socket = try await connectToTransferServer()
    self.socket = socket
    defer { Task { await socket.close() } }

    // Determine destination folder URL
    let fm = FileManager.default
    let destinationURL: URL

    switch destination {
    case .url(let url):
      destinationURL = url
      destinationFilename = url.lastPathComponent
    case .downloads(let filename):
      let downloadsURL = fm.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
      destinationURL = URL(filePath: downloadsURL.generateUniqueFilePath(filename: filename))
      destinationFilename = destinationURL.lastPathComponent
    }

    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Downloading folder to \(destinationURL.path)")

    // Create destination folder
    try? fm.removeItem(at: destinationURL)
    try fm.createDirectory(at: destinationURL, withIntermediateDirectories: true)

    // Create and publish progress for the entire folder (shows in Finder)
    if config.publishProgress {
      let progress = Progress(totalUnitCount: Int64(self.transferTotal))
      progress.fileURL = destinationURL
      progress.fileOperationKind = .downloading
      progress.publish()
      self.folderProgress = progress
    }
    defer {
      // Unpublish progress when folder download completes
      self.folderProgress?.unpublish()
      self.folderProgress = nil
    }

    // Send initial magic header
    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Sending HTXF magic")
    try await socket.write(Data(endian: .big) {
      "HTXF".fourCharCode()
      self.referenceNumber
      UInt32.zero           // data size = 0
      UInt16(1)             // type = 1 (folder transfer)
      UInt16.zero           // reserved = 0
      HotlineFolderAction.nextFile.rawValue             // action = 3 (next file)
    })

    progressHandler?(.connected)
    progressHandler?(.transfer(name: destinationFilename, size: 0, total: self.transferTotal, progress: 0.0, speed: nil, estimate: nil))

    var completedItemCount = 0
    var totalBytesTransferred = 0

    // Process each item in the folder
    while completedItemCount < folderItemCount {
      // Read item header
      let headerLenData = try await socket.read(2)
      let headerLen = Int(headerLenData.readUInt16(at: 0)!)
      let headerData = try await socket.read(headerLen)

      totalBytesTransferred += 2 + headerLen

      guard let (itemType, pathComponents) = parseItemHeaderPath(headerData) else {
        throw HotlineFileClientError.failedToTransfer
      }

      let joinedPath = pathComponents.joined(separator: "/")
      print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Item type=\(itemType) path=\(joinedPath)")

      if itemType == 1 {
        // Folder entry - no progress shown for folder creation
        if !pathComponents.isEmpty {
          let folderURL = destinationURL.appendingPathComponents(pathComponents)
          try fm.createDirectory(at: folderURL, withIntermediateDirectories: true)
          print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Created folder at \(folderURL.path)")
        }

        completedItemCount += 1

        // Request next item if not done
        if completedItemCount < folderItemCount {
          try await sendAction(socket: socket, action: .nextFile) // nextFile
        }

      } else if itemType == 0 {
        // File entry
        let parentComponents = pathComponents.dropLast()
        let fileName = pathComponents.last ?? "untitled"

        // Request file download
        try await sendAction(socket: socket, action: .sendFile) // sendFile

        // Read file size
        let fileSizeData = try await socket.read(4)
        let fileSize = fileSizeData.readUInt32(at: 0)!
        totalBytesTransferred += 4

        print("HotlineFolderDownloadClientNew[\(referenceNumber)]: File '\(fileName)' size: \(fileSize) bytes")

        // Notify item progress before download starts
        completedItemCount += 1
        itemProgressHandler?(HotlineFolderItemProgress(
          fileName: fileName,
          itemNumber: completedItemCount,
          totalItems: folderItemCount
        ))

        // Download the file with overall folder progress tracking
        let (fileURL, fileBytesRead) = try await downloadFile(
          socket: socket,
          fileName: fileName,
          parentPath: Array(parentComponents),
          destinationFolder: destinationURL,
          fileSize: fileSize,
          itemNumber: completedItemCount,
          totalItems: folderItemCount,
          totalBytesTransferredSoFar: totalBytesTransferred,
          progressHandler: progressHandler
        )

        totalBytesTransferred += fileBytesRead
        self.transferSize = totalBytesTransferred

        print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Downloaded file to \(fileURL.path)")

        // Request next item if not done
        if completedItemCount < folderItemCount {
          try await sendAction(socket: socket, action: .nextFile) // nextFile
        }

      } else {
        // Unknown item type
        print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Unknown item type \(itemType), skipping")
        completedItemCount += 1

        if completedItemCount < folderItemCount {
          try await sendAction(socket: socket, action: .nextFile) // nextFile
        }
      }
    }

    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Download complete!")

    // Ensure folder progress shows 100% complete
    self.folderProgress?.completedUnitCount = Int64(self.transferTotal)

    progressHandler?(.completed(url: destinationURL))

    return destinationURL
  }

  // MARK: - Helper Methods

  private func connectToTransferServer() async throws -> NetSocketNew {
    guard let transferPort = NWEndpoint.Port(rawValue: serverPort + 1) else {
      throw NetSocketError.invalidPort
    }

    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Connecting to \(serverAddress):\(serverPort + 1)")

    let socket = try await NetSocketNew.connect(
      host: .name(serverAddress, nil),
      port: transferPort,
      tls: .disabled
    )

    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Connected!")
    return socket
  }

  private func sendAction(socket: NetSocketNew, action: HotlineFolderAction) async throws {
    let actionData = Data(endian: .big) {
      action.rawValue
    }
    try await socket.write(actionData)
    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Sent action: \(action)")
  }

  private func parseItemHeaderPath(_ headerData: Data) -> (type: UInt16, components: [String])? {
    // Need at least: type(2) + count(2)
    guard headerData.count >= 4,
          let type = headerData.readUInt16(at: 0),
          let count = headerData.readUInt16(at: 2) else { return nil }

    var ofs = 4
    var comps: [String] = []
    for _ in 0..<Int(count) {
      guard headerData.count >= ofs + 3 else { return nil }
      // per Hotline path encoding: reserved(2) then nameLen(1) then name
      ofs += 2 // reserved == 0
      let nameLen = Int(headerData.readUInt8(at: ofs)!)
      ofs += 1
      guard headerData.count >= ofs + nameLen else { return nil }
      let nameData = headerData.subdata(in: ofs..<(ofs + nameLen))
      ofs += nameLen

      let name = String(data: nameData, encoding: .macOSRoman)
      ?? String(data: nameData, encoding: .utf8)
      ?? ""
      comps.append(name)
    }
    return (type, comps)
  }

  private func downloadFile(
    socket: NetSocketNew,
    fileName: String,
    parentPath: [String],
    destinationFolder: URL,
    fileSize: UInt32,
    itemNumber: Int,
    totalItems: Int,
    totalBytesTransferredSoFar: Int,
    progressHandler: (@Sendable (HotlineTransferProgress) -> Void)?
  ) async throws -> (url: URL, bytesRead: Int) {
    let fm = FileManager.default
    var bytesRead = 0

    // Read file header
    let headerData = try await socket.read(HotlineFileHeader.DataSize)
    guard let header = HotlineFileHeader(from: headerData) else {
      throw HotlineFileClientError.failedToTransfer
    }
    bytesRead += HotlineFileHeader.DataSize

    // Update folder progress for file header
    let totalBytesNow = totalBytesTransferredSoFar + bytesRead
    self.folderProgress?.completedUnitCount = Int64(totalBytesNow)

    print("HotlineFolderDownloadClientNew[\(referenceNumber)]: File has \(header.forkCount) forks")

    var resourceForkData: Data?
    var fileHandle: FileHandle?
    var filePath: URL?
    var fileDataForkSize: Int = 0

    defer {
      try? fileHandle?.close()
    }

    // Process each fork
    for _ in 0..<Int(header.forkCount) {
      // Read fork header
      let forkHeaderData = try await socket.read(HotlineFileForkHeader.DataSize)
      guard let forkHeader = HotlineFileForkHeader(from: forkHeaderData) else {
        throw HotlineFileClientError.failedToTransfer
      }
      bytesRead += HotlineFileForkHeader.DataSize

      // Update folder progress for fork header
      let totalBytesNow = totalBytesTransferredSoFar + bytesRead
      self.folderProgress?.completedUnitCount = Int64(totalBytesNow)

      if forkHeader.isInfoFork {
        // Read INFO fork
        print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Reading INFO fork (\(forkHeader.dataSize) bytes)")
        let infoData = try await socket.read(Int(forkHeader.dataSize))
        bytesRead += infoData.count

        // Update folder progress for INFO fork
        let totalBytesNow = totalBytesTransferredSoFar + bytesRead
        self.folderProgress?.completedUnitCount = Int64(totalBytesNow)

        guard let info = HotlineFileInfoFork(from: infoData) else {
          throw HotlineFileClientError.failedToTransfer
        }

        // Create parent folders
        let parentFolderURL = destinationFolder.appendingPathComponents(parentPath)
        if !fm.fileExists(atPath: parentFolderURL.path) {
          try fm.createDirectory(at: parentFolderURL, withIntermediateDirectories: true)
        }

        // Determine final file path
        let finalURL = parentFolderURL.appendingPathComponent(fileName)
        filePath = finalURL

        // Remove existing file if present and create with metadata
        try? fm.removeItem(at: finalURL)
        fileHandle = try fm.createHotlineFile(at: finalURL, infoFork: info)

      } else if forkHeader.isDataFork {
        // Stream DATA fork to disk
        print("HotlineFolderDownloadClientNew[\(referenceNumber)]: Reading DATA fork (\(forkHeader.dataSize) bytes)")

        guard let fh = fileHandle else {
          throw HotlineFileClientError.failedToTransfer
        }

        fileDataForkSize = Int(forkHeader.dataSize)

        // Stream data fork using NetSocketNew's optimized file streaming
        let updates = await socket.receiveFile(to: fh, length: fileDataForkSize)
        for try await p in updates {
          // Calculate overall folder progress
          let totalBytesNow = totalBytesTransferredSoFar + bytesRead + p.sent
          let rawProgress = self.transferTotal > 0 ? Double(totalBytesNow) / Double(self.transferTotal) : 0.0
          let overallProgress = min(rawProgress, 1.0) // Clamp to 1.0 to avoid exceeding 100%

          // Update folder-level Finder progress
          self.folderProgress?.completedUnitCount = Int64(totalBytesNow)

          // Calculate overall folder time estimate based on current speed
          let remainingBytes = max(0, self.transferTotal - totalBytesNow)
          let estimate: TimeInterval? = if let speed = p.bytesPerSecond, speed > 0, remainingBytes > 0 {
            TimeInterval(remainingBytes) / speed
          } else {
            nil
          }

          // Report overall folder progress to UI
          progressHandler?(.transfer(
            name: fileName,
            size: totalBytesNow,
            total: self.transferTotal,
            progress: overallProgress,
            speed: p.bytesPerSecond,
            estimate: estimate
          ))
        }
        bytesRead += fileDataForkSize

      } else if forkHeader.isResourceFork {
        // Read RESOURCE fork
        resourceForkData = try await socket.read(Int(forkHeader.dataSize))
        bytesRead += Int(forkHeader.dataSize)

        // Update folder progress for RESOURCE fork
        let totalBytesNow = totalBytesTransferredSoFar + bytesRead
        self.folderProgress?.completedUnitCount = Int64(totalBytesNow)

      } else {
        // Skip unsupported fork
        try await socket.skip(Int(forkHeader.dataSize))
        bytesRead += Int(forkHeader.dataSize)

        // Update folder progress for skipped fork
        let totalBytesNow = totalBytesTransferredSoFar + bytesRead
        self.folderProgress?.completedUnitCount = Int64(totalBytesNow)
      }
    }

    // Close file handle
    try? fileHandle?.close()
    fileHandle = nil

    guard let finalPath = filePath else {
      throw HotlineFileClientError.failedToTransfer
    }

    // Write resource fork if present
    if let rsrcData = resourceForkData, !rsrcData.isEmpty {
      try writeResourceFork(data: rsrcData, to: finalPath)
    }

    return (finalPath, bytesRead)
  }

  private func writeResourceFork(data: Data, to url: URL) throws {
    var resolvedURL = url
    resolvedURL.resolveSymlinksInPath()

    let resourceURL = resolvedURL.urlForResourceFork()
    try data.write(to: resourceURL)
  }
}
