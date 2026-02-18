import SwiftUI
import Kingfisher

enum FocusedField: Int, Hashable {
  case chatInput
}

struct ChatView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.colorScheme) var colorScheme
  @Environment(\.dismiss) var dismiss
  
  @State private var searchQuery: String = ""
  @State private var debouncedQuery: String = ""
  @State private var searchResults: [ChatMessage] = []
  @State private var isSearching: Bool = false
  @State private var searchTask: Task<Void, Never>?
  @State private var stableBannerFileURL: URL?
  @State private var stableBannerIsAnimated: Bool = false
  @State private var inputHeight: CGFloat = 40
  
  var displayedMessages: [ChatMessage] {
    debouncedQuery.isEmpty ? model.chat : searchResults
  }
  
  private var bannerView: some View {
    ZStack {
      if stableBannerIsAnimated {
        KFAnimatedImage
          .url(stableBannerFileURL)
          .cacheMemoryOnly()
          .cacheOriginalImage()
          .scaledToFill()
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          .id("animated banner \(stableBannerFileURL?.absoluteString ?? "")")
      }
      else if stableBannerFileURL != nil {
        KFImage
          .url(stableBannerFileURL)
          .resizable()
          .interpolation(.high)
          .cacheMemoryOnly()
          .cacheOriginalImage()
          .scaledToFill()
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          .id("static banner \(stableBannerFileURL?.absoluteString ?? "")")
      }
    }
    .frame(maxWidth: 468.0, minHeight: 60, maxHeight: 60)
    .clipped()
  }
  
  var body: some View {
    @Bindable var bindModel = model
    
    NavigationStack {
      // MARK: Chat Text View
      ChatTextView(
        messages: displayedMessages,
        searchQuery: debouncedQuery,
        isFiltered: !debouncedQuery.isEmpty,
        cachedText: model.chatRenderedText,
        cachedCount: model.chatRenderedCount,
        onCacheUpdate: { text, count in
          model.chatRenderedText = text
          model.chatRenderedCount = count
        }
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .ignoresSafeArea(edges: .top)
      .modifier(SoftTopScrollEdge())
      .onChange(of: model.chat.count) {
        if !searchQuery.isEmpty {
          performSearch()
        }
        model.markPublicChatAsRead()
      }
      .onAppear {
        model.markPublicChatAsRead()
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 0) {
          Divider()
          self.inputBar
        }
      }
      .searchable(text: $searchQuery, isPresented: $isSearching, placement: .toolbar, prompt: "Search")
      .background(Button("", action: { isSearching = true }).keyboardShortcut("f").hidden())
      .onChange(of: searchQuery) {
        searchTask?.cancel()
        if searchQuery.isEmpty {
          debouncedQuery = ""
          searchResults = []
        } else {
          let delay: Int = 50
          searchTask = Task {
            try? await Task.sleep(for: .milliseconds(delay))
            guard !Task.isCancelled else { return }
            performSearch()
          }
        }
      }
    }
    .background(Color(nsColor: .textBackgroundColor))
    .onAppear {
      stableBannerFileURL = model.bannerFileURL
      stableBannerIsAnimated = model.bannerImageFormat == .gif
    }
    .onChange(of: model.bannerFileURL) { _, newValue in
      stableBannerFileURL = newValue
      stableBannerIsAnimated = model.bannerImageFormat == .gif
    }
  }
  
  private var inputBar: some View {
    @Bindable var bindModel = model
    return ChatInputField(
      text: $bindModel.chatInput,
      height: $inputHeight,
      onSubmit: { announce in
        let message = model.chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !message.isEmpty {
          Task {
            try? await model.sendChat(message, announce: announce)
          }
        }
        model.chatInput = ""
      }
    )
    .frame(maxWidth: .infinity)
    .frame(height: inputHeight)
  }
  
  private func performSearch() {
    guard !searchQuery.isEmpty else {
      debouncedQuery = ""
      searchResults = []
      return
    }

    searchResults = model.searchChat(query: searchQuery)
    debouncedQuery = searchQuery
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
  ChatView()
    .environment(HotlineState())
}
