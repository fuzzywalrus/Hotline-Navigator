import Foundation
import SwiftUI
import UniformTypeIdentifiers

extension FileManager {
  @discardableResult
  func moveToDownloads(from sourceURL: URL, using filename: String, bounceDock: Bool = false) -> Bool {
    let filePath = URL.downloadsDirectory.generateUniqueFilePath(filename: filename)
    let destinationURL = URL(filePath: filePath).resolvingSymlinksInPath()
    
    do {
      try FileManager.default.moveItem(at: sourceURL.resolvingSymlinksInPath(), to: destinationURL)
    }
    catch {
      return false
    }
    
    if bounceDock {
      #if os(macOS)
      DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: destinationURL.path)
      #endif
    }
    
    return true
  }
  
  @discardableResult
  func copyToDownloads(from sourceURL: URL, using filename: String, bounceDock: Bool = false) -> Bool {
    let filePath = URL.downloadsDirectory.generateUniqueFilePath(filename: filename)
    let destinationURL = URL(filePath: filePath).resolvingSymlinksInPath()
    
    do {
      try FileManager.default.copyItem(at: sourceURL.resolvingSymlinksInPath(), to: destinationURL)
    }
    catch {
      return false
    }
    
    if bounceDock {
      #if os(macOS)
      DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: destinationURL.path)
      #endif
    }
    
    return true
  }
}

// MARK: -

extension View {
  @ViewBuilder
  func applyNavigationDocumentIfPresent(_ url: URL?) -> some View {
    if let url {
      self.navigationDocument(url)
    } else {
      self
    }
  }
}

// MARK: -

extension Data {
  func saveAsFileToDownloads(filename: String, bounceDock: Bool = true) -> Bool {
    let filePath = URL.downloadsDirectory.generateUniqueFilePath(filename: filename)
    
    if FileManager.default.createFile(atPath: filePath, contents: self) {
      if bounceDock {
        #if os(macOS)
        var downloadURL = URL(filePath: filePath)
        downloadURL.resolveSymlinksInPath()
        DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: downloadURL.path)
        #endif
      }
      return true
    
//    if FileManager.default.createFile(atPath: filePath, contents: nil) {
//      if let h = FileHandle(forWritingAtPath: filePath) {
//        try? h.write(contentsOf: self)
//        try? h.close()
//        
//      }
    }
    return false
  }
  
  enum ImageFormat {
    case gif
    case jpeg
    case png
    case webp
    case unknown
  }
  
  var detectedImageFormat: ImageFormat {
    guard self.count >= 12 else { return .unknown }
    
    let bytes = [UInt8](self.prefix(12))
    
    // GIF: "GIF8"
    if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38 {
      return .gif
    }
    
    // JPEG: FF D8 FF
    if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
      return .jpeg
    }
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A {
      return .png
    }
    
    // WebP: "RIFF" at 0-3 and "WEBP" at 8-11
    if bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50 {
      return .webp
    }
    
    return .unknown
  }
}

// MARK: -

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
  
  func generateUniqueFileURL(filename base: String) -> URL {
    let filePath = self.generateUniqueFilePath(filename: base)
    return URL(filePath: filePath)
  }
}

// MARK: -

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

// MARK: -

extension String {
  
  var isBlank: Bool {
    self.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
  
  func markdownToAttributedString() -> AttributedString {
    let markdownText = self.convertingLinksToMarkdown()
    let attr = (try? AttributedString(markdown: markdownText, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(self)
    
    return attr
  }
  
  func convertToAttributedStringWithLinks() -> AttributedString {
    let attributedString: NSMutableAttributedString = NSMutableAttributedString(string: self)
    let matches = self.ranges(of: RegularExpressions.relaxedLink)
    for match in matches {
      let matchString = String(self[match])
      if matchString.isEmailAddress() {
        attributedString.addAttribute(.link, value: "mailto:\(matchString)", range: NSRange(match, in: self))
      }
      else {
        attributedString.addAttribute(.link, value: matchString, range: NSRange(match, in: self))
      }
//      attributedString.addAttribute(.underlineStyle, value: 1, range: NSRange(match, in: self))
    }
    return AttributedString(attributedString)
  }
  
  func isEmailAddress() -> Bool {
    self.wholeMatch(of: RegularExpressions.emailAddress) != nil
  }
  
  func isWebURL() -> Bool {
    guard let url = URL(string: self) else {
      return false
    }
    switch url.scheme?.lowercased() {
    case "http", "https":
      return true
    default:
      return false
    }
  }
  
  func isImageURL() -> Bool {
    guard let url = URL(string: self) else {
      return false
    }
    
    switch url.pathExtension.lowercased() {
    case "jpg", "jpeg", "png", "gif":
      return true
    default:
      return false
    }
  }
  
  func convertingLinksToMarkdown() -> String {
//    var cp = String(self)
    
    self.replacing(RegularExpressions.relaxedLink) { match in
      let linkText = self[match.range]
      
      // Only add https:// if the link doesn't already have a scheme
      let hasScheme = (try? RegularExpressions.supportedLinkScheme.prefixMatch(in: linkText)) != nil
      let url = hasScheme ? String(linkText) : "https://\(linkText)"
      
      return "[\(linkText)](\(url))"
    }
    
//    cp.replace(RegularExpressions.relaxedLink) { match -> String in
//      let linkText = self[match.range]
//      var injectedScheme = "https://"
//      if let _ = try? RegularExpressions.supportedLinkScheme.prefixMatch(in: linkText) {
//        injectedScheme = ""
//      }
//
//      return "[\(linkText)](\(injectedScheme)\(linkText))"
//    }
//    return cp
  }
}

// MARK: -

extension Binding where Value: OptionSet, Value == Value.Element {
  func bindedValue(_ options: Value) -> Bool {
    return wrappedValue.contains(options)
  }
  
  func bind(_ options: Value) -> Binding<Bool> {
    return .init { () -> Bool in
      self.wrappedValue.contains(options)
    } set: { newValue in
      if newValue {
        self.wrappedValue.insert(options)
      } else {
        self.wrappedValue.remove(options)
      }
    }
  }
}

// MARK: -

extension Color {
  init(hex: Int, opacity: Double = 1.0) {
    self.init(red: Double((hex >> 16) & 0xFF) / 255.0, green: Double((hex >> 8) & 0xFF) / 255.0, blue: Double(hex & 0xFF) / 255.0, opacity: opacity)
  }
}
