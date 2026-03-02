import SwiftUI

private struct SoundToggleRow: View {
  let label: String
  @Binding var isOn: Bool
  let sound: SoundEffect

  init(_ label: String, isOn: Binding<Bool>, sound: SoundEffect) {
    self.label = label
    self._isOn = isOn
    self.sound = sound
  }

  var body: some View {
    HStack {
      Text(self.label)
      Spacer()
      Button {
        SoundEffects.play(self.sound)
      } label: {
        Image(systemName: "speaker.wave.2")
      }
      .buttonStyle(.borderless)
      Toggle("", isOn: self.$isOn)
        .labelsHidden()
        .fixedSize()
    }
  }
}

struct SoundSettingsView: View {
  var body: some View {
    @Bindable var preferences = Prefs.shared

    Form {
      Toggle("Enable Sounds", isOn: $preferences.playSounds)

      Section("Sounds") {
        SoundToggleRow("Chat", isOn: $preferences.playChatSound, sound: .chatMessage)
          .disabled(!preferences.playSounds)

        SoundToggleRow("File Transfers", isOn: $preferences.playFileTransferCompleteSound, sound: .transferComplete)
          .disabled(!preferences.playSounds)

        SoundToggleRow("Private Message", isOn: $preferences.playPrivateMessageSound, sound: .serverMessage)
          .disabled(!preferences.playSounds)

        SoundToggleRow("Join", isOn: $preferences.playJoinSound, sound: .userLogin)
          .disabled(!preferences.playSounds)

        SoundToggleRow("Leave", isOn: $preferences.playLeaveSound, sound: .userLogout)
          .disabled(!preferences.playSounds)

        SoundToggleRow("Logged in", isOn: $preferences.playLoggedInSound, sound: .loggedIn)
          .disabled(!preferences.playSounds)

        SoundToggleRow("Error", isOn: $preferences.playErrorSound, sound: .error)
          .disabled(!preferences.playSounds)

        SoundToggleRow("Chat Invitation", isOn: $preferences.playChatInvitationSound, sound: .serverMessage)
          .disabled(!preferences.playSounds)
      }
    }
    .formStyle(.grouped)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}
