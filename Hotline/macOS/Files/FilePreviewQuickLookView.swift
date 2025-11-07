//
//  FilePreviewQuickLookView.swift
//  Hotline
//
//  QuickLook-based file preview window for all supported file types
//

import SwiftUI
import UniformTypeIdentifiers

struct FilePreviewQuickLookView: View {
  enum FilePreviewFocus: Hashable {
    case window
  }

  @Environment(\.controlActiveState) private var controlActiveState
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.dismiss) var dismiss

  @Binding var info: PreviewFileInfo?
  @State var preview: FilePreviewState? = nil
  @FocusState private var focusField: FilePreviewFocus?

  var body: some View {
    Group {
      if preview?.state != .loaded {
        VStack(alignment: .center, spacing: 0) {
          Spacer()
          ProgressView(value: max(0.0, min(1.0, preview?.progress ?? 0.0)))
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
      else {
        if let fileURL = preview?.fileURL {
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
    }
    .focusable()
    .focusEffectDisabled()
    .background(Color(nsColor: .textBackgroundColor))
    .focused($focusField, equals: .window)
    .navigationTitle(info?.name ?? "File Preview")
    .background(
        WindowConfigurator { window in
          if let fileURL = preview?.fileURL {
            window.representedURL = fileURL
            window.standardWindowButton(.documentIconButton)?.isHidden = false
          }
        }
      )
    .toolbar {
      if let _ = preview?.fileURL {
        if let info = info {
          ToolbarItem(placement: .primaryAction) {
            Button {
              if let fileURL = preview?.fileURL,
                 let data = try? Data(contentsOf: fileURL) {
                let _ = data.saveAsFileToDownloads(filename: info.name)
              }
            } label: {
              Label("Download File...", systemImage: "arrow.down")
            }
            .help("Download File")
          }
        }
      }
    }
    .task {
      if let info = info {
        preview = FilePreviewState(info: info)
        preview?.download()
      }
    }
    .onAppear {
      if info == nil {
        Task {
          dismiss()
        }
        return
      }

      focusField = .window
    }
    .onDisappear {
      preview?.cancel()
      dismiss()
    }
    .onChange(of: preview?.state) {
      if preview?.state == .failed {
        dismiss()
      }
    }
    .preferredColorScheme(.dark)
  }
}
