//
//  FilePreviewState.swift
//  Hotline
//
//  Modern file preview state using HotlineFilePreviewClientNew
//

import SwiftUI
import UniformTypeIdentifiers

// MARK: - Preview Type

enum FilePreviewType: Equatable {
  case unknown
  case image
  case text
}

/// State for a file preview download
@MainActor
@Observable
final class FilePreviewState {
  // MARK: - Properties

  let info: PreviewFileInfo

  private var previewClient: HotlineFilePreviewClientNew?
  private var previewTask: Task<Void, Never>?

  var state: LoadState = .unloaded
  var progress: Double = 0.0

  var fileURL: URL? = nil

  #if os(iOS)
  var image: UIImage? = nil
  #elseif os(macOS)
  var image: NSImage? = nil
  #endif

  var text: String? = nil
  var styledText: NSAttributedString? = nil

  // MARK: - Computed Properties

  var previewType: FilePreviewType {
    info.previewType
  }

  // MARK: - Initialization

  init(info: PreviewFileInfo) {
    self.info = info
  }

  nonisolated deinit {
    // Note: Can't access @MainActor properties from deinit
    // Cleanup will happen when previewClient is deallocated
  }

  // MARK: - Public API

  func download() {
    // Cancel any existing download
    previewTask?.cancel()
    previewClient?.cleanup()

    let task = Task { @MainActor in
      do {
        let client = HotlineFilePreviewClientNew(
          fileName: info.name,
          address: info.address,
          port: UInt16(info.port),
          reference: info.id,
          size: UInt32(info.size)
        )
        self.previewClient = client

        self.state = .loading
        self.progress = 0.0

        let url = try await client.preview { [weak self] progress in
          guard let self else { return }

          Task { @MainActor in
            switch progress {
            case .preparing:
              self.state = .loading
              self.progress = 0.0
              
            case .connecting:
              self.state = .loading
              self.progress = 0.0

            case .connected:
              self.state = .loading
              self.progress = 0.0

            case .transfer(name: _, size: _, total: _, progress: let p, speed: _, estimate: _):
              self.state = .loading
              self.progress = p

            case .completed(url: let url):
              self.state = .loaded
              self.progress = 1.0
              self.fileURL = url
//              self.loadPreview(from: url)

            case .error(let error):
              self.state = .failed
              self.progress = 0.0
              print("FilePreviewState: Download failed: \(error)")

            case .unconnected:
              break
            }
          }
        }

        // Final load if not already loaded
        if self.state != .loaded {
          self.state = .loaded
          self.progress = 1.0
          self.fileURL = url
//          self.loadPreview(from: url)
        }

      } catch is CancellationError {
        // Cancelled, do nothing
        return
      } catch {
        self.state = .failed
        self.progress = 0.0
        print("FilePreviewState: Download error: \(error)")
      }
    }

    self.previewTask = task
  }

  func cancel() {
    previewTask?.cancel()
    previewTask = nil
    previewClient?.cancel()
  }

  func cleanup() {
    previewClient?.cleanup()
    previewClient = nil
    fileURL = nil
    image = nil
    text = nil
    styledText = nil
  }

  // MARK: - Private Implementation

  private func loadPreview(from url: URL) {
    guard let data = try? Data(contentsOf: url) else {
      self.state = .failed
      print("FilePreviewState: Failed to read preview data from \(url.path)")
      return
    }

    switch self.previewType {
    case .image:
      #if os(iOS)
      self.image = UIImage(data: data)
      #elseif os(macOS)
      self.image = NSImage(data: data)
      #endif

      if self.image == nil {
        self.state = .failed
        print("FilePreviewState: Failed to create image from data")
      }

    case .text:
      let encoding: UInt = NSString.stringEncoding(for: data, convertedString: nil, usedLossyConversion: nil)
      if encoding != 0 {
        self.text = String(data: data, encoding: String.Encoding(rawValue: encoding))
      } else {
        self.text = String(data: data, encoding: .utf8)
      }

      if self.text == nil {
        self.state = .failed
        print("FilePreviewState: Failed to decode text data")
      }

    case .unknown:
      print("FilePreviewState: Unknown preview type for \(info.name)")
      break
    }
  }
}

// MARK: - Load State

extension FilePreviewState {
  enum LoadState: Equatable {
    case unloaded
    case loading
    case loaded
    case failed
  }
}
