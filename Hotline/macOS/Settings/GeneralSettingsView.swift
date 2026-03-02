import SwiftUI

struct GeneralSettingsView: View {
  private struct AppIconOption: Identifiable {
    var id: String
    var name: String
    var imageName: String?
  }

  private let icons: [AppIconOption] = [
    AppIconOption(id: "", name: "Default", imageName: nil),
    AppIconOption(id: "App Icons/Aqua", name: "Aqua", imageName: "App Icons/Aqua"),
  ]

  var body: some View {
    @Bindable var preferences = Prefs.shared

    Form {
      Toggle("Refuse private messages", isOn: $preferences.refusePrivateMessages)
      Toggle("Refuse private chat invites", isOn: $preferences.refusePrivateChat)
      Toggle("Automatic Response", isOn: $preferences.enableAutomaticMessage)
      if preferences.enableAutomaticMessage {
        TextField("", text: $preferences.automaticMessage, prompt: Text("Write a response message"))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity)
      }

      Section("Downloads") {
        HStack(spacing: 4) {
          VStack(alignment: .leading, spacing: 4) {
            Text("Download files to:")
            HStack(spacing: 4) {
              Image(nsImage: NSWorkspace.shared.icon(forFile: preferences.resolvedDownloadFolder.resolvingSymlinksInPath().path))
                .resizable()
                .frame(width: 16, height: 16)
              Text(preferences.downloadFolderDisplay ?? "Downloads")
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
            }
          }

          Spacer()

          Button("Change…") {
            let panel = NSOpenPanel()
            panel.canChooseFiles = false
            panel.canChooseDirectories = true
            panel.allowsMultipleSelection = false
            panel.message = "Choose a location for your downloads"
            if panel.runModal() == .OK, let url = panel.url {
              if url.standardizedFileURL == URL.downloadsDirectory.standardizedFileURL {
                preferences.downloadFolderBookmark = nil
              } else if let bookmark = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) {
                preferences.downloadFolderBookmark = bookmark
              }
            }
          }
          .buttonBorderShape(.capsule)
          .controlSize(.small)
          if preferences.downloadFolderDisplay != nil {
            Button("Reset") {
              preferences.downloadFolderBookmark = nil
            }
            .buttonBorderShape(.capsule)
            .controlSize(.small)
          }
        }
      }

      Section("App Icon") {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 16) {
            ForEach(self.icons) { icon in
              VStack(spacing: 6) {
                Group {
                  if let imageName = icon.imageName, let image = NSImage(named: imageName) {
                    Image(nsImage: image)
                      .resizable()
                      .scaledToFit()
                  } else {
                    Image(nsImage: NSApp.applicationIconImage)
                      .resizable()
                      .scaledToFit()
                  }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.15), radius: 2, y: 1)

                Text(icon.name)
                  .font(.caption)
                  .foregroundStyle(preferences.appIcon == icon.id ? .white : .secondary)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 2)
                  .background {
                    if preferences.appIcon == icon.id {
                      Capsule()
                        .fill(Color.accentColor)
                    }
                  }
              }
              .onTapGesture {
                preferences.appIcon = icon.id
                AppIconManager.apply()
              }
            }
          }
          .padding()
        }
      }
    }
    .formStyle(.grouped)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}
