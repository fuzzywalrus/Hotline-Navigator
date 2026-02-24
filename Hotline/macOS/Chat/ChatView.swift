import SwiftUI
import Kingfisher

enum FocusedField: Int, Hashable {
  case chatInput
}

struct ChatView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.colorScheme) var colorScheme
  @Environment(\.dismiss) var dismiss
  @Bindable var serverState: ServerState
  
  @State private var searchQuery: String = ""
  @State private var debouncedQuery: String = ""
  @State private var searchResults: [ChatMessage] = []
  @State private var isSearching: Bool = false
  @State private var searchTask: Task<Void, Never>?
  @State private var stableBannerFileURL: URL?
  @State private var stableBannerIsAnimated: Bool = false
  @State private var inputHeight: CGFloat = ChatInputField.defaultHeight
  
  var displayedMessages: [ChatMessage] {
    self.debouncedQuery.isEmpty ? self.model.chat : self.searchResults
  }

  private var bannerView: some View {
    ZStack {
      if self.stableBannerIsAnimated {
        KFAnimatedImage
          .url(self.stableBannerFileURL)
          .cacheMemoryOnly()
          .cacheOriginalImage()
          .scaledToFill()
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          .id("animated banner \(self.stableBannerFileURL?.absoluteString ?? "")")
      }
      else if self.stableBannerFileURL != nil {
        KFImage
          .url(self.stableBannerFileURL)
          .resizable()
          .interpolation(.high)
          .cacheMemoryOnly()
          .cacheOriginalImage()
          .scaledToFill()
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          .id("static banner \(self.stableBannerFileURL?.absoluteString ?? "")")
      }
    }
    .frame(maxWidth: 468.0, minHeight: 60, maxHeight: 60)
    .clipped()
  }
  
  var body: some View {
    @Bindable var bindModel = self.model
    
    NavigationStack {
      // MARK: Chat Text View
      ChatTextView(
        messages: self.displayedMessages,
        searchQuery: self.debouncedQuery,
        watchWords: Prefs.shared.watchWords,
        isFiltered: !self.debouncedQuery.isEmpty,
        cachedText: self.model.chatRenderedText,
        cachedCount: self.model.chatRenderedCount,
        onCacheUpdate: { text, count in
          self.model.chatRenderedText = text
          self.model.chatRenderedCount = count
        },
        server: self.model.server,
        onFileLinkClicked: { path in
          print("[FileLink] ChatView handler called with path: \(path)")
          self.serverState.fileNavigationPath = path
          self.serverState.selection = .files
          print("[FileLink] Set fileNavigationPath=\(path), selection=.files")
        }
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .ignoresSafeArea(edges: .top)
      .modifier(SoftTopScrollEdge())
      .onChange(of: self.model.chat.count) {
        if !self.searchQuery.isEmpty {
          self.performSearch()
        }
        self.model.markPublicChatAsRead()
      }
      .onAppear {
        self.model.markPublicChatAsRead()
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 0) {
          Divider()
          self.inputBar
        }
      }
      .searchable(text: self.$searchQuery, isPresented: self.$isSearching, placement: .toolbar, prompt: "Search")
      .background(Button("", action: { self.isSearching = true }).keyboardShortcut("f").hidden())
      .toolbar {
        if self.model.access?.contains(.canBroadcast) == true {
          ToolbarItem(placement: .primaryAction) {
            Button {
              self.serverState.broadcastShown = true
            } label: {
              Label("Broadcast Message", systemImage: "megaphone")
            }
            .help("Broadcast Message")
          }
        }
      }
      .onChange(of: self.searchQuery) {
        self.searchTask?.cancel()
        if self.searchQuery.isEmpty {
          self.debouncedQuery = ""
          self.searchResults = []
        } else {
          let delay: Int = 50
          self.searchTask = Task {
            try? await Task.sleep(for: .milliseconds(delay))
            guard !Task.isCancelled else { return }
            self.performSearch()
          }
        }
      }
    }
    .onAppear {
      self.stableBannerFileURL = self.model.bannerFileURL
      self.stableBannerIsAnimated = self.model.bannerImageFormat == .gif
    }
    .onChange(of: self.model.bannerFileURL) { _, newValue in
      self.stableBannerFileURL = newValue
      self.stableBannerIsAnimated = self.model.bannerImageFormat == .gif
    }
    .background {
      if #available(macOS 26.0, *) {
        Color(.windowBackgroundColor)
          .ignoresSafeArea()
      } else {
        Color(nsColor: .textBackgroundColor)
          .ignoresSafeArea()
      }
    }
  }
  
  private var inputBar: some View {
    @Bindable var bindModel = self.model
    return ChatInputField(
      text: $bindModel.chatInput,
      height: self.$inputHeight,
      onSubmit: { announce in
        let message = self.model.chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !message.isEmpty {
          Task {
            try? await self.model.sendChat(message, announce: announce)
          }
        }
        self.model.chatInput = ""
      }
    )
    .frame(maxWidth: .infinity)
    .frame(height: self.inputHeight)
  }
  
  private func performSearch() {
    guard !self.searchQuery.isEmpty else {
      self.debouncedQuery = ""
      self.searchResults = []
      return
    }
    
    self.searchResults = self.model.searchChat(query: self.searchQuery)
    self.debouncedQuery = self.searchQuery
  }
}

private struct SoftTopScrollEdge: ViewModifier {
  func body(content: Content) -> some View {
    if #available(macOS 26.0, *) {
      content.scrollEdgeEffectStyle(.soft, for: .top)
    } else {
      content
    }
  }
}

#Preview {
  ChatView(serverState: ServerState(selection: .chat))
    .environment(HotlineState())
}
