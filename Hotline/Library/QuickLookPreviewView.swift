import SwiftUI
import Quartz

/// Embeddable QuickLook preview view for macOS
///
/// This view uses QLPreviewView to display file previews inline, without showing a modal.
/// Supports all file types that QuickLook supports (images, PDFs, videos, documents, etc.)
struct QuickLookPreviewView: NSViewRepresentable {
  let fileURL: URL

  func makeNSView(context: Context) -> QLPreviewView {
    let preview = QLPreviewView(frame: .zero, style: .normal)!
    preview.autostarts = true
    preview.shouldCloseWithWindow = true
    preview.previewItem = fileURL as QLPreviewItem
    return preview
  }

  func updateNSView(_ nsView: QLPreviewView, context: Context) {
    nsView.previewItem = fileURL as QLPreviewItem
  }
}
