import SwiftUI
import UniformTypeIdentifiers

struct FilePreviewQuickLookView: View {
  enum FilePreviewFocus: Hashable {
    case window
  }

  @Environment(\.controlActiveState) private var controlActiveState
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.dismiss) private var dismiss

  @Binding var info: PreviewFileInfo?
  @State private var preview: FilePreviewState? = nil
  
  @FocusState private var focusField: FilePreviewFocus?

  var body: some View {
    Group {
      if self.preview?.state == .failed {
        VStack(alignment: .center, spacing: 0) {
          Spacer()

          Image(systemName: "exclamationmark.triangle")
            .resizable()
            .scaledToFit()
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .foregroundStyle(.secondary)
            .padding(.bottom)
          Group {
            Text("Preview Failed")
              .bold()
            Text("The file could not be downloaded for preview.")
              .foregroundStyle(Color.secondary)
          }
          .font(.system(size: 14.0))
          .frame(maxWidth: 300)
          .multilineTextAlignment(.center)

          Spacer()
          Spacer()
        }
        .frame(minWidth: 350, maxWidth: .infinity, minHeight: 150, maxHeight: .infinity)
        .padding()
      }
      else if self.preview?.state == .loaded {
        if let fileURL = self.preview?.fileURL {
          QuickLookPreviewView(fileURL: fileURL)
            .frame(minWidth: 400, maxWidth: .infinity, minHeight: 400, maxHeight: .infinity)
        }
        else {
          VStack(alignment: .center, spacing: 0) {
            Spacer()

            Image(systemName: "eye.trianglebadge.exclamationmark")
              .resizable()
              .scaledToFit()
              .frame(maxWidth: .infinity)
              .frame(height: 48)
              .padding(.bottom)
            Group {
              Text("This file type is not previewable")
                .bold()
              Text("Try downloading and opening this file in another application.")
                .foregroundStyle(Color.secondary)
            }
            .font(.system(size: 14.0))
            .frame(maxWidth: 300)
            .multilineTextAlignment(.center)

            Spacer()
            Spacer()
          }
          .frame(minWidth: 350, maxWidth: .infinity, minHeight: 150, maxHeight: .infinity)
          .padding()
        }
      }
      else {
        VStack(alignment: .center, spacing: 0) {
          Spacer()
          ProgressView(value: max(0.0, min(1.0, self.preview?.progress ?? 0.0)))
            .focusable(false)
            .progressViewStyle(.circular)
            .controlSize(.extraLarge)
            .frame(maxWidth: 300, alignment: .center)
            .padding(.bottom, 48)
          Spacer()
        }
        .background(Color(nsColor: .textBackgroundColor))
        .frame(minWidth: 350, maxWidth: .infinity, minHeight: 150, maxHeight: .infinity)
        .padding()
      }
    }
    .focusable()
    .focusEffectDisabled()
    .background(Color(nsColor: .textBackgroundColor))
    .focused(self.$focusField, equals: .window)
    .navigationTitle(self.info?.name ?? "File Preview")
    .applyNavigationDocumentIfPresent(self.preview?.fileURL)
    .toolbar {
      if let fileURL = self.preview?.fileURL {
        if let info = info {
          ToolbarItem(placement: .primaryAction) {
            Button {
              FileManager.default.copyToDownloads(from: fileURL, using: info.name, bounceDock: true)
            } label: {
              Label("Download File...", systemImage: "arrow.down")
            }
            .help("Download File")
          }
        }
      }
    }
    .task {
      if let info = self.info {
        self.preview = FilePreviewState(info: info)
        self.preview?.download()
      }
    }
    .onAppear {
      guard self.info != nil else {
        self.dismiss()
        return
      }

      self.focusField = .window
    }
    .onDisappear {
      self.preview?.cancel()
      self.preview?.cleanup()
      self.dismiss()
    }
    .preferredColorScheme(.dark)
  }
}
