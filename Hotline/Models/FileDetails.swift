import UniformTypeIdentifiers

public struct FileDetails: Identifiable {
  public let id: UUID = UUID()
  var name: String
  var path: [String]
  var size: Int
  var comment: String
  var type: String
  var creator: String
  var created: Date
  var modified: Date
}
