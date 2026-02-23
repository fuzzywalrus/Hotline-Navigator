import SwiftUI

struct MessageBoardView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(HotlineState.self) private var model: HotlineState
  
  @State private var composerDisplayed: Bool = false
  @State private var composerText: String = ""
  
  var body: some View {
    NavigationStack {
      self.messageBoardView
    }
    .overlay {
      if self.model.access?.contains(.canReadMessageBoard) != true {
        self.disabledBoardView
      }
      else if self.model.messageBoardLoaded && self.model.messageBoard.isEmpty {
        self.emptyBoardView
      }
    }
    .background(self.colorScheme == .light ? Color(nsColor: .tertiarySystemFill).ignoresSafeArea() : nil)
//    .containerBackground(.hotlineRed, for: .window)
//    .background(Color(nsColor: .underPageBackgroundColor))
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
    ScrollView(.vertical) {
      LazyVStack(alignment: .leading, spacing: 16) {
        ForEach(self.model.messageBoard) { post in
          
          VStack(alignment: .leading, spacing: 0) {
            if post.username != nil || post.date != nil || post.rawDateString != nil {
              HStack(spacing: 8) {
                Text(post.username ?? "Unknown")
                  .fontWeight(.semibold)
                  .lineLimit(1)
                  .truncationMode(.tail)
                
                Spacer()
                
                if let date = post.date {
                  Text(Self.relativeDateFormatter.localizedString(for: date, relativeTo: Date.now))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .help(post.rawDateString ?? "")
                } else if let rawDate = post.rawDateString {
                  Text(rawDate)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .foregroundStyle(.secondary)
                }
              }
              .textSelection(.enabled)
              .padding(.top, 16)
              .padding(.horizontal, 16)
              .background(
                self.colorScheme == .light
                ? LinearGradient(colors: [.white.opacity(0.2), .white.opacity(0.0)], startPoint: .top, endPoint: .bottom).blendMode(.softLight)
                : LinearGradient(colors: [.white.opacity(0.1), .white.opacity(0.0)], startPoint: .top, endPoint: .bottom).blendMode(.softLight)
              )
//              Divider()
            }
            
            HStack(spacing: 0) {
              Text(LocalizedStringKey(post.body.convertingLinksToMarkdown()))
                .tint(Color("Link Color"))
                .lineLimit(100)
                .lineSpacing(4)
                .textSelection(.enabled)
                .padding(.horizontal, 16)
              
              Spacer(minLength: 0)
            }
            .padding(.vertical, 16)
            
          }
//          .padding(.bottom, 16)
          .background(self.colorScheme == .light ? AnyShapeStyle(Color.clear) : AnyShapeStyle(.thickMaterial))
          .background(self.colorScheme == .light ? Color(nsColor: .controlBackgroundColor) : Color.clear)
          .clipShape(.rect(cornerRadius: 16))
          .shadow(color: .black.opacity(0.08), radius: 2, x: 0, y: 1)
          .padding(.horizontal, 24)
          
//          Divider()
        }
      }
      .padding(.top, 16)
      .padding(.bottom, 24)
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
  }
}

#Preview {
  MessageBoardView()
    .environment(HotlineState())
}
