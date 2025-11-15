import SwiftUI

struct MessageView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.colorScheme) private var colorScheme
  
  @State private var input: String = ""
  @State private var scrollPos: Int?
  @State private var contentHeight: CGFloat = 0
  @State private var userInfo: HotlineUserClientInfo?
  @State private var disconnectConfirmShown: Bool = false
  @State private var username: String?
  
  @Namespace private var bottomID
  @FocusState private var focusedField: FocusedField?
  
  var userID: UInt16
    
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      
      // MARK: Scroll View
      self.messageList
      
      // MARK: Input Divider
      Divider()
      
      // MARK: Input Bar
      self.inputBar
    }
    .background(Color(nsColor: .textBackgroundColor))
    .onAppear {
      self.model.markInstantMessagesAsRead(userID: self.userID)
      
      let user = self.model.users.first(where: { $0.id == self.userID })
      self.username = user?.name
    }
    
    .onAppear {
      self.model.markInstantMessagesAsRead(userID: userID)
    }
    .toolbar {
      if self.model.access?.contains(.canGetClientInfo) == true {
        ToolbarItem {
          Button {
            self.getUserInfo()
          } label: {
            Image(systemName: "info.circle")
          }
          .help("View \(self.username ?? "user")'s information")
        }
      }
      
      if self.model.access?.contains(.canDisconnectUsers) == true {
        ToolbarItem {
          Button {
            self.disconnectConfirmShown = true
          } label: {
            Image(systemName: "nosign")
          }
          .help("Disconnect \(self.username ?? "this user")")
        }
      }
    }
    .sheet(item: self.$userInfo) { info in
      UserClientInfoSheet(info: info)
    }
    .alert("Are you sure you want to disconnect \(self.username ?? "this user")?", isPresented: self.$disconnectConfirmShown) {
      Button("Disconnect", role: .destructive) {
        self.disconnectUser()
      }
    } message: {
      Text("They will be disconnected from the server, but may reconnect.")
    }
  }
  
  private func getUserInfo() {
    Task {
      if let info = try await self.model.getClientInfoText(id: self.userID) {
        self.userInfo = info
      }
    }
  }
  
  private func disconnectUser() {
    Task {
      try await self.model.disconnectUser(id: self.userID, options: nil)
    }
  }
  
  private var inputBar: some View {
    HStack(alignment: .lastTextBaseline, spacing: 0) {
      TextField("Message \(self.username ?? "")", text: $input, axis: .vertical)
        .focused($focusedField, equals: .chatInput)
        .textFieldStyle(.plain)
        .lineLimit(1...5)
        .multilineTextAlignment(.leading)
        .onSubmit {
          if !self.input.isEmpty {
            let message = self.input
            let uid = self.userID
            Task {
              try? await self.model.sendInstantMessage(message, userID: uid)
            }
          }
          self.input = ""
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
    .frame(maxWidth: .infinity, minHeight: 28)
    .padding(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
    .overlay(alignment: .leadingFirstTextBaseline) {
      Image(systemName: "chevron.right").opacity(0.4).offset(x: 16)
    }
    .onContinuousHover { phase in
      switch phase {
      case .active(_):
        NSCursor.iBeam.set()
      case .ended:
        NSCursor.arrow.set()
        break
      }
    }
    .onTapGesture {
      focusedField = .chatInput
    }
  }
  
  private var messageList: some View {
    ScrollViewReader { reader in
      GeometryReader { gm in
        ScrollView(.vertical) {
          LazyVStack(alignment: .leading) {
            ForEach(self.model.instantMessages[self.userID] ?? [InstantMessage]()) { msg in
              HStack(alignment: .firstTextBaseline) {
                if msg.direction == .outgoing {
                  Spacer()
                }
                
                Text(LocalizedStringKey(msg.text))
                  .lineSpacing(4)
                  .multilineTextAlignment(.leading)
                  .textSelection(.enabled)
                  .tint(msg.direction == .outgoing ? Color("Outgoing Message Link") : Color("Link Color"))
                  .foregroundStyle(msg.direction == .outgoing ? Color("Outgoing Message Text") : Color("Incoming Message Text"))
                  .padding(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
                  .background(msg.direction == .outgoing ? Color("Outgoing Message Background") : Color("Incoming Message Background"))
                  .clipShape(RoundedRectangle(cornerRadius: 16))
                
                if msg.direction == .incoming {
                  Spacer()
                }
              }
              .padding(EdgeInsets(top: 2, leading: 0, bottom: 2, trailing: 0))
            }
          }
          .padding()
          
          VStack(spacing: 0) {}.id(bottomID)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .defaultScrollAnchor(.bottom)
        .onChange(of: self.model.instantMessages[self.userID]?.count) {
          reader.scrollTo(self.bottomID, anchor: .bottom)
          self.model.markInstantMessagesAsRead(userID: self.userID)
        }
        .onAppear {
          reader.scrollTo(self.bottomID, anchor: .bottom)
          self.model.markInstantMessagesAsRead(userID: self.userID)
        }
        .onChange(of: gm.size) {
          reader.scrollTo(self.bottomID, anchor: .bottom)
        }
      }
    }
  }
}

#Preview {
  ChatView()
    .environment(HotlineState())
}
