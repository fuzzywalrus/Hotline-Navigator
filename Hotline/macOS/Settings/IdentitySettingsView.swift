import SwiftUI

struct IdentitySettingsView: View {
  @State private var username: String = ""
  @State private var usernameChanged: Bool = false
  @State private var hoveredUserIconID: Int = -1

  let saveTimer = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

  var body: some View {
    @Bindable var preferences = Prefs.shared

    Form {
      TextField("Your Name", text: self.$username, prompt: Text("guest"))

      Section("Icon") {
        ScrollViewReader { scrollProxy in
          ScrollView {
            LazyVGrid(columns: [
              GridItem(.fixed(4+32+4)),
              GridItem(.fixed(4+32+4)),
              GridItem(.fixed(4+32+4)),
              GridItem(.fixed(4+32+4)),
              GridItem(.fixed(4+32+4)),
              GridItem(.fixed(4+32+4)),
              GridItem(.fixed(4+32+4))
            ], spacing: 0) {
              ForEach(HotlineState.classicIconSet, id: \.self) { iconID in
                HStack {
                  Image("Classic/\(iconID)")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 32, height: 16)
                    .help("Icon \(String(iconID))")
                }
                .tag(iconID)
                .frame(width: 32, height: 32)
                .padding(4)
                .background(iconID == preferences.userIconID ? Color.accentColor : (iconID == self.hoveredUserIconID ? Color.accentColor.opacity(0.1) : Color(nsColor: .textBackgroundColor)))
                .clipShape(RoundedRectangle(cornerRadius: 5))
                .onTapGesture {
                  preferences.userIconID = iconID
                }
                .onHover { hovered in
                  if hovered {
                    self.hoveredUserIconID = iconID
                  }
                }
              }
            }
            .padding()
          }
          .background(Color(nsColor: .textBackgroundColor))
          .clipShape(RoundedRectangle(cornerRadius: 6))
          .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(nsColor: .separatorColor), lineWidth: 1))
          .onAppear {
            scrollProxy.scrollTo(preferences.userIconID, anchor: .center)
          }
          .frame(height: 300)
        }
      }
    }
    .formStyle(.grouped)
    .frame(width: 392, height: 440)
    .onAppear {
      self.username = preferences.username
      self.usernameChanged = false
    }
    .onDisappear {
      preferences.username = self.username
      self.usernameChanged = false
    }
    .onChange(of: self.username) { oldValue, newValue in
      self.usernameChanged = true
    }
    .onReceive(self.saveTimer) { _ in
      if self.usernameChanged {
        self.usernameChanged = false
        preferences.username = self.username
      }
    }
  }
}
