import Foundation
import SwiftUI
import UniformTypeIdentifiers

extension Data {
  func saveAsFileToDownloads(filename: String, bounceDock: Bool = true) -> Bool {
    let folderURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    let filePath = folderURL.generateUniqueFilePath(filename: filename)
    if FileManager.default.createFile(atPath: filePath, contents: nil) {
      if let h = FileHandle(forWritingAtPath: filePath) {
        try? h.write(contentsOf: self)
        try? h.close()
        if bounceDock {
          #if os(macOS)
          var downloadURL = URL(filePath: filePath)
          downloadURL.resolveSymlinksInPath()
          DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: downloadURL.path)
          #endif
        }
        return true
      }
    }
    return false
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
