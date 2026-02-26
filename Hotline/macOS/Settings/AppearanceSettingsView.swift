import SwiftUI

struct AppearanceSettingsView: View {
  struct AppIconOption: Identifiable {
    var id: String
    var name: String
    var imageName: String?
  }

  private let icons: [AppIconOption] = [
    AppIconOption(id: "", name: "Default", imageName: nil),
    AppIconOption(id: "App Icons/Aqua", name: "Aqua", imageName: "App Icons/Aqua"),
  ]

  @Bindable private var preferences = Prefs.shared

  var body: some View {
    Form {
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
                  .foregroundStyle(self.preferences.appIcon == icon.id ? .white : .secondary)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 2)
                  .background {
                    if self.preferences.appIcon == icon.id {
                      Capsule()
                        .fill(Color.accentColor)
                    }
                  }
              }
              .onTapGesture {
                self.preferences.appIcon = icon.id
                AppIconManager.apply()
              }
            }
          }
          .padding()
        }
      }
    }
    .formStyle(.grouped)
    .frame(width: 392, height: 200)
  }
}

#Preview {
  AppearanceSettingsView()
}
