import Foundation
import UniformTypeIdentifiers

extension URL {
  func generateUniqueFilePath(filename base: String) -> String {
    let fileManager = FileManager.default
    var finalName = base
    var counter = 2
    
    // Helper function to generate a new filename with a counter
    func makeFileName() -> String {
      let baseName = (base as NSString).deletingPathExtension
      let extensionName = (base as NSString).pathExtension
      return extensionName.isEmpty ? "\(baseName) \(counter)" : "\(baseName) \(counter).\(extensionName)"
    }
    
    // Check if file exists and append counter until a unique name is found
    var filePath = self.appending(component: finalName).path(percentEncoded: false)
    while fileManager.fileExists(atPath: filePath) {
      finalName = makeFileName()
      filePath = self.appending(component: finalName).path(percentEncoded: false)
      counter += 1
    }
    
    return filePath
  }
}

extension UTType {
  var canBePreviewedByQuickLook: Bool {
    // QuickLook supports most common document types
    let supportedSupertypes: [UTType] = [
      .image,
      .movie,
      .audio,
      .pdf,
      .font,
      .usdz,
      .text,
      .sourceCode,
      .spreadsheet,
      .presentation,
      
//       Microsoft Office
      .init(filenameExtension: "doc")!,
      .init(filenameExtension: "docx")!,
      .init(filenameExtension: "xls")!,
      .init(filenameExtension: "xlsx")!,
      .init(filenameExtension: "ppt")!,
      .init(filenameExtension: "pptx")!,
    ]
    
    return supportedSupertypes.contains { self.conforms(to: $0) }
  }
}
