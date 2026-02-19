import SwiftUI

struct GeneralSettingsView: View {
  @State private var username: String = ""
  @State private var usernameChanged: Bool = false
  @State private var showChatHistoryManager: Bool = false
  
  let saveTimer = Timer.publish(every: 5, on: .main, in: .common).autoconnect()
  
  var body: some View {
    @Bindable var preferences = Prefs.shared
    
    Form {
      TextField("Your Name", text: $username, prompt: Text("guest"))
      Toggle("Show Join/Leave in Chat", isOn: $preferences.showJoinLeaveMessages)
      Toggle("Refuse private messages", isOn: $preferences.refusePrivateMessages)
      Toggle("Refuse private chat", isOn: $preferences.refusePrivateChat)
      Toggle("Automatic Response", isOn: $preferences.enableAutomaticMessage)
      if preferences.enableAutomaticMessage {
        TextField("", text: $preferences.automaticMessage, prompt: Text("Write a response message"))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity)
          .onSubmit(of: .text) {
            preferences.username = self.username
          }
      }
      
      Divider()
      
      Button(role: .destructive) {
        showChatHistoryManager = true
      } label: {
        Text("Chat History…")
      }
    }
    .padding()
    .frame(width: 392)
    .sheet(isPresented: $showChatHistoryManager) {
      ChatHistoryManagerView()
    }
    .onAppear {
      self.username = preferences.username
      self.usernameChanged = false
    }
    .onDisappear {
      preferences.username = self.username
      self.usernameChanged = false
    }
    .onChange(of: username) { oldValue, newValue in
      self.usernameChanged = true
    }
    .onReceive(saveTimer) { _ in
      if self.usernameChanged {
        self.usernameChanged = false
        preferences.username = self.username
      }
    }
  }
}

struct ChatHistoryManagerView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var servers: [ChatStore.ServerListing] = []
  @State private var serverToDelete: ChatStore.ServerListing?
  @State private var showDeleteAllConfirmation: Bool = false
  
  var body: some View {
    VStack(spacing: 0) {
      Text("Chat History")
        .font(.headline)
        .padding(.top, 16)
        .padding(.bottom, 8)
      
      if servers.isEmpty {
        ContentUnavailableView("No Chat History", systemImage: "bubble.left.and.bubble.right")
          .frame(maxHeight: .infinity)
      } else {
        List {
          ForEach(servers) { server in
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(server.metadata.serverName ?? server.metadata.id)
                  .fontWeight(.medium)
                if server.metadata.serverName != nil {
                  Text(server.metadata.id)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
              }
              
              Spacer()
              
              Text("\(server.entryCount) messages")
                .font(.caption)
                .foregroundStyle(.secondary)
              
              Button(role: .destructive) {
                serverToDelete = server
              } label: {
                Image(systemName: "trash")
              }
              .buttonStyle(.borderless)
            }
          }
        }
        .listStyle(.inset)
      }
      
      Divider()
      
      HStack {
        if !servers.isEmpty {
          Button("Clear All…", role: .destructive) {
            showDeleteAllConfirmation = true
          }
        }
        Spacer()
        Button("Done") {
          dismiss()
        }
        .keyboardShortcut(.defaultAction)
      }
      .padding(12)
    }
    .frame(width: 420, height: 320)
    .confirmationDialog(
      "Clear chat history?",
      isPresented: Binding(
        get: { serverToDelete != nil },
        set: { if !$0 { serverToDelete = nil } }
      ),
      titleVisibility: .visible
    ) {
      if let server = serverToDelete {
        Button("Clear", role: .destructive) {
          let key = ChatStore.SessionKey(
            address: server.metadata.address,
            port: server.metadata.port
          )
          Task {
            await ChatStore.shared.clearHistory(for: key)
            servers.removeAll { $0.id == server.id }
          }
        }
      }
      Button("Cancel", role: .cancel) {
        serverToDelete = nil
      }
    } message: {
      if let server = serverToDelete {
        Text("This will permanently delete your \(server.metadata.serverName ?? server.metadata.id) chat history. This cannot be undone.")
      }
    }
    .confirmationDialog("Clear all chat histories?", isPresented: $showDeleteAllConfirmation, titleVisibility: .visible) {
      Button("Clear All", role: .destructive) {
        Task {
          await ChatStore.shared.clearAll()
          servers = []
        }
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This will permanently delete all of your chat history across all of the servers you've connected to. This cannot be undone.")
    }
    .task {
      servers = await ChatStore.shared.listServers()
    }
  }
}
