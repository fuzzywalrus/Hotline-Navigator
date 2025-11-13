import SwiftUI

fileprivate let DEFAULT_ACCOUNT_NAME = "Untitled Account"
fileprivate let PASSWORD_PLACEHOLDER = "xxxxxxxxxxxxxxxxxx"

struct AccountManagerView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.dismiss) private var dismiss
  
  @State private var accounts: [HotlineAccount] = []
  @State private var selection: HotlineAccount?
  @State private var loading: Bool = true
  
  @State private var creatorShown: Bool = false
  @State private var deleteConfirm: Bool = false
  @State private var accountToEdit: HotlineAccount? = nil
  @State private var accountToDelete: HotlineAccount? = nil
  
  private func newAccount() {
    self.creatorShown = true
  }
  
  private func editAccount(_ account: HotlineAccount) {
    // Always get the latest version from the array to avoid stale data
    if let currentAccount = self.accounts.first(where: { $0.id == account.id }) {
      self.accountToEdit = currentAccount
    }
  }
  
  private func deleteAccount(_ account: HotlineAccount) {
    self.accountToDelete = account
    self.deleteConfirm = true
  }
  
  var body: some View {
    VStack(spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text("Accounts")
          .font(.headline)
        
        Spacer()
        
        HStack {
          Button {
            self.newAccount()
          } label: {
            Image(systemName: "plus")
              .padding(4)
          }
          .buttonBorderShape(.circle)
          .help("New Account")
          
          Button {
            if let account = self.selection {
              self.editAccount(account)
            }
          } label: {
            Image(systemName: "pencil")
              .padding(4)
          }
          .buttonBorderShape(.circle)
          .disabled(self.selection == nil)
          .help("Edit Account")
          
          Button {
            if let account = self.selection {
              self.deleteAccount(account)
            }
          } label: {
            Image(systemName: "trash")
              .padding(4)
          }
          .tint(.hotlineRed)
          .buttonBorderShape(.circle)
          .disabled(self.selection == nil)
          .help("Delete Account")
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 24)
      
      self.accountList
//        .overlay {
//          if self.loading {
//            ProgressView()
//              .progressViewStyle(.linear)
//              .controlSize(.extraLarge)
//              .frame(width: 100)
//          }
//        }
    }
    .environment(\.defaultMinListRowHeight, 34)
    .listStyle(.inset)
    .alternatingRowBackgrounds(.enabled)
    .task {
      if self.loading {
        do {
          self.accounts = try await self.model.getAccounts()
        }
        catch {
          self.dismiss()
        }
        
        self.loading = false
      }
    }
    .toolbar {
      if self.loading {
        ToolbarItem {
          ProgressView()
            .controlSize(.small)
        }
      }
      
      ToolbarItem(placement: .confirmationAction) {
        Button {
          self.dismiss()
        } label: {
          Text("OK")
        }
      }
    }
  }
  
  private var accountList: some View {
    List(self.accounts, id: \.self, selection: self.$selection) { account in
      HStack(spacing: 5) {
        Image(account.access.contains(.canDisconnectUsers) ? "User Admin" : "User")
          .frame(width: 16, height: 16)
          .opacity((account.access.rawValue == 0) ? 0.5 : 1.0)
        Text(account.name)
          .foregroundStyle(account.access.contains(.canDisconnectUsers) ? Color.hotlineRed : ((account.access.rawValue == 0) ? Color.secondary : Color.primary))
        
        Spacer()
        
        Text(account.login)
          .lineLimit(1)
          .foregroundStyle(.secondary)
      }
    }
    .contextMenu(forSelectionType: HotlineAccount.self) { items in
      Button {
        if let item = items.first {
          self.editAccount(item)
        }
      } label: {
        Label("Edit Account...", systemImage: "pencil")
      }
      .disabled(items.isEmpty)
      
      Divider()
      
      Button(role: .destructive) {
        if let item = items.first {
          self.deleteAccount(item)
        }
      } label: {
        Label("Delete Account...", systemImage: "trash")
      }
      .disabled(items.isEmpty)
    } primaryAction: { items in
      if let account = items.first {
        self.editAccount(account)
      }
    }
    .alert("Are you sure you want to delete the \"\(self.accountToDelete?.name ?? "unknown")\" account?", isPresented: self.$deleteConfirm, actions: {
      Button("Delete", role: .destructive) {
        guard let account = self.accountToDelete else {
          return
        }
        
        self.accountToDelete = nil
        
        Task {
          self.selection = nil
          
          if account.persisted {
            try await self.model.deleteUser(login: account.login)
          }
          
          self.accounts = self.accounts.filter { $0.id != account.id }
          self.deleteConfirm = false
        }
      }
    }, message: {
      Text("You cannot undo this action.")
    })
    .sheet(item: self.$accountToEdit) { account in
      AccountDetailsView(account: account) { editedAccount in
        if let i = self.accounts.firstIndex(of: editedAccount) {
          self.accounts.remove(at: i)
          self.accounts.insert(editedAccount, at: i)
        }
        self.accounts.sort { $0.name < $1.name }
        self.selection = editedAccount
        self.accountToEdit = nil
      }
      .id(account.id)
      .environment(self.model)
      .frame(width: 480)
      .frame(minHeight: 300, idealHeight: 400)
      .presentationSizing(.fitted)
    }
    .sheet(isPresented: self.$creatorShown) {
      AccountDetailsView { newAccount in
        self.accounts.append(newAccount)
        self.accounts.sort { $0.name < $1.name }
        self.selection = newAccount
      }
      .environment(self.model)
      .frame(width: 480)
      .frame(minHeight: 300, idealHeight: 400)
      .presentationSizing(.fitted)
    }
  }
}


struct AccountDetailsView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.dismiss) private var dismiss
  
  @State var account: HotlineAccount = HotlineAccount("Untitled Account", "", HotlineUserAccessOptions.defaultAccess)
  
  let saved: ((HotlineAccount) -> Void)?
  
  @State private var password: String = ""
  @State private var saving: Bool = false
  
  var body: some View {
    self.accountDetails
      .onAppear {
        // Display a placeholder for accounts that have been saved to the server
        // because we don't have the account password on hand to display.
        if self.account.persisted {
          self.password = PASSWORD_PLACEHOLDER
        }
      }
      .toolbar {
        if self.saving {
          ToolbarItem {
            ProgressView()
              .controlSize(.small)
          }
        }
        
        ToolbarItem(placement: .cancellationAction) {
          Button {
            self.dismiss()
          } label: {
            Text("Cancel")
          }
        }
        
        ToolbarItem(placement: .confirmationAction) {
          Button {
            Task {
              do {
                try await self.save()
                self.dismiss()
              }
              catch {
                print("ERROR SAVING ACCOUNT: \(error)")
              }
            }
          } label: {
            Text(self.account.persisted ? "Save" : "Create")
          }
          .disabled(self.saving)
        }
      }
  }
  
  private func save() async throws {
    self.saving = true
    defer { self.saving = false }
    
    var accountName: String = self.account.name
    if accountName.isBlank {
      accountName = DEFAULT_ACCOUNT_NAME
    }
    
    // Update existing account
    if self.account.persisted {
      if self.password == PASSWORD_PLACEHOLDER {
        try await self.model.setUser(name: accountName, login: self.account.login, newLogin: nil, password: nil, access: self.account.access.rawValue)
      } else {
        try await model.setUser(name: accountName, login: self.account.login, newLogin: nil, password: self.password, access: self.account.access.rawValue)
      }
      
    } else {
      // Create new existing account
      try await model.createUser(name: accountName, login: self.account.login, password: self.password, access: self.account.access.rawValue)
      
//      self.password = PASSWORD_PLACEHOLDER
      self.account.persisted = true
    }
    
    self.account.name = accountName
    self.saved?(self.account)
  }
  
  var accountDetails: some View {
    Form {
      Section {
        TextField(text: self.$account.name, prompt: Text(DEFAULT_ACCOUNT_NAME)) {
          Text("Account")
        }
      }
      
      Section {
        TextField("Login", text: self.$account.login, prompt: Text("Required"))
          .disabled(self.account.persisted)
        
        if self.account.persisted {
          SecureField("Password", text: self.$password, prompt: Text("Optional"))
        } else {
          TextField("Password", text: self.$password, prompt: Text("Optional"))
        }
      }
      
      Section("Files") {
        Toggle("Download Files", isOn: self.$account.access.bind(.canDownloadFiles))
          .disabled(self.model.access?.contains(.canDownloadFiles) == false)
        Toggle("Download Folders", isOn: self.$account.access.bind(.canDownloadFolders))
          .disabled(model.access?.contains(.canDownloadFolders) == false)
        Toggle("Upload Files", isOn: self.$account.access.bind(.canUploadFiles))
          .disabled(model.access?.contains(.canUploadFiles) == false)
        Toggle("Upload Folders", isOn: self.$account.access.bind(.canUploadFolders))
          .disabled(model.access?.contains(.canUploadFolders) == false)
        Toggle("Upload Anywhere", isOn: self.$account.access.bind(.canUploadAnywhere))
          .disabled(model.access?.contains(.canUploadAnywhere) == false)
        Toggle("Delete Files", isOn: self.$account.access.bind(.canDeleteFiles))
          .disabled(model.access?.contains(.canDeleteFiles) == false)
        Toggle("Rename Files", isOn: self.$account.access.bind(.canRenameFiles))
          .disabled(model.access?.contains(.canRenameFiles) == false)
        Toggle("Move Files", isOn: self.$account.access.bind(.canMoveFiles))
          .disabled(model.access?.contains(.canMoveFiles) == false)
        Toggle("Comment Files", isOn: self.$account.access.bind(.canSetFileComment))
          .disabled(model.access?.contains(.canSetFileComment) == false)
        Toggle("Create Folders", isOn: self.$account.access.bind(.canCreateFolders))
          .disabled(model.access?.contains(.canCreateFolders) == false)
        Toggle("Delete Folders", isOn: self.$account.access.bind(.canDeleteFolders))
          .disabled(model.access?.contains(.canDeleteFolders) == false)
        Toggle("Rename Folders", isOn: self.$account.access.bind(.canRenameFolders))
          .disabled(model.access?.contains(.canRenameFolders) == false)
        Toggle("Move Folders", isOn: self.$account.access.bind(.canMoveFolders))
          .disabled(model.access?.contains(.canMoveFolders) == false)
        Toggle("Comment Folders", isOn: self.$account.access.bind(.canSetFolderComment))
          .disabled(model.access?.contains(.canSetFolderComment) == false)
        Toggle("View Drop Boxes", isOn: self.$account.access.bind(.canViewDropBoxes))
          .disabled(model.access?.contains(.canViewDropBoxes) == false)
        Toggle("Make Aliases", isOn: self.$account.access.bind(.canMakeAliases))
          .disabled(model.access?.contains(.canMakeAliases) == false)
      }
      
      Section("User Maintenance") {
        Toggle("Create Accounts", isOn: self.$account.access.bind(.canCreateUsers))
          .disabled(model.access?.contains(.canCreateUsers) == false)
        Toggle("Delete Accounts", isOn: self.$account.access.bind(.canDeleteUsers))
          .disabled(model.access?.contains(.canDeleteUsers) == false)
        Toggle("Read Accounts", isOn: self.$account.access.bind(.canOpenUsers))
          .disabled(model.access?.contains(.canOpenUsers) == false)
        Toggle("Modify Accounts", isOn: self.$account.access.bind(.canModifyUsers))
          .disabled(model.access?.contains(.canModifyUsers) == false)
        Toggle("Get User Info", isOn: self.$account.access.bind(.canGetClientInfo))
          .disabled(model.access?.contains(.canGetClientInfo) == false)
        
        Toggle("Disconnect Users", isOn: self.$account.access.bind(.canDisconnectUsers))
          .disabled(model.access?.contains(.canDisconnectUsers) == false)
        Toggle("Cannot be Disconnected", isOn: self.$account.access.bind(.cantBeDisconnected))
          .disabled(model.access?.contains(.cantBeDisconnected) == false)
      }
      
      Section("Messaging") {
        Toggle("Send Messages", isOn: self.$account.access.bind(.canSendMessages))
          .disabled(model.access?.contains(.canSendMessages) == false)
        Toggle("Broadcast", isOn: self.$account.access.bind(.canBroadcast))
          .disabled(model.access?.contains(.canBroadcast) == false)
      }
      
      Section("News") {
        Toggle("Read Articles", isOn: self.$account.access.bind(.canReadMessageBoard))
          .disabled(model.access?.contains(.canReadMessageBoard) == false)
        Toggle("Post Articles", isOn: self.$account.access.bind(.canPostMessageBoard))
          .disabled(model.access?.contains(.canPostMessageBoard) == false)
        Toggle("Delete Articles", isOn: self.$account.access.bind(.canDeleteNewsArticles))
          .disabled(model.access?.contains(.canDeleteNewsArticles) == false)
        Toggle("Create Categories", isOn: self.$account.access.bind(.canCreateNewsCategories))
          .disabled(model.access?.contains(.canCreateNewsCategories) == false)
        Toggle("Delete Categories", isOn: self.$account.access.bind(.canDeleteNewsCategories))
          .disabled(model.access?.contains(.canDeleteNewsCategories) == false)
        Toggle("Create News Bundles", isOn: self.$account.access.bind(.canCreateNewsFolders))
          .disabled(model.access?.contains(.canCreateNewsFolders) == false)
        Toggle("Delete News Bundles", isOn: self.$account.access.bind(.canDeleteNewsFolders))
          .disabled(model.access?.contains(.canDeleteNewsFolders) == false)
      }
      
      Section("Chat") {
        Toggle("Initiate Private Chat", isOn: self.$account.access.bind(.canCreateChat))
          .disabled(model.access?.contains(.canCreateChat) == false)
        Toggle("Read Chat", isOn: self.$account.access.bind(.canReadChat))
          .disabled(model.access?.contains(.canReadChat) == false)
        Toggle("Send Chat", isOn: self.$account.access.bind(.canSendChat))
          .disabled(model.access?.contains(.canSendChat) == false)
      }
      
      Section("Miscellaneous") {
        Toggle("Use Any Name", isOn: self.$account.access.bind(.canUseAnyName))
          .disabled(model.access?.contains(.canUseAnyName) == false)
        Toggle("Don't Show Agreement", isOn: self.$account.access.bind(.canSkipAgreement))
          .disabled(model.access?.contains(.canSkipAgreement) == false)
      }
    }
    .disabled(self.model.access?.contains(.canModifyUsers) == false)
    .formStyle(.grouped)
  }
}
