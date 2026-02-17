import SwiftUI

struct MessageBoardView: View {
  @Environment(HotlineState.self) private var model: HotlineState
  
  @State private var composerDisplayed: Bool = false
  @State private var composerText: String = ""
  
  var body: some View {
    NavigationStack {
      if self.model.access?.contains(.canReadMessageBoard) != true {
        self.disabledBoardView
      }
      else if self.model.messageBoardLoaded && self.model.messageBoard.isEmpty {
        self.emptyBoardView
      }
      else {
        self.messageBoardView
      }
    }
    .sheet(isPresented: $composerDisplayed) {
      MessageBoardEditorView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .frame(idealWidth: 450, idealHeight: 350)
    }
    .toolbar {
      ToolbarItem(placement:.primaryAction) {
        Button {
          self.composerDisplayed.toggle()
        } label: {
          Image(systemName: "square.and.pencil")
        }
        .disabled((self.model.access?.contains(.canPostMessageBoard) != true) || (self.model.access?.contains(.canReadMessageBoard) != true))
        .help("Post to Message Board")
      }
    }
    .task {
      if !self.model.messageBoardLoaded {
        let _ = try? await self.model.getMessageBoard()
      }
    }
  }
  
  private var disabledBoardView: some View {
    ContentUnavailableView {
      Label("No Message Board", systemImage: "quote.bubble")
    } description: {
      Text("This server has turned off their message board")
    }
  }
  
  private var emptyBoardView: some View {
    ContentUnavailableView {
      Label("No Posts", systemImage: "quote.bubble")
    } description: {
      Text("Message board posts will appear here")
    }
  }
  
  private static let relativeDateFormatter: RelativeDateTimeFormatter = {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .full
    formatter.dateTimeStyle = .named
    formatter.formattingContext = .listItem
    return formatter
  }()

  private var messageBoardView: some View {
    ScrollView {
      LazyVStack(alignment: .leading) {
        ForEach(self.model.messageBoard) { post in
          VStack(alignment: .leading, spacing: 4) {
            if post.username != nil || post.date != nil || post.rawDateString != nil {
              HStack {
                Text(post.username ?? "Unknown")
                  .fontWeight(.bold)
                if let date = post.date {
                  Text(Self.relativeDateFormatter.localizedString(for: date, relativeTo: Date.now))
                    .foregroundStyle(.secondary)
                    .help(post.rawDateString ?? "")
                } else if let rawDate = post.rawDateString {
                  Text(rawDate)
                    .foregroundStyle(.secondary)
                }
              }
              .textSelection(.enabled)
            }
            Text(LocalizedStringKey(post.body))
              .tint(Color("Link Color"))
              .lineLimit(100)
              .lineSpacing(4)
              .textSelection(.enabled)
          }
          .padding(.horizontal, 24)
          .padding(.vertical, 16)
          
          Divider()
        }
      }
    }
    .defaultScrollAnchor(.top)
    .overlay {
      if !self.model.messageBoardLoaded {
        VStack {
          ProgressView()
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity)
      }
    }
    .background(Color(nsColor: .textBackgroundColor))
  }
}

#Preview {
  MessageBoardView()
    .environment(HotlineState())
}
