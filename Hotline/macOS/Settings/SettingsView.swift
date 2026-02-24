import SwiftUI

struct SettingsView: View {
  private enum Tabs: Hashable {
    case identity, general, chat, sound, notifications
  }

  @State private var selectedTab: Tabs = .identity

  var body: some View {
    TabView(selection: self.$selectedTab) {
      Tab("Identity", systemImage: "person", value: .identity) {
        IdentitySettingsView()
      }
      Tab("General", systemImage: "gearshape", value: .general) {
        GeneralSettingsView()
      }
      Tab("Chat", systemImage: "bubble.left", value: .chat) {
        ChatSettingsView()
      }
      Tab("Sounds", systemImage: "speaker.wave.3", value: .sound) {
        SoundSettingsView()
      }
      Tab("Notifications", systemImage: "bell", value: .notifications) {
        NotificationSettingsView()
      }
    }
    .tabViewStyle(.sidebarAdaptable)
  }
}

#Preview {
  SettingsView()
}
