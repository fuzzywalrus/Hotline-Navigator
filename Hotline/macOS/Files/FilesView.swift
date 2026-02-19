import SwiftUI
import UniformTypeIdentifiers
import AppKit

struct FilesView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.openWindow) private var openWindow

  @State private var selection: FileInfo?
  @State private var fileDetails: FileDetails?
  @State private var uploadFileSelectorDisplayed: Bool = false
  @State private var searchText: String = ""
  @State private var isSearching: Bool = false
  @State private var dragOver: Bool = false
  @State private var confirmDeleteShown: Bool = false
  @State private var newFolderShown: Bool = false
  @State private var viewMode: String = Prefs.shared.filesViewMode
  @State private var gridPath: [String] = []

  private var actions: FileActions {
    FileActions(model: model, openWindow: openWindow)
  }

  var body: some View {
    NavigationStack {
      Group {
        if viewMode == "grid" {
          FilesGridView(
            selection: $selection,
            gridPath: $gridPath,
            fileDetails: $fileDetails,
            confirmDeleteShown: $confirmDeleteShown,
            uploadFileSelectorDisplayed: $uploadFileSelectorDisplayed,
            newFolderShown: $newFolderShown,
            actions: actions,
            isShowingSearchResults: isShowingSearchResults
          )
        }
        else {
          listView
        }
      }
      .task {
        if !self.model.filesLoaded {
          let _ = try? await self.model.getFileList()
        }
      }
      .searchable(text: $searchText, isPresented: $isSearching, placement: .automatic, prompt: "Search")
      .background(Button("", action: { isSearching = true }).keyboardShortcut("f").hidden())
      .navigationSubtitle(viewMode == "grid" && !gridPath.isEmpty ? gridPath.last ?? "" : "")
      .toolbar {
        if viewMode == "grid" && !gridPath.isEmpty && !isShowingSearchResults {
          ToolbarItem {
            Button {
              self.gridPath.removeLast()
            } label: {
              Label("Back", systemImage: "chevron.left")
            }
            .help("Back")
          }
        }

        ToolbarItem {
          Menu {
            Button {
              self.viewMode = "list"
            } label: {
              Label("as List", systemImage: "list.bullet")
            }

            Button {
              self.viewMode = "grid"
            } label: {
              Label("as Icons", systemImage: "square.grid.2x2")
            }
          } label: {
            Label("View", systemImage: self.viewMode == "grid" ? "square.grid.2x2" : "list.bullet")
          }
          .help("View Mode")
        }
        ToolbarItem {
          Button {
            if let selectedFile = self.selection, selectedFile.isPreviewable {
              self.actions.previewFile(selectedFile)
            }
          } label: {
            Label("Quick Look", systemImage: "eye")
          }
          .help("Quick Look")
          .disabled(self.selection == nil || self.selection?.isPreviewable != true)
        }

        ToolbarItem {
          Button {
            if let selectedFile = self.selection {
              self.actions.downloadFile(selectedFile)
            }
          } label: {
            Label("Download", systemImage: "arrow.down")
          }
          .help("Download")
          .disabled(self.selection == nil || self.model.access?.contains(.canDownloadFiles) != true)
        }

        ToolbarItem {
          Menu {
            Button {
              self.uploadFileSelectorDisplayed = true
            } label: {
              Label("Upload...", systemImage: "arrow.up")
            }
            .disabled(self.model.access?.contains(.canUploadFiles) != true)
            
            Button {
              if let selectedFile = self.selection {
                self.actions.downloadFile(selectedFile)
              }
            } label: {
              Label("Download", systemImage: "arrow.down")
            }
            .disabled(self.selection == nil || self.model.access?.contains(.canDownloadFiles) != true)

            Divider()
            
            Button {
              if let selectedFile = self.selection {
                Task {
                  if let details = await self.actions.getFileInfo(selectedFile) {
                    self.fileDetails = details
                  }
                }
              }
            } label: {
              Label("Get Info", systemImage: "info.circle")
            }
            .disabled(self.selection == nil)
            
            Button {
              if let selectedFile = self.selection, selectedFile.isPreviewable {
                self.actions.previewFile(selectedFile)
              }
            } label: {
              Label("Quick Look", systemImage: "eye")
            }
            .disabled(self.selection == nil || self.selection?.isPreviewable != true)
            
            Button {
              self.newFolderShown = true
            } label: {
              Label("New Folder", systemImage: "folder.badge.plus")
            }
            .disabled(self.model.access?.contains(.canCreateFolders) != true)

            Divider()

            Button {
              self.confirmDeleteShown = true
            } label: {
              Label(self.selection?.isFolder == true ? "Delete Folder..." : "Delete File...", systemImage: "trash")
            }
            .disabled(self.selection == nil || (self.model.access?.contains(.canDeleteFiles) != true && self.model.access?.contains(.canDeleteFolders) != true))
          } label: {
            Label("Actions", systemImage: "ellipsis")
          }
          .help("More Actions")
          .popover(isPresented: self.$newFolderShown, arrowEdge: .bottom) {
            NewFolderPopover { folderName in
              self.actions.newFolder(name: folderName, parent: self.selection)
            }
          }
        }
      }
    }
    .alert("Are you sure you want to permanently delete \"\(self.selection?.name ?? "this file")\"?", isPresented: self.$confirmDeleteShown, actions: {
      Button("Delete", role: .destructive) {
        if let s = self.selection {
          Task {
            await actions.deleteFile(s)
          }
        }
      }
    }, message: {
      Text("You cannot undo this action.")
    })
    .sheet(item: self.$fileDetails) { item in
      FileDetailsSheet(details: item)
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

        if viewMode == "grid" && !gridPath.isEmpty {
          uploadPath = gridPath
        }
        else if let selection = selection {
          if selection.isFolder {
            uploadPath = selection.path
          }
          else {
            uploadPath = Array<String>(selection.path)
            uploadPath.removeLast()
          }
        }

        actions.upload(file: fileURL, to: uploadPath)

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
    .onChange(of: viewMode) { _, newValue in
      Prefs.shared.filesViewMode = newValue
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
    .background(.windowBackground)
  }

  // MARK: - List View

  private var listView: some View {
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
            let didStartAccessing = fileURL.startAccessingSecurityScopedResource()
            defer {
              if didStartAccessing {
                fileURL.stopAccessingSecurityScopedResource()
              }
            }
            actions.upload(file: fileURL, to: [])
          }
        }
      }

      return true
    }
    .contextMenu(forSelectionType: FileInfo.self) { items in
      let selectedFile = items.first

      Button {
        if let s = selectedFile {
          actions.downloadFile(s)
        }
      } label: {
        Label("Download", systemImage: "arrow.down")
      }
      .disabled(selectedFile == nil)

      Divider()

      Button {
        if let s = selectedFile {
          Task {
            if let details = await actions.getFileInfo(s) {
              self.fileDetails = details
            }
          }
        }
      } label: {
        Label("Get Info", systemImage: "info.circle")
      }
      .disabled(selectedFile == nil)

      Button {
        if let s = selectedFile {
          actions.previewFile(s)
        }
      } label: {
        Label("Quick Look", systemImage: "eye")
      }
      .disabled(selectedFile == nil || (selectedFile != nil && !selectedFile!.isPreviewable))

      if model.access?.contains(.canDeleteFiles) == true {
        Divider()

        Button {
          self.confirmDeleteShown = true
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
        actions.downloadFile(clickedFile)
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
        actions.previewFile(s)
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
  }

  // MARK: - Computed Properties

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
}

#Preview {
  FilesView()
    .environment(HotlineState())
}
