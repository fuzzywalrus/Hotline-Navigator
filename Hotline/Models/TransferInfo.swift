import SwiftUI

@Observable
class TransferInfo: Identifiable, Equatable, Hashable {
  var id: UUID = UUID()
  
  var referenceNumber: UInt32
  var title: String
  var size: UInt
  
  // Status
  var completed: Bool = false
  var failed: Bool = false
  var cancelled: Bool = false
  var done: Bool {
    self.completed || self.failed || self.cancelled
  }
  
  var progress: Double = 0.0
  var speed: Double? = nil
  var timeRemaining: TimeInterval? = nil
  
  var isUpload: Bool = false
  var isDownload: Bool {
    get { !self.isUpload }
    set { self.isUpload = !newValue }
  }
  
  // Folder transfers
  var isFolder: Bool = false
  var folderName: String? = nil
  var fileName: String? = nil

  // Server association - tracks which HotlineState this transfer belongs to
  var serverID: UUID
  var serverName: String?

  // For file based transfers
  var fileURL: URL? = nil

  var progressCallback: ((TransferInfo) -> Void)? = nil
  var downloadCallback: ((TransferInfo) -> Void)? = nil
  var uploadCallback: ((TransferInfo) -> Void)? = nil
  var previewCallback: ((TransferInfo, Data) -> Void)? = nil

  init(reference: UInt32, title: String, size: UInt, serverID: UUID, serverName: String? = nil) {
    self.referenceNumber = reference
    self.title = title
    self.size = size
    self.serverID = serverID
    self.serverName = serverName
  }
  
  static func == (lhs: TransferInfo, rhs: TransferInfo) -> Bool {
    return lhs.id == rhs.id
  }
  
  func hash(into hasher: inout Hasher) {
    hasher.combine(self.id)
  }
}
