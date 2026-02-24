import SwiftUI

struct NotificationSettingsView: View {
  var body: some View {
    @Bindable var preferences = Prefs.shared

    Form {
      Toggle("Private Messages", isOn: $preferences.showPrivateMessageNotifications)
      Toggle("Mentions", isOn: $preferences.showMentionNotifications)
      Toggle("Highlighted Words", isOn: $preferences.showWatchWordNotifications)
    }
    .formStyle(.grouped)
    .frame(width: 392, height: 200)
  }
}
