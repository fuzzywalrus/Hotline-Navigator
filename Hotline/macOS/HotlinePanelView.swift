import SwiftUI

struct HotlinePanelView: View {
  @Environment(\.openWindow) var openWindow
  @Environment(\.colorScheme) var colorScheme
  @Environment(\.appState) private var appState

  private var activeServerState: ServerState? {
    self.appState.activeServerState
  }

  private var activeHotline: HotlineState? {
    self.appState.activeHotline
  }

  private var bannerImage: Image {
    self.activeHotline?.bannerImage ?? Image("Default Banner")
  }

  private var backgroundColor: Color {
    Color(nsColor: self.activeHotline?.bannerColors?.backgroundColor ?? NSColor.controlBackgroundColor)
  }

  var body: some View {
    VStack(spacing: 0) {
      self.bannerImage
        .interpolation(.high)
        .resizable()
        .scaledToFill()
        .frame(width: 468, height: 60)
        .frame(minWidth: 468, maxWidth: 468, minHeight: 60, maxHeight: 60)
        .clipped()
        .background(.black)
        .animation(.default, value: self.bannerImage)
      
      HStack(spacing: 12) {
        Button {
          if NSEvent.modifierFlags.contains(.option) {
            openWindow(id: "server")
          }
          else {
            openWindow(id: "servers")
          }
        }
        label: {
          Image("Section Servers")
            .resizable()
            .scaledToFit()
        }
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .help("Hotline Servers")

        Button {
          self.activeServerState?.selection = .chat
        }
        label: {
          Image("Section Chat")
            .resizable()
            .scaledToFit()
        }
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .disabled(self.activeServerState == nil)
        .help("Public Chat")

        Button {
          self.activeServerState?.selection = .board
        }
        label: {
          Image("Section Board")
            .resizable()
            .scaledToFit()
        }
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .disabled(self.activeServerState == nil)
        .help("Message Board")

        Button {
          self.activeServerState?.selection = .news
        }
        label: {
          Image("Section News")
            .resizable()
            .scaledToFit()
        }
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .disabled(self.activeServerState == nil || (self.activeHotline?.serverVersion ?? 0) < 151)
        .help("News")

        Button {
          self.activeServerState?.selection = .files
        }
        label: {
          Image("Section Files")
            .resizable()
            .scaledToFit()
        }
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .disabled(self.activeServerState == nil)
        .help("Files")

        Spacer()

        if self.activeHotline?.access?.contains(.canOpenUsers) == true {
          Button {
            self.activeServerState?.selection = .accounts
          }
          label: {
            Image("Section Users")
              .resizable()
              .scaledToFit()
          }
          .buttonStyle(.plain)
          .frame(width: 20, height: 20)
          .disabled(self.activeServerState == nil)
          .help("Accounts")
        }

        SettingsLink(label: {
          Image("Section Settings")
            .resizable()
            .scaledToFit()
        })
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .help("Settings")
      }
      .padding(.top, 12)
      .padding(.bottom, 12)
      .padding([.leading, .trailing], 12)
      .background(self.backgroundColor)
      .foregroundStyle(.primary)
      .animation(.default, value: self.backgroundColor)
      
//      GroupBox {
//        HStack(spacing: 0) {
//          Text("Not Connected")
//            .font(.system(size: 10.0))
//            .lineLimit(1)
//            .truncationMode(.tail)
//            .opacity(0.5)
//            .padding(.vertical, 0.0)
//            .padding(.horizontal, 4.0)
//          
//          Spacer()
//        }
//      }
//      .padding([.leading, .bottom, .trailing], 4.0)
    }
//    .frame(width: 468)
//    .background(colorScheme == .dark ? .black : .white)
//    .background(
//      VisualEffectView(material: .headerView, blendingMode: .behindWindow)
//        .cornerRadius(10.0)
//    )
  }
}

#Preview {
  HotlinePanelView()
    .environment(HotlineState())
}
