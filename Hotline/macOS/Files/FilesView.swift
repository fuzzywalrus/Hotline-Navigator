import SwiftUI
import UniformTypeIdentifiers
import AppKit

struct NewFolderSheet: View {
  @Environment(\.dismiss) private var dismiss
  
  let action: ((String) -> Void)?
  
  @State private var folderName: String = "Untitled"
  
  var body: some View {
    Form {
      TextField(text: self.$folderName) {
        Text("Folder Name")
      }
    }
    .formStyle(.grouped)
    .fixedSize(horizontal: false, vertical: true)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("New Folder") {
          self.dismiss()
          self.action?(self.folderName)
        }
      }
      ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") {
          self.dismiss()
        }
      }
    }
  }
}

struct FilesView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.openWindow) private var openWindow
  
  @State private var selection: FileInfo?
  @State private var fileDetails: FileDetails?
  @State private var uploadFileSelectorDisplayed: Bool = false
  @State private var searchText: String = ""
  @State private var isSearching: Bool = false
  @State private var dragOver: Bool = false
  @State private var deleteConfirmationDisplayed: Bool = false
  @State private var newFolderSheetDisplayed: Bool = false
  
  var body: some View {
    NavigationStack {
      List(self.displayedFiles, id: \.self, selection: self.$selection) { file in
        if file.isFolder {
          FolderItemView(file: file, depth: 0).tag(file.id)
        }
        else {
          FileItemView(file: file, depth: 0).tag(file.id)
        }
      }
      .environment(\.defaultMinListRowHeight, 28)
      .listStyle(.inset)
      .alternatingRowBackgrounds(.enabled)
      .onDrop(of: [.fileURL], isTargeted: self.$dragOver) { items in
        guard self.model.access?.contains(.canUploadFiles) == true,
              let item = items.first,
              let identifier = item.registeredTypeIdentifiers.first else {
          return false
        }
        
        item.loadItem(forTypeIdentifier: identifier, options: nil) { (urlData, error) in
          DispatchQueue.main.async {
            if let urlData = urlData as? Data,
               let fileURL = URL(dataRepresentation: urlData, relativeTo: nil, isAbsolute: true) {

              // Access security-scoped resource for drag-and-drop
              let didStartAccessing = fileURL.startAccessingSecurityScopedResource()
              defer {
                if didStartAccessing {
                  fileURL.stopAccessingSecurityScopedResource()
                }
              }

              self.upload(file: fileURL, to: [])
            }
          }
        }
        
        return true
      }
      .task {
        if !self.model.filesLoaded {
          let _ = try? await self.model.getFileList()
        }
      }
      .contextMenu(forSelectionType: FileInfo.self) { items in
        let selectedFile = items.first
        
        Button {
          if let s = selectedFile {
            downloadFile(s)
          }
        } label: {
          Label("Download", systemImage: "arrow.down")
        }
        .disabled(selectedFile == nil)
        
        Divider()
                
        Button {
          if let s = selectedFile {
            getFileInfo(s)
          }
        } label: {
          Label("Get Info", systemImage: "info.circle")
        }
        .disabled(selectedFile == nil)
        
        Button {
          if let s = selectedFile {
            previewFile(s)
          }
        } label: {
          Label("Preview", systemImage: "eye")
        }
        .disabled(selectedFile == nil || (selectedFile != nil && !selectedFile!.isPreviewable))
        
        if model.access?.contains(.canDeleteFiles) == true {
          Divider()
          
          Button {
            self.deleteConfirmationDisplayed = true
          } label: {
            Label("Delete...", systemImage: "trash")
          }
          .disabled(selectedFile == nil)
        }
      } primaryAction: { items in
        guard let clickedFile = items.first else {
          return
        }
        
        self.selection = clickedFile
        if clickedFile.isFolder {
          clickedFile.expanded.toggle()
        }
        else {
          downloadFile(clickedFile)
        }
      }
      .onKeyPress(.rightArrow) {
        if let s = selection, s.isFolder {
          s.expanded = true
          return .handled
        }
        return .ignored
      }
      .onKeyPress(.leftArrow) {
        if let s = selection, s.isFolder {
          s.expanded = false
          return .handled
        }
        return .ignored
      }
      .onKeyPress(.space) {
        if let s = selection, s.isPreviewable {
          previewFile(s)
          return .handled
        }
        return .ignored
      }
      .overlay {
        if !model.filesLoaded {
          VStack {
            ProgressView()
              .controlSize(.large)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .searchable(text: $searchText, isPresented: $isSearching, placement: .automatic, prompt: "Search")
      .background(Button("", action: { isSearching = true }).keyboardShortcut("f").hidden())
      .toolbar {
        ToolbarItem {
          Button {
            if let selectedFile = selection, selectedFile.isPreviewable {
              self.previewFile(selectedFile)
            }
          } label: {
            Label("Preview", systemImage: "eye")
          }
          .help("Preview")
          .disabled(selection == nil || selection?.isPreviewable != true)
        }
        
        ToolbarItem {
          Button {
            if let selectedFile = selection {
              self.getFileInfo(selectedFile)
            }
          } label: {
            Label("Get Info", systemImage: "info.circle")
          }
          .help("Get Info")
          .disabled(selection == nil)
        }
        
        ToolbarItem {
          Button {
            self.uploadFileSelectorDisplayed = true
          } label: {
            Label("Upload", systemImage: "arrow.up")
          }
          .help("Upload")
          .disabled(model.access?.contains(.canUploadFiles) != true)
        }
        
        ToolbarItem {
          Button {
            if let selectedFile = selection {
              self.downloadFile(selectedFile)
            }
          } label: {
            Label("Download", systemImage: "arrow.down")
          }
          .help("Download")
          .disabled(selection == nil || model.access?.contains(.canDownloadFiles) != true)
        }
        
        if #available(macOS 26.0, *) {
          ToolbarSpacer()
        }
        
        ToolbarItem {
          Button {
            self.newFolderSheetDisplayed = true
          } label: {
            Label("New Folder", systemImage: "folder.badge.plus")
          }
          .help("New Folder")
        }
        
        ToolbarItem {
          Button {
            self.deleteConfirmationDisplayed = true
          } label: {
            Label("Delete", systemImage: "trash")
          }
          .disabled(self.selection == nil)
          .help("Delete")
        }
      }
    }
    .alert("Are you sure you want to permanently delete \"\(self.selection?.name ?? "this file")\"?", isPresented: self.$deleteConfirmationDisplayed, actions: {
      Button("Delete", role: .destructive) {
        if let s = self.selection {
          Task {
            await self.deleteFile(s)
          }
        }
      }
    }, message: {
      Text("You cannot undo this action.")
    })
    .sheet(isPresented: self.$newFolderSheetDisplayed) {
      NewFolderSheet { folderName in
        self.newFolder(name: folderName, parent: self.selection)
      }
    }
    .sheet(item: $fileDetails) { item in
      FileDetailsView(fd: item)
    }
    .fileImporter(isPresented: $uploadFileSelectorDisplayed, allowedContentTypes: [.data, .folder], allowsMultipleSelection: false, onCompletion: { results in
      switch results {
      case .success(let fileURLS):
        guard fileURLS.count > 0,
              let fileURL = fileURLS.first
        else {
          return
        }
        
        var uploadPath: [String] = []
        
        if let selection = selection {
          if selection.isFolder {
            uploadPath = selection.path
          }
          else {
            uploadPath = Array<String>(selection.path)
            uploadPath.removeLast()
          }
        }
        
        print("UPLOAD PATH: \(uploadPath)")
        self.upload(file: fileURL, to: uploadPath)
//        uploadFile(file: fileURL, to: uploadPath)
        
      case .failure(let error):
        print(error)
      }
    })
    .onSubmit(of: .search) {
      #if os(macOS)
      let shiftPressed = NSApp.currentEvent?.modifierFlags.contains(.shift) ?? false
      if shiftPressed {
        model.clearFileListCache()
      }
      #endif

      let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else {
        model.cancelFileSearch()
        return
      }
      searchText = trimmed
      model.startFileSearch(query: trimmed)
    }
    .onChange(of: searchText) { _, newValue in
      if newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        if isShowingSearchResults {
          model.cancelFileSearch()
        }
      }
    }
    .onChange(of: model.fileSearchQuery) { _, newValue in
      if newValue != searchText {
        searchText = newValue
      }
    }
    .onAppear {
      if searchText != model.fileSearchQuery {
        searchText = model.fileSearchQuery
      }
    }
    .safeAreaInset(edge: .top) {
      if isShowingSearchResults, let message = searchStatusMessage {
        HStack(alignment: .center, spacing: 6) {
          if case .searching(_, _) = model.fileSearchStatus {
            ProgressView()
              .controlSize(.small)
              .accentColor(.white)
              .tint(.white)
          }
          else if case .completed = model.fileSearchStatus {
            Image(systemName: "checkmark.circle.fill")
              .resizable()
              .symbolRenderingMode(.monochrome)
              .foregroundStyle(.white)
              .aspectRatio(contentMode: .fit)
              .frame(width: 16, height: 16)
          }
          else if case .failed = model.fileSearchStatus {
            Image(systemName: "exclamationmark.triangle.fill")
              .resizable()
              .symbolRenderingMode(.monochrome)
              .foregroundStyle(.white)
              .aspectRatio(contentMode: .fit)
              .frame(width: 16, height: 16)
          }
          
          Text(message)
            .lineLimit(1)
            .font(.body)
            .foregroundStyle(.white)
          
          Spacer()
          
          if let pathMessage = searchStatusPath {
            Text(pathMessage)
              .lineLimit(1)
              .truncationMode(.tail)
              .font(.footnote)
//              .fontWeight(.semibold)
              .foregroundStyle(.white)
              .opacity(0.5)
              .padding(.top, 2)
          }
        }
        .padding(.trailing, 14)
        .padding(.leading, 8)
        .padding(.vertical, 8)
        .background {
          Group {
            if case .completed = model.fileSearchStatus {
              Color.fileComplete
            }
            else {
              Color(nsColor: .controlAccentColor)
            }
          }
          .clipShape(.capsule(style: .continuous))
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
      }
    }
  }
  
  private var isShowingSearchResults: Bool {
    switch model.fileSearchStatus {
    case .idle:
      return !model.fileSearchResults.isEmpty
    case .cancelled(_):
      return !model.fileSearchResults.isEmpty
    default:
      return true
    }
  }

  private var displayedFiles: [FileInfo] {
    isShowingSearchResults ? model.fileSearchResults : model.files
  }

  private var searchStatusMessage: String? {
    switch model.fileSearchStatus {
    case .searching(let processed, _):
      let scanned = processed == 1 ? "folder" : "folders"
      return "Searched \(processed) \(scanned)..."
    case .completed(let processed):
      let count = model.fileSearchResults.count
      let folderWord = processed == 1 ? "folder" : "folders"
      if count == 0 {
        return "No files found in \(processed) \(folderWord)"
      }
      return "\(count) file\(count == 1 ? "" : "s") found in \(processed) \(folderWord)"
    case .cancelled(_):
      if model.fileSearchResults.isEmpty {
        return nil
      }
      return "Search cancelled"
    case .failed(let message):
      return "Search failed: \(message)"
    case .idle:
      return nil
    }
  }
  
  private var searchStatusPath: String? {
    guard let path = model.fileSearchCurrentPath else {
      return nil
    }
    if path.isEmpty {
      return "/"
    }
    return path.joined(separator: "/")
  }
    
  private func openPreviewWindow(_ previewInfo: PreviewFileInfo) {
    switch previewInfo.previewType {
    case .image:
      self.openWindow(id: "preview-quicklook", value: previewInfo)
    case .text:
      self.openWindow(id: "preview-quicklook", value: previewInfo)
    case .unknown:
      self.openWindow(id: "preview-quicklook", value: previewInfo)
      return
    }
  }
  
  @MainActor private func newFolder(name: String, parent: FileInfo?) {
    Task {
      var parentFolder: FileInfo? = nil
      if parent?.isFolder == true {
        parentFolder = parent
      }
      
      let path: [String] = parentFolder?.path ?? []
      if try await self.model.newFolder(name: name, parentPath: path) == true {
        try await self.model.getFileList(path: path)
      }
    }
  }
  
  @MainActor private func getFileInfo(_ file: FileInfo) {
    Task {
      if let fileInfo = try? await model.getFileDetails(file.name, path: file.path) {
        Task { @MainActor in
          self.fileDetails = fileInfo
        }
      }
    }
  }
  
  @MainActor private func downloadFile(_ file: FileInfo) {
    if file.isFolder {
      model.downloadFolder(file.name, path: file.path)
    }
    else {
      model.downloadFile(file.name, path: file.path)
    }
  }
  
  @MainActor private func uploadFile(file fileURL: URL, to path: [String]) {
    self.model.uploadFile(url: fileURL, path: path) { info in
      Task {
        // Refresh file listing to display newly uploaded file.
        try? await self.model.getFileList(path: path)
      }
    }
  }
  
  @MainActor private func upload(file fileURL: URL, to path: [String]) {
    var fileIsDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false), isDirectory: &fileIsDirectory) else {
      return
    }

    if fileIsDirectory.boolValue {
      self.model.uploadFolder(url: fileURL, path: path, complete: { info in
        Task {
          // Refresh file listing to display newly uploaded file.
          try? await model.getFileList(path: path)
        }
      })
    }
    else {
      self.model.uploadFile(url: fileURL, path: path) { info in
        Task {
          // Refresh file listing to display newly uploaded file.
          try? await model.getFileList(path: path)
        }
      }
    }
  }
  
  @MainActor private func previewFile(_ file: FileInfo) {
    guard file.isPreviewable else {
      return
    }
  
    self.model.previewFile(file.name, path: file.path) { info in
      if let info = info {
        var extendedInfo = info
        extendedInfo.creator = file.creator
        extendedInfo.type = file.type
        self.openPreviewWindow(extendedInfo)
      }
    }
  }
  
  private func deleteFile(_ file: FileInfo) async {
    var parentPath: [String] = []
    if file.path.count > 1 {
      parentPath = Array(file.path[0..<file.path.count-1])
    }

    if (try? await model.deleteFile(file.name, path: file.path)) == true {
      let _ = try? await model.getFileList(path: parentPath)
    }
  }
}

#Preview {
  FilesView()
    .environment(HotlineState())
}
