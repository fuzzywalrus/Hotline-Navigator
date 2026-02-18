import SwiftUI
import Kingfisher

enum FocusedField: Int, Hashable {
  case chatInput
}

struct ChatJoinedMessageView: View {
  let message: ChatMessage
  
  var body: some View {
    HStack(alignment: .center, spacing: 4) {
      Image(systemName: "arrow.right")
        .resizable()
        .scaledToFit()
        .fontWeight(.semibold)
        .foregroundStyle(.primary)
        .frame(width: 12, height: 12)
      
      Text(message.text)
        .lineLimit(1)
        .truncationMode(.middle)
        .fontWeight(.semibold)
        .textSelection(.disabled)

      Spacer()
    }
    .opacity(0.3)
  }
}

struct ChatLeftMessageView: View {
  let message: ChatMessage
  
  var body: some View {
    HStack(alignment: .center, spacing: 4) {
      Image(systemName: "arrow.left")
        .resizable()
        .scaledToFit()
        .fontWeight(.semibold)
        .foregroundStyle(.primary)
        .frame(width: 12, height: 12)
      
      Text(message.text)
        .lineLimit(1)
        .truncationMode(.middle)
        .fontWeight(.semibold)
        .textSelection(.disabled)

      Spacer()
    }
    .opacity(0.3)
  }
}


struct ChatDisconnectedMessageView: View {
  let message: ChatMessage

  private var formattedDate: String {
    let day = Calendar.current.component(.day, from: message.date)
    let suffix: String
    switch day {
    case 11, 12, 13: suffix = "th"
    default:
      switch day % 10 {
      case 1: suffix = "st"
      case 2: suffix = "nd"
      case 3: suffix = "rd"
      default: suffix = "th"
      }
    }

    let f = DateFormatter()
    f.dateFormat = "MMMM d'\(suffix)', yyyy • h:mm a"
    return f.string(from: message.date)
  }

  var body: some View {
    HStack(spacing: 8) {
      VStack { Divider() }
      Text(formattedDate)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .layoutPriority(1)
      VStack { Divider() }
    }
    .opacity(0.6)
  }
}

struct ChatMessageView: View {
  let message: ChatMessage

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      if let username = message.username {
        Text("\(username): ").fontWeight(.semibold) + Text(message.text.markdownToAttributedString())
      }
      else {
        Text(message.text)
      }
      Spacer()
    }
    .lineSpacing(4)
    .multilineTextAlignment(.leading)
    .textSelection(.enabled)
    .tint(Color("Link Color"))
  }
}

struct ChatView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.colorScheme) var colorScheme
  @Environment(\.dismiss) var dismiss

  @State private var scrollPos: Int?
  @State private var contentHeight: CGFloat = 0

  @State private var searchQuery: String = ""
  @State private var searchResults: [ChatMessage] = []
  @State private var isSearching: Bool = false
  @State private var stableBannerFileURL: URL?
  @State private var stableBannerIsAnimated: Bool = false

  @FocusState private var focusedField: FocusedField?

  @Namespace var bottomID

  private var bindableModel: Bindable<HotlineState> {
    Bindable(model)
  }

//  @State private var showingExporter: Bool = false
//
//  @State private var chatDocument: TextFile = TextFile()

  var displayedMessages: [ChatMessage] {
    searchQuery.isEmpty ? model.chat : searchResults
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
      ScrollViewReader { reader in
        VStack(alignment: .leading, spacing: 0) {

          // MARK: Scroll View
            ScrollView(.vertical) {
              LazyVStack(alignment: .leading, spacing: 8) {

                ForEach(displayedMessages) { msg in
                  if msg.type == .server {
                    ServerMessageView(message: msg.text)
                  }
                  else if msg.type == .joined {
                    ChatJoinedMessageView(message: msg)
                  }
                  else if msg.type == .left {
                    ChatLeftMessageView(message: msg)
                  }
                  else if msg.type == .signOut {
                    ChatDisconnectedMessageView(message: msg)
                      .padding(.vertical, 24)
                  }
                  else {
                    ChatMessageView(message: msg)
                  }
                }
              }
              .padding()
              
              VStack(spacing: 0) {}.id(bottomID)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
//            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .defaultScrollAnchor(.bottom, for: .alignment)
            .defaultScrollAnchor(.bottom, for: .sizeChanges)
            .onChange(of: model.chat.count) {
              // Re-run search when new messages arrive to keep filter active
              if !searchQuery.isEmpty {
                performSearch()
              }
              reader.scrollTo(bottomID, anchor: .bottom)
              model.markPublicChatAsRead()
            }
            .onAppear {
              self.focusedField = .chatInput
              model.markPublicChatAsRead()
              reader.scrollTo(bottomID, anchor: .bottom)
            }
            .onChange(of: searchQuery) {
              performSearch()
              reader.scrollTo(bottomID, anchor: .bottom)
            }
            .onChange(of: isSearching) {
              reader.scrollTo(bottomID, anchor: .bottom)
            }
          
          // MARK: Input Divider
          Divider()
          
          // MARK: Input Bar
          HStack(alignment: .lastTextBaseline, spacing: 0) {
            TextField("", text: $bindModel.chatInput, axis: .vertical)
              .focused($focusedField, equals: .chatInput)
              .textFieldStyle(.plain)
              .lineLimit(1...5)
              .multilineTextAlignment(.leading)
              .onSubmit {
                if !model.chatInput.isEmpty {
                  let message = model.chatInput
                  let announce = NSEvent.modifierFlags.contains(.shift)
                  Task {
                    try? await model.sendChat(message, announce: announce)
                  }
                }
                model.chatInput = ""
              }
              .frame(maxWidth: .infinity)
              .padding()
          }
          .frame(maxWidth: .infinity, minHeight: 28)
          .padding(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
          .overlay(alignment: .leadingLastTextBaseline) {
            Image(systemName: "chevron.right").fontWeight(.semibold).opacity(0.4).offset(x: 16)
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
          .onTapGesture(count: 1) {
            focusedField = .chatInput
          }
        }
      }
      .searchable(text: $searchQuery, isPresented: $isSearching, placement: .toolbar, prompt: "Search")
      .background(Button("", action: { isSearching = true }).keyboardShortcut("f").hidden())
    }
    .background(Color(nsColor: .textBackgroundColor))
//    .navigationTitle(model.serverTitle)
    .onAppear {
      stableBannerFileURL = model.bannerFileURL
      stableBannerIsAnimated = model.bannerImageFormat == .gif
    }
    .onChange(of: model.bannerFileURL) { _, newValue in
      stableBannerFileURL = newValue
      stableBannerIsAnimated = model.bannerImageFormat == .gif
    }
//    .toolbar {
//      ToolbarItem(placement: .primaryAction) {
//        Button {
//          showingExporter = true
//        } label: {
//          Image(systemName: "square.and.arrow.up")
//        }.help("Save Chat...")
//      }
//    }
//    .fileExporter(isPresented: $showingExporter, document: self.chatDocument, contentType: .utf8PlainText, defaultFilename: "\(self.model.serverTitle) Chat.txt") { result in
//      switch result {
//      case .success(let url):
//        print("Saved to \(url)")
//        
//      case .failure(let error):
//        print(error.localizedDescription)
//      }
//      self.chatDocument.text = ""
//    }
  }

  private func performSearch() {
    guard !searchQuery.isEmpty else {
      searchResults = []
      return
    }

    searchResults = model.searchChat(query: searchQuery)
  }

//  private func prepareChatDocument() -> Bool {
//    var text: String = String()
//    
//    self.chatDocument.text = ""
//    for msg in model.chat {
//      if msg.type == .agreement {
//        text.append(msg.text)
//        text.append("\n\n")
//      }
//      else if msg.type == .message {
//        if let username = msg.username {
//          text.append("\(username): \(msg.text)")
//        }
//        else {
//          text.append(msg.text)
//        }
//        text.append("\n")
//      }
//      else if msg.type == .status {
//        text.append(msg.text)
//        text.append("\n")
//      }
//    }
//    
//    if text.isEmpty {
//      return false
//    }
//    
//    self.chatDocument.text = text
//    
//    return true
//  }
}

#Preview {
  ChatView()
    .environment(HotlineState())
}
