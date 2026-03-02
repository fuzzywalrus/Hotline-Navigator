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

        Label("General", systemImage: "gearshape")
          .tag(Section.general)
        Label("Chat", systemImage: "bubble.left")
          .tag(Section.chat)
        Label("Sounds", systemImage: "speaker.wave.3")
          .tag(Section.sound)
        Label("Notifications", systemImage: "bell")
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
