import SwiftUI

struct SettingsView: View {
  private enum Section: Hashable {
    case identity, general, chat, sound, notifications
  }

  @State private var selection: Section = .identity
  private var preferences = Prefs.shared

  var body: some View {
    NavigationSplitView {
      List(selection: self.$selection) {
        Label {
          Text(self.preferences.username.isEmpty ? "Identity" : self.preferences.username)
        } icon: {
          Image("Classic/\(self.preferences.userIconID)")
            .interpolation(.none)
        }
        .tag(Section.identity)

        Divider()

        Label {
          Text("General")
        } icon: {
          Image("Settings/General")
            .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
        }
        .tag(Section.general)
        Label {
          Text("Chat")
        } icon: {
          Image("Settings/Chat")
            .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
        }
        .tag(Section.chat)
        Label {
          Text("Sounds")
        } icon: {
          Image("Settings/Sounds")
            .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
        }
        .tag(Section.sound)
        Label {
          Text("Notifications")
        } icon: {
          Image("Settings/Notifications")
            .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
        }
        .tag(Section.notifications)
      }
      .listStyle(.sidebar)
      .navigationSplitViewColumnWidth(180)
    } detail: {
      switch self.selection {
      case .identity:
        IdentitySettingsView()
      case .general:
        GeneralSettingsView()
      case .chat:
        ChatSettingsView()
      case .sound:
        SoundSettingsView()
      case .notifications:
        NotificationSettingsView()
      }
    }
  }
}

#Preview {
  SettingsView()
}
