import SwiftUI

struct SettingsView: View {
  private enum Tabs: Hashable {
    case identity, appearance, general, chat, sound, notifications
  }

  @State private var selectedTab: Tabs = .identity

  var body: some View {
    TabView(selection: self.$selectedTab) {
      Tab("General", systemImage: "gearshape", value: .general) {
        GeneralSettingsView()
      }
      Tab("Identity", systemImage: "face.smiling", value: .identity) {
        IdentitySettingsView()
      }
      Tab("Appearance", systemImage: "paintbrush", value: .appearance) {
        AppearanceSettingsView()
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
