import SwiftUI

enum InstantMessageType {
  case message
}

enum InstantMessageDirection {
  case incoming
  case outgoing
}

struct InstantMessage: Identifiable {
  let id: UUID
  let direction: InstantMessageDirection
  let senderName: String
  let senderIconID: UInt
  let receiverName: String
  let receiverIconID: UInt
  let text: String
  let type: InstantMessageType
  let date: Date
  var isRead: Bool
  let senderIsAdmin: Bool

  init(id: UUID = UUID(), direction: InstantMessageDirection, senderName: String, senderIconID: UInt = 0, receiverName: String = "", receiverIconID: UInt = 0, text: String, type: InstantMessageType, date: Date, isRead: Bool = true, senderIsAdmin: Bool = false) {
    self.id = id
    self.direction = direction
    self.senderName = senderName
    self.senderIconID = senderIconID
    self.receiverName = receiverName
    self.receiverIconID = receiverIconID
    self.text = text
    self.type = type
    self.date = date
    self.isRead = isRead
    self.senderIsAdmin = senderIsAdmin
  }
}
