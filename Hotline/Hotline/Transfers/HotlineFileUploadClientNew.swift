//
//  HotlineFileUploadClientNew.swift
//  Hotline
//
//  Modern async/await file upload client using NetSocketNew
//

import Foundation
import Network

/// Modern async/await file upload client for Hotline protocol
@MainActor
public class HotlineFileUploadClientNew {
  // MARK: - Configuration

  public struct Configuration: Sendable {
    public var chunkSize: Int = 256 * 1024
    public var publishProgress: Bool = true
    public init() {}
  }

  // MARK: - Properties

  private let serverAddress: String
  private let serverPort: UInt16
  private let referenceNumber: UInt32
  private let fileURL: URL

  private let config: Configuration

  private var transferSize: Int
  private let transferTotal: Int
  private var transferProgress: Progress

  private var socket: NetSocketNew?
  private var uploadTask: Task<Void, Error>?

  // MARK: - Initialization

  public init?(
    fileURL: URL,
    address: String,
    port: UInt16,
    reference: UInt32,
    configuration: Configuration = .init()
  ) {
    // Validate file and get total size
    guard let payloadSize = FileManager.default.getFlattenedFileSize(fileURL) else {
      return nil
    }

    guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else {
      return nil
    }

    self.serverAddress = address
    self.serverPort = port
    self.referenceNumber = reference
    self.fileURL = fileURL
    self.config = configuration

    self.transferTotal = Int(payloadSize)
    self.transferSize = 0
    self.transferProgress = Progress(totalUnitCount: Int64(self.transferTotal))

    print("HotlineFileUploadClientNew[\(reference)]: Preparing to upload '\(fileURL.lastPathComponent)' (\(payloadSize) bytes)")
  }

  // MARK: - Public API

  public func upload(
    progress progressHandler: (@Sendable (HotlineTransferProgress) -> Void)? = nil
  ) async throws {
    self.uploadTask?.cancel()

    let task = Task<Void, Error> {
      try await performUpload(progressHandler: progressHandler)
    }
    self.uploadTask = task

    do {
      try await task.value
      self.uploadTask = nil
    } catch {
      print("HotlineFileUploadClientNew[\(referenceNumber)]: Failed to upload file: \(error)")
      self.uploadTask = nil
      progressHandler?(.error(error))
      throw error
    }
  }

  /// Cancel the current upload
  public func cancel() {
    uploadTask?.cancel()
    uploadTask = nil

    if let socket = socket {
      Task {
        await socket.close()
      }
    }
  }

  // MARK: - Private Implementation

  private func updateProgress(sent: Int, speed: Double? = nil, estimate: TimeInterval? = nil) {
    self.transferSize = sent
    self.transferProgress.completedUnitCount = Int64(sent)

    if self.transferProgress.isCancelled {
      self.cancel()
    }
  }

  private func performUpload(
    progressHandler: (@Sendable (HotlineTransferProgress) -> Void)?
  ) async throws {
    let filename = self.fileURL.lastPathComponent

    progressHandler?(.connecting)

    // Start accessing security-scoped resource
    let didStartAccess = fileURL.startAccessingSecurityScopedResource()
    defer {
      if didStartAccess {
        fileURL.stopAccessingSecurityScopedResource()
      }
    }

    // Connect to transfer server
    let socket = try await connectToTransferServer()
    self.socket = socket
    defer { Task { await socket.close() } }

    // Get file metadata
    guard let infoFork = HotlineFileInfoFork(file: fileURL) else {
      throw HotlineFileClientError.failedToTransfer
    }

    guard let header = HotlineFileHeader(file: fileURL) else {
      throw HotlineFileClientError.failedToTransfer
    }

    guard let forkSizes = try? FileManager.default.getFileForkSizes(fileURL) else {
      throw HotlineFileClientError.failedToTransfer
    }

    let infoForkData = infoFork.data()
    let dataForkSize = forkSizes.dataForkSize
    let resourceForkSize = forkSizes.resourceForkSize

    print("HotlineFileUploadClientNew[\(referenceNumber)]: File has dataFork=\(dataForkSize) bytes, resourceFork=\(resourceForkSize) bytes")
    
    // Connected
    progressHandler?(.connected)

    // Send magic header
    print("HotlineFileUploadClientNew[\(referenceNumber)]: Sending magic header")
    try await socket.write(Data(endian: .big) {
      "HTXF".fourCharCode()
      self.referenceNumber
      UInt32(self.transferTotal)
      UInt32.zero
    })

    var totalBytesSent = 0

    // Send file header
    print("HotlineFileUploadClientNew[\(referenceNumber)]: Sending file header")
    let headerData = header.data()
    try await socket.write(headerData)
    totalBytesSent += headerData.count

    // Send INFO fork header
    print("HotlineFileUploadClientNew[\(referenceNumber)]: Sending INFO fork header")
    let infoForkHeader = HotlineFileForkHeader(type: HotlineFileForkType.info.rawValue, dataSize: UInt32(infoForkData.count))
    try await socket.write(infoForkHeader.data())
    totalBytesSent += HotlineFileForkHeader.DataSize

    // Send INFO fork data
    print("HotlineFileUploadClientNew[\(referenceNumber)]: Sending INFO fork (\(infoForkData.count) bytes)")
    try await socket.write(infoForkData)
    totalBytesSent += infoForkData.count

    self.updateProgress(sent: totalBytesSent)
    progressHandler?(.transfer(name: filename, size: self.transferSize, total: self.transferTotal, progress: self.transferProgress.fractionCompleted, speed: nil, estimate: nil))

    // Configure progress for Finder if enabled
    if config.publishProgress {
      self.transferProgress.fileURL = fileURL.resolvingSymlinksInPath()
      self.transferProgress.fileOperationKind = .uploading
      self.transferProgress.publish()
    }

    // Send DATA fork if present
    if dataForkSize > 0 {
      print("HotlineFileUploadClientNew[\(referenceNumber)]: Sending DATA fork header")
      let dataForkHeader = HotlineFileForkHeader(type: HotlineFileForkType.data.rawValue, dataSize: dataForkSize)
      try await socket.write(dataForkHeader.data())
      totalBytesSent += HotlineFileForkHeader.DataSize

      // Stream DATA fork
      print("HotlineFileUploadClientNew[\(referenceNumber)]: Streaming DATA fork (\(dataForkSize) bytes)")
      let fileHandle = try FileHandle(forReadingFrom: fileURL)
      defer { try? fileHandle.close() }

      let updates = await socket.writeFile(from: fileHandle, length: Int(dataForkSize))
      for try await p in updates {
        let bytesSentNow = totalBytesSent + p.sent
        self.updateProgress(sent: bytesSentNow, speed: p.bytesPerSecond, estimate: p.estimatedTimeRemaining)
        progressHandler?(.transfer(name: filename, size: bytesSentNow, total: self.transferTotal, progress: self.transferProgress.fractionCompleted, speed: p.bytesPerSecond, estimate: p.estimatedTimeRemaining))
      }

      totalBytesSent += Int(dataForkSize)
    }

    // Send RESOURCE fork if present
    if resourceForkSize > 0 {
      let resourceURL = fileURL.urlForResourceFork()

      print("HotlineFileUploadClientNew[\(referenceNumber)]: Sending RESOURCE fork header")
      let resourceForkHeader = HotlineFileForkHeader(type: HotlineFileForkType.resource.rawValue, dataSize: resourceForkSize)
      try await socket.write(resourceForkHeader.data())
      totalBytesSent += HotlineFileForkHeader.DataSize

      // Stream RESOURCE fork
      print("HotlineFileUploadClientNew[\(referenceNumber)]: Streaming RESOURCE fork (\(resourceForkSize) bytes)")
      let resourceHandle = try FileHandle(forReadingFrom: resourceURL)
      defer { try? resourceHandle.close() }

      let updates = await socket.writeFile(from: resourceHandle, length: Int(resourceForkSize))
      for try await p in updates {
        let bytesSentNow = totalBytesSent + p.sent
        self.updateProgress(sent: bytesSentNow, speed: p.bytesPerSecond, estimate: p.estimatedTimeRemaining)
        progressHandler?(.transfer(name: filename, size: bytesSentNow, total: self.transferTotal, progress: self.transferProgress.fractionCompleted, speed: p.bytesPerSecond, estimate: p.estimatedTimeRemaining))
      }

      totalBytesSent += Int(resourceForkSize)
    }

    self.transferProgress.unpublish()
    progressHandler?(.completed(url: nil))

    print("HotlineFileUploadClientNew[\(referenceNumber)]: Upload complete!")
  }

  // MARK: - Helper Methods

  private func connectToTransferServer() async throws -> NetSocketNew {
    guard let transferPort = NWEndpoint.Port(rawValue: serverPort + 1) else {
      throw NetSocketError.invalidPort
    }

    print("HotlineFileUploadClientNew[\(referenceNumber)]: Connecting to \(serverAddress):\(serverPort + 1)")

    let socket = try await NetSocketNew.connect(
      host: .name(serverAddress, nil),
      port: transferPort,
      tls: .disabled
    )

    print("HotlineFileUploadClientNew[\(referenceNumber)]: Connected!")
    return socket
  }
}
