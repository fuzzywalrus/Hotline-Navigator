import SwiftUI

enum ChatMessageType {
  case agreement
  case joined
  case left
  case message
  case server
  case signOut
}

extension ChatMessageType {
  var storageKey: String {
    switch self {
    case .agreement:
      return "agreement"
    case .joined:
      return "joined"
    case .left:
      return "left"
    case .message:
      return "message"
    case .server:
      return "server"
    case .signOut:
      return "signOut"
    }
  }

  init?(storageKey: String) {
    switch storageKey {
    case "agreement":
      self = .agreement
    case "joined":
      self = .joined
    case "left":
      self = .left
    case "message":
      self = .message
    case "server":
      self = .server
    case "signOut":
      self = .signOut
    default:
      return nil
    }
  }
}

struct ChatMessage: Identifiable {
  let id: UUID

  let text: String
  let type: ChatMessageType
  let date: Date
  let username: String?
  let isEmote: Bool
  var iconID: UInt?
  var isAdmin: Bool
  var metadata: ChatStore.EntryMetadata?

  static let parser = /^\s*([^\:]+):\s*([\s\S]+)$/
  static let emoteParser = /^\s*\*{3}\s+(.+)$/

  init(text: String, type: ChatMessageType, date: Date) {
    self.id = UUID()
    self.type = type
    self.date = date
    self.iconID = nil
    self.isAdmin = false
    self.metadata = nil

    if
      type == .message,
      let match = text.firstMatch(of: ChatMessage.parser) {
      self.username = String(match.1)
      self.text = String(match.2)
      self.isEmote = false
    }
    else if
      type == .message,
      text.firstMatch(of: ChatMessage.emoteParser) != nil {
      self.username = nil
      self.text = text
      self.isEmote = true
    }
    else {
      self.username = nil
      self.text = text
      self.isEmote = false
    }
  }
}
