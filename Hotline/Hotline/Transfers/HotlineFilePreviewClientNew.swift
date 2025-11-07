import Foundation
import Network

@MainActor
public class HotlineFilePreviewClientNew {
  // MARK: - Properties

  private let serverAddress: String
  private let serverPort: UInt16
  private let referenceNumber: UInt32
  private let fileName: String
  private let transferSize: UInt32

  private var downloadClient: HotlineFileDownloadClientNew?
  private var previewTask: Task<URL, Error>?
  private var temporaryFileURL: URL?

  // MARK: - Initialization

  public init(
    fileName: String,
    address: String,
    port: UInt16,
    reference: UInt32,
    size: UInt32
  ) {
    self.fileName = fileName
    self.serverAddress = address
    self.serverPort = port
    self.referenceNumber = reference
    self.transferSize = size
  }

  deinit {
    // Cleanup in deinit - must be synchronous
    if let tempURL = temporaryFileURL {
      try? FileManager.default.removeItem(at: tempURL)
    }
  }

  // MARK: - Public API

  /// Download file to temporary location for preview
  /// - Parameter progressHandler: Optional progress callback
  /// - Returns: URL to temporary file for preview
  public func preview(
    progress progressHandler: (@Sendable (HotlineTransferProgress) -> Void)? = nil
  ) async throws -> URL {
    self.previewTask?.cancel()

    let task = Task<URL, Error> {
      try await performPreview(progressHandler: progressHandler)
    }
    self.previewTask = task

    do {
      let url = try await task.value
      self.previewTask = nil
      return url
    } catch {
      print("HotlineFilePreviewClientNew[\(referenceNumber)]: Failed to preview file: \(error)")
      self.previewTask = nil
      progressHandler?(.error(error))
      throw error
    }
  }

  /// Cancel the current preview download
  public func cancel() {
    self.previewTask?.cancel()
    self.previewTask = nil
    self.downloadClient?.cancel()
  }

  /// Manually cleanup temporary file
  /// Call this when preview is complete and you no longer need the file
  public func cleanup() {
    self.cleanupTempFile()
  }

  // MARK: - Private Implementation

  private func performPreview(
    progressHandler: (@Sendable (HotlineTransferProgress) -> Void)?
  ) async throws -> URL {

    // Create temporary file path directly in system temp directory
    let tempDir = FileManager.default.temporaryDirectory
    let uniqueFileName = "\(UUID().uuidString)_\(self.fileName)"
    let tempFileURL = tempDir.appendingPathComponent(uniqueFileName)
    self.temporaryFileURL = tempFileURL

    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Downloading to temp: \(tempFileURL.path)")

    progressHandler?(.connecting)

    // Connect to transfer server
    guard let transferPort = NWEndpoint.Port(rawValue: serverPort + 1) else {
      throw NetSocketError.invalidPort
    }

    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Connecting to \(serverAddress):\(serverPort + 1)")

    let socket = try await NetSocketNew.connect(
      host: .name(serverAddress, nil),
      port: transferPort,
      tls: .disabled
    )
    defer { Task { await socket.close() } }

    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Connected!")

    // Send magic header for raw data download
    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Sending magic header")
    try await socket.write(Data(endian: .big) {
      "HTXF".fourCharCode()
      self.referenceNumber
      UInt32.zero
      UInt32.zero
    })

    progressHandler?(.connected)

    // Stream raw data directly to temp file with progress tracking
    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Streaming \(transferSize) bytes to temp file")

    let totalSize = Int(transferSize)

    // Create empty file
    FileManager.default.createFile(atPath: tempFileURL.path(percentEncoded: false), contents: nil)

    let fileHandle = try FileHandle(forWritingTo: tempFileURL)
    defer { try? fileHandle.close() }

    let updates = await socket.receiveFile(to: fileHandle, length: totalSize)
    for try await p in updates {
      progressHandler?(.transfer(
        name: uniqueFileName,
        size: p.sent,
        total: totalSize,
        progress: totalSize > 0 ? Double(p.sent) / Double(totalSize) : 0.0,
        speed: p.bytesPerSecond,
        estimate: p.estimatedTimeRemaining
      ))
    }

    progressHandler?(.completed(url: tempFileURL))

    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Preview file ready at \(tempFileURL.path)")

    return tempFileURL
  }

  private func cleanupTempFile() {
    guard let tempURL = temporaryFileURL else { return }

    // Delete the temp file
    try? FileManager.default.removeItem(at: tempURL)

    temporaryFileURL = nil
    print("HotlineFilePreviewClientNew[\(referenceNumber)]: Cleaned up temp file")
  }
}
