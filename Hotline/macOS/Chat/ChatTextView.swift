import SwiftUI
import AppKit

// MARK: - ChatLayoutManager

/// Custom layout manager that draws rounded-rect backgrounds behind server messages.
private class ChatLayoutManager: NSLayoutManager {
  static let serverMessageKey = NSAttributedString.Key("serverMessageBackground")
  
  private let bubblePaddingH: CGFloat = 20
  private let bubblePaddingV: CGFloat = 10
  private let bubbleCornerRadius: CGFloat = 10
  
  override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
    super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
    
    guard let textStorage = self.textStorage, let textContainer = self.textContainers.first else { return }
    let charRange = self.characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
    
    textStorage.enumerateAttribute(Self.serverMessageKey, in: charRange, options: []) { value, range, _ in
      guard value != nil else { return }
      
      let glyphRange = self.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
      let boundingRect = self.boundingRect(forGlyphRange: glyphRange, in: textContainer)
      
      let bgRect = NSRect(
        x: origin.x,
        y: boundingRect.minY - self.bubblePaddingV + origin.y,
        width: textContainer.size.width,
        height: boundingRect.height + self.bubblePaddingV * 2
      )
      
      NSColor.textColor.withAlphaComponent(0.06).setFill()
      NSBezierPath(roundedRect: bgRect, xRadius: self.bubbleCornerRadius, yRadius: self.bubbleCornerRadius).fill()
    }
  }
}

// MARK: - ChatTextView (NSViewRepresentable)

struct ChatTextView: NSViewRepresentable {
  let messages: [ChatMessage]
  var searchQuery: String = ""
  var isFiltered: Bool = false
  var cachedText: NSAttributedString?
  var cachedCount: Int = 0
  var onCacheUpdate: ((NSAttributedString, Int) -> Void)?
  
  func makeCoordinator() -> Coordinator {
    Coordinator()
  }
  
  func makeNSView(context: Context) -> NSScrollView {
    let textView = BottomAnchoredTextView()
    textView.textContainer?.replaceLayoutManager(ChatLayoutManager())
    textView.isEditable = false
    textView.isSelectable = true
    textView.drawsBackground = false
    textView.isRichText = true
    textView.usesFindBar = false
    textView.textContainerInset = NSSize(width: 24, height: 24)
    textView.isAutomaticLinkDetectionEnabled = false
    textView.font = .systemFont(ofSize: NSFont.systemFontSize)
    textView.autoresizingMask = [.width]
    
    // Link attributes: asset catalog color + pointing hand cursor, no underline
    textView.linkTextAttributes = [
      .foregroundColor: NSColor(named: "Link Color") ?? .linkColor,
      .cursor: NSCursor.pointingHand,
    ]
    
    let scrollView = BottomPinningScrollView()
    scrollView.documentView = textView
    scrollView.hasVerticalScroller = true
    scrollView.hasHorizontalScroller = false
    scrollView.drawsBackground = false
    scrollView.autohidesScrollers = true
    scrollView.pinnedTextView = textView
    
    context.coordinator.textView = textView
    context.coordinator.scrollView = scrollView
    
    return scrollView
  }
  
  func updateNSView(_ scrollView: NSScrollView, context: Context) {
    let coordinator = context.coordinator
    coordinator.onCacheUpdate = self.isFiltered ? nil : self.onCacheUpdate
    
    if coordinator.needsFullRebuild(for: self.messages) {
      coordinator.rebuildAll(messages: self.messages, cachedText: self.isFiltered ? nil : self.cachedText, cachedCount: self.isFiltered ? 0 : self.cachedCount)
    } else if self.messages.count > coordinator.renderedCount {
      coordinator.appendMessages(messages: self.messages)
    }
    
    if coordinator.currentSearchQuery != self.searchQuery {
      coordinator.applySearchHighlights(query: self.searchQuery)
    }
  }
  
  // MARK: - Coordinator
  
  class Coordinator {
    weak var textView: BottomAnchoredTextView?
    weak var scrollView: NSScrollView? {
      didSet { self.observeScroll() }
    }
    var onCacheUpdate: ((NSAttributedString, Int) -> Void)?
    var renderedCount = 0
    var currentSearchQuery = ""
    private var lastMessageIDs: [UUID] = []
    private var scrollObserver: NSObjectProtocol?
    private var highlightedCharRange: NSRange = NSRange(location: NSNotFound, length: 0)
    private var lastHighlightedVisibleOriginY: CGFloat = -.greatestFiniteMagnitude
    
    private func observeScroll() {
      self.scrollObserver = nil
      guard let scrollView = self.scrollView else { return }
      scrollView.contentView.postsBoundsChangedNotifications = true
      self.scrollObserver = NotificationCenter.default.addObserver(
        forName: NSView.boundsDidChangeNotification,
        object: scrollView.contentView,
        queue: .main
      ) { [weak self] _ in
        self?.scrollDidChange()
      }
    }
    
    private func scrollDidChange() {
      guard !self.currentSearchQuery.isEmpty,
            let scrollView = self.scrollView else { return }
      let visibleY = scrollView.contentView.bounds.origin.y
      let viewportH = scrollView.contentView.bounds.height
      // Only re-highlight when scrolled beyond half the viewport from last highlight center
      if abs(visibleY - self.lastHighlightedVisibleOriginY) > viewportH * 0.5 {
        self.highlightVisibleRange()
      }
    }
    
    deinit {
      if let observer = self.scrollObserver {
        NotificationCenter.default.removeObserver(observer)
      }
    }
    
    func needsFullRebuild(for messages: [ChatMessage]) -> Bool {
      if messages.count < self.renderedCount { return true }
      if self.renderedCount == 0 && messages.isEmpty { return false }
      if self.renderedCount == 0 { return true }
      for i in 0..<min(self.renderedCount, messages.count, self.lastMessageIDs.count) {
        if messages[i].id != self.lastMessageIDs[i] { return true }
      }
      return false
    }
    
    func rebuildAll(messages: [ChatMessage], cachedText: NSAttributedString?, cachedCount: Int) {
      guard let textView = self.textView else { return }
      guard let storage = textView.textStorage else { return }
      
      // Reset bottom offset before changing content so layout doesn't use a stale value.
      textView.cachedBottomOffset = 0
      
      // Try to restore from cache if it matches the current messages
      if let cached = cachedText,
         cachedCount == messages.count,
         cachedCount > 0 {
        storage.beginEditing()
        storage.setAttributedString(cached)
        storage.endEditing()
        
        self.renderedCount = cachedCount
        self.lastMessageIDs = messages.map(\.id)
        textView.invalidateBottomOffset()
        textView.needsDisplay = true
        self.scrollToBottom()
        return
      }
      
      storage.beginEditing()
      storage.setAttributedString(NSAttributedString())
      for (index, msg) in messages.enumerated() {
        if index > 0 {
          storage.append(NSAttributedString(string: "\n"))
        }
        storage.append(self.renderMessage(msg))
      }
      storage.endEditing()
      
      self.renderedCount = messages.count
      self.lastMessageIDs = messages.map(\.id)
      textView.invalidateBottomOffset()
      textView.needsDisplay = true
      
      // Save to cache
      self.onCacheUpdate?(NSAttributedString(attributedString: storage), self.renderedCount)
      
      if !self.currentSearchQuery.isEmpty {
        self.highlightedCharRange = NSRange(location: NSNotFound, length: 0)
        self.lastHighlightedVisibleOriginY = -.greatestFiniteMagnitude
        self.highlightVisibleRange()
      }
      
      self.scrollToBottom()
    }
    
    func appendMessages(messages: [ChatMessage]) {
      guard let textView = self.textView else { return }
      guard let storage = textView.textStorage else { return }
      
      let wasAtBottom = self.isScrolledToBottom()
      let startIndex = self.renderedCount
      
      storage.beginEditing()
      for i in startIndex..<messages.count {
        if storage.length > 0 {
          storage.append(NSAttributedString(string: "\n"))
        }
        storage.append(self.renderMessage(messages[i]))
      }
      storage.endEditing()
      
      self.renderedCount = messages.count
      self.lastMessageIDs = messages.map(\.id)
      
      // Update cache
      self.onCacheUpdate?(NSAttributedString(attributedString: storage), self.renderedCount)
      
      if !self.currentSearchQuery.isEmpty {
        self.highlightedCharRange = NSRange(location: NSNotFound, length: 0)
        self.lastHighlightedVisibleOriginY = -.greatestFiniteMagnitude
        self.highlightVisibleRange()
      }
      
      if wasAtBottom || startIndex == 0 {
        self.scrollToBottom()
      }
    }
    
    func scrollToBottom() {
      guard let textView = self.textView else { return }
      DispatchQueue.main.async {
        textView.invalidateBottomOffset()
        textView.scrollToEndOfDocument(nil)
      }
    }
    
    func isScrolledToBottom() -> Bool {
      guard let scrollView = self.scrollView else { return true }
      let clipView = scrollView.contentView
      let docHeight = scrollView.documentView?.frame.height ?? 0
      let clipHeight = clipView.bounds.height
      if docHeight <= clipHeight { return true }
      let scrollY = clipView.bounds.origin.y
      let inset = self.textView?.textContainerInset.height ?? 0
      return scrollY + clipHeight >= docHeight - (inset * 2 + 20)
    }
    
    // MARK: - Search Highlighting
    
    func applySearchHighlights(query: String) {
      guard let layoutManager = self.textView?.layoutManager,
            let storage = self.textView?.textStorage else { return }
      
      // Clear all previous highlights when query changes
      if self.highlightedCharRange.location != NSNotFound {
        layoutManager.removeTemporaryAttribute(.backgroundColor, forCharacterRange: self.highlightedCharRange)
        layoutManager.removeTemporaryAttribute(.foregroundColor, forCharacterRange: self.highlightedCharRange)
        self.highlightedCharRange = NSRange(location: NSNotFound, length: 0)
      }
      
      self.currentSearchQuery = query
      self.lastHighlightedVisibleOriginY = -.greatestFiniteMagnitude
      
      if !query.isEmpty {
        self.highlightVisibleRange()
      }
    }
    
    func highlightVisibleRange() {
      guard !self.currentSearchQuery.isEmpty,
            let textView = self.textView,
            let layoutManager = textView.layoutManager,
            let textContainer = textView.textContainer,
            let storage = textView.textStorage,
            let scrollView = self.scrollView else { return }
      
      // Compute a buffer zone: 2x the viewport height centered on the visible area
      let clipBounds = scrollView.contentView.bounds
      let viewportH = clipBounds.height
      let bufferH = viewportH * 2
      let bufferMinY = max(0, clipBounds.origin.y - bufferH / 2)
      let bufferMaxY = clipBounds.origin.y + viewportH + bufferH / 2
      let bufferRect = NSRect(x: 0, y: bufferMinY, width: textView.bounds.width, height: bufferMaxY - bufferMinY)
      
      // Convert the buffer rect to a character range via the layout manager
      let glyphRange = layoutManager.glyphRange(forBoundingRect: bufferRect, in: textContainer)
      let charRange = layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
      
      guard charRange.length > 0 else { return }
      
      // Clear previous highlights
      if self.highlightedCharRange.location != NSNotFound {
        layoutManager.removeTemporaryAttribute(.backgroundColor, forCharacterRange: self.highlightedCharRange)
        layoutManager.removeTemporaryAttribute(.foregroundColor, forCharacterRange: self.highlightedCharRange)
      }
      
      // Apply highlights within the buffer zone
      let highlightBg = NSColor.systemYellow.withAlphaComponent(0.5)
      let highlightFg = NSColor.black
      let searchString = storage.string as NSString
      var searchRange = charRange
      
      while searchRange.location < NSMaxRange(charRange) && searchRange.length > 0 {
        let foundRange = searchString.range(
          of: self.currentSearchQuery,
          options: [.caseInsensitive, .literal],
          range: searchRange
        )
        guard foundRange.location != NSNotFound, foundRange.location < NSMaxRange(charRange) else { break }
        
        layoutManager.addTemporaryAttribute(.backgroundColor, value: highlightBg, forCharacterRange: foundRange)
        layoutManager.addTemporaryAttribute(.foregroundColor, value: highlightFg, forCharacterRange: foundRange)
        
        searchRange.location = NSMaxRange(foundRange)
        searchRange.length = NSMaxRange(charRange) - searchRange.location
      }
      
      self.highlightedCharRange = charRange
      self.lastHighlightedVisibleOriginY = clipBounds.origin.y
    }
    
    // MARK: - Message Rendering
    
    func renderMessage(_ msg: ChatMessage) -> NSAttributedString {
      switch msg.type {
      case .message:
        return msg.isEmote ? self.renderEmoteMessage(msg) : self.renderChatMessage(msg)
      case .joined:
        return self.renderJoinedMessage(msg)
      case .left:
        return self.renderLeftMessage(msg)
      case .signOut:
        return self.renderSignOutMessage(msg)
      case .server:
        return self.renderServerMessage(msg)
      case .agreement:
        return NSAttributedString()
      }
    }
    
    private var baseFont: NSFont {
      .systemFont(ofSize: NSFont.systemFontSize)
    }
    
    private var semiboldFont: NSFont {
      .systemFont(ofSize: NSFont.systemFontSize, weight: .semibold)
    }
    
    private var linkColor: NSColor {
      NSColor(named: "Link Color") ?? .linkColor
    }
    
    private func renderEmoteMessage(_ msg: ChatMessage) -> NSAttributedString {
      let paraStyle = NSMutableParagraphStyle()
      paraStyle.firstLineHeadIndent = 0
      paraStyle.headIndent = 12
      paraStyle.lineSpacing = 3
      paraStyle.paragraphSpacing = 8
      
      let italicDescriptor = self.baseFont.fontDescriptor.withSymbolicTraits(.italic)
      let italicFont = NSFont(descriptor: italicDescriptor, size: self.baseFont.pointSize) ?? self.baseFont
      
      // Strip "*** " prefix for display
      let displayText: String
      if let match = msg.text.firstMatch(of: ChatMessage.emoteParser) {
        displayText = String(match.1)
      } else {
        displayText = msg.text
      }
      
      return NSAttributedString(
        string: displayText,
        attributes: [
          .font: italicFont,
          .foregroundColor: NSColor.secondaryLabelColor,
          .paragraphStyle: paraStyle,
        ]
      )
    }
    
    private func renderChatMessage(_ msg: ChatMessage) -> NSAttributedString {
      let result = NSMutableAttributedString()
      
      // Hanging indent: first line flush, wrapped lines indented
      let paraStyle = NSMutableParagraphStyle()
      paraStyle.firstLineHeadIndent = 0
      paraStyle.headIndent = 12
      paraStyle.lineSpacing = 3
      paraStyle.paragraphSpacing = 8
      
      // Replace newlines with line separators so the entire message stays
      // in one paragraph, keeping headIndent on all lines after the first.
      let bodyText = msg.text.replacingOccurrences(of: "\n", with: "\u{2028}")
      
      if let username = msg.username {
        let usernameAttr = NSAttributedString(
          string: "\(username): ",
          attributes: [
            .font: self.semiboldFont,
            .foregroundColor: NSColor.textColor,
            .paragraphStyle: paraStyle,
          ]
        )
        result.append(usernameAttr)
        
        let bodyAttr = bodyText.toNSAttributedStringWithMarkdownAndLinks(
          baseFont: self.baseFont,
          linkColor: self.linkColor,
          paragraphStyle: paraStyle
        )
        result.append(bodyAttr)
      } else {
        let bodyAttr = bodyText.toNSAttributedStringWithMarkdownAndLinks(
          baseFont: self.baseFont,
          linkColor: self.linkColor,
          paragraphStyle: paraStyle
        )
        result.append(bodyAttr)
      }
      
      return result
    }
    
    private func renderJoinedMessage(_ msg: ChatMessage) -> NSAttributedString {
      let paraStyle = NSMutableParagraphStyle()
      paraStyle.lineSpacing = 2
      paraStyle.paragraphSpacing = 8
      
      let arrow = "\u{2192} " // right arrow
      let text = arrow + msg.text
      return NSAttributedString(
        string: text,
        attributes: [
          .font: self.baseFont,
          .foregroundColor: NSColor.secondaryLabelColor,
          .paragraphStyle: paraStyle,
        ]
      )
    }
    
    private func renderLeftMessage(_ msg: ChatMessage) -> NSAttributedString {
      let paraStyle = NSMutableParagraphStyle()
      paraStyle.lineSpacing = 2
      paraStyle.paragraphSpacing = 8
      
      let arrow = "\u{2190} " // left arrow
      let text = arrow + msg.text
      return NSAttributedString(
        string: text,
        attributes: [
          .font: self.baseFont,
          .foregroundColor: NSColor.secondaryLabelColor,
          .paragraphStyle: paraStyle,
        ]
      )
    }
    
    private func renderSignOutMessage(_ msg: ChatMessage) -> NSAttributedString {
      let paraStyle = NSMutableParagraphStyle()
      paraStyle.paragraphSpacingBefore = 10 // + 8 from preceding message's paragraphSpacing = 18
      paraStyle.paragraphSpacing = 18
      paraStyle.alignment = .center
      
      let attachment = NSTextAttachment()
      let dateText = ChatDividerCell.formatDate(msg.date)
      let cell = ChatDividerCell(dateText: dateText)
      attachment.attachmentCell = cell
      
      let result = NSMutableAttributedString(attachment: attachment)
      result.addAttribute(.paragraphStyle, value: paraStyle, range: NSRange(location: 0, length: result.length))
      return result
    }
    
    private func renderServerMessage(_ msg: ChatMessage) -> NSAttributedString {
      let result = NSMutableAttributedString()
      
      let paraStyle = NSMutableParagraphStyle()
      paraStyle.paragraphSpacingBefore = 16 // + 8 from preceding message's paragraphSpacing = 24
      paraStyle.paragraphSpacing = 24
      paraStyle.alignment = .center
      paraStyle.lineSpacing = 3
      paraStyle.headIndent = 28
      
      // Icon attachment
      if let image = NSImage(named: "Server Message") {
        let attachment = NSTextAttachment()
        attachment.image = NSImage(size: NSSize(width: 20, height: 20), flipped: true) { rect in
          image.draw(in: rect)
          return true
        }
        attachment.bounds = CGRect(x: 0, y: -4, width: 20, height: 20)
        result.append(NSAttributedString(attachment: attachment))
        result.append(NSAttributedString(string: "  "))
      }
      
      // Text — use line separator (\u{2028}) instead of newlines to keep
      // everything in one paragraph so headIndent applies to all lines
      // and paragraph spacing doesn't repeat between lines.
      let displayText = msg.text.replacingOccurrences(of: "\\n\\s*", with: "\u{2028}", options: .regularExpression)
      let textAttr = NSAttributedString(
        string: displayText,
        attributes: [
          .font: self.semiboldFont,
          .foregroundColor: NSColor.textColor,
        ]
      )
      result.append(textAttr)
      
      let fullRange = NSRange(location: 0, length: result.length)
      result.addAttribute(.paragraphStyle, value: paraStyle, range: fullRange)
      result.addAttribute(ChatLayoutManager.serverMessageKey, value: true, range: fullRange)
      
      return result
    }
  }
}

// MARK: - BottomAnchoredTextView

/// NSTextView subclass that pushes content to the bottom when content is shorter than the view.
class BottomAnchoredTextView: NSTextView {
  private var hoveredLinkRange: NSRange?
  
  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    for area in self.trackingAreas where area.owner === self {
      self.removeTrackingArea(area)
    }
    let area = NSTrackingArea(
      rect: self.bounds,
      options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    self.addTrackingArea(area)
  }
  
  override func mouseMoved(with event: NSEvent) {
    let point = self.convert(event.locationInWindow, from: nil)
    let charIndex = self.characterIndexForInsertion(at: point)
    
    guard let storage = self.textStorage, charIndex < storage.length else {
      self.clearHoveredLink()
      super.mouseMoved(with: event)
      return
    }
    
    var linkRange = NSRange()
    let linkValue = storage.attribute(.link, at: charIndex, effectiveRange: &linkRange)
    
    if linkValue != nil {
      if self.hoveredLinkRange != linkRange {
        self.clearHoveredLink()
        self.layoutManager?.addTemporaryAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, forCharacterRange: linkRange)
        self.hoveredLinkRange = linkRange
      }
    } else {
      self.clearHoveredLink()
    }
    
    super.mouseMoved(with: event)
  }
  
  override func mouseExited(with event: NSEvent) {
    self.clearHoveredLink()
    super.mouseExited(with: event)
  }
  
  private func clearHoveredLink() {
    if let range = self.hoveredLinkRange {
      self.layoutManager?.removeTemporaryAttribute(.underlineStyle, forCharacterRange: range)
      self.hoveredLinkRange = nil
    }
  }
  
  /// Cached bottom-anchor offset, recalculated when text or frame changes.
  var cachedBottomOffset: CGFloat = 0
  
  func invalidateBottomOffset() {
    guard let container = self.textContainer, let layoutManager = self.layoutManager else {
      self.cachedBottomOffset = 0
      return
    }
    
    layoutManager.ensureLayout(for: container)
    let usedRect = layoutManager.usedRect(for: container)
    let contentHeight = usedRect.height + self.textContainerInset.height * 2
    let clipHeight = self.enclosingScrollView?.contentView.bounds.height ?? self.bounds.height
    let insets = self.enclosingScrollView?.contentInsets ?? NSEdgeInsets()
    let visibleHeight = clipHeight - insets.top - insets.bottom
    
    if contentHeight < visibleHeight {
      self.cachedBottomOffset = visibleHeight - contentHeight
    } else {
      self.cachedBottomOffset = 0
    }
  }
  
  override var textContainerOrigin: NSPoint {
    return NSPoint(x: self.textContainerInset.width, y: self.cachedBottomOffset + self.textContainerInset.height)
  }
}

// MARK: - BottomPinningScrollView

/// NSScrollView subclass that pins to the bottom on resize when the user was already scrolled to bottom.
class BottomPinningScrollView: NSScrollView {
  weak var pinnedTextView: BottomAnchoredTextView?
  private var shouldPinToBottom = true
  private var isAdjusting = false
  
  private func isAtBottom() -> Bool {
    let clipHeight = self.contentView.bounds.height
    guard clipHeight > 0 else { return self.shouldPinToBottom }
    let docHeight = self.documentView?.frame.height ?? 0
    if docHeight <= clipHeight { return true }
    let scrollY = self.contentView.bounds.origin.y
    let inset = self.pinnedTextView?.textContainerInset.height ?? 0
    return scrollY + clipHeight >= docHeight - (inset * 2 + 20)
  }
  
  override func setFrameSize(_ newSize: NSSize) {
    self.shouldPinToBottom = self.isAtBottom()
    self.isAdjusting = true
    super.setFrameSize(newSize)
    self.isAdjusting = false
  }
  
  override func tile() {
    super.tile()
    let clipHeight = self.contentView.bounds.height
    let docHeight = self.documentView?.frame.height ?? 0
    if self.shouldPinToBottom && docHeight > clipHeight {
      self.isAdjusting = true
      self.contentView.setBoundsOrigin(NSPoint(x: 0, y: docHeight - clipHeight))
      self.isAdjusting = false
    }
    // Defer invalidateBottomOffset to avoid calling ensureLayout during tile(),
    // which can trigger a Metal validation crash during resize.
    DispatchQueue.main.async { [weak self] in
      self?.pinnedTextView?.invalidateBottomOffset()
    }
  }
  
  override func reflectScrolledClipView(_ cView: NSClipView) {
    super.reflectScrolledClipView(cView)
    if !self.isAdjusting {
      self.shouldPinToBottom = self.isAtBottom()
    }
  }
}

// MARK: - Chat Divider Cell

/// Custom attachment cell that draws horizontal divider lines flanking a centered date label.
fileprivate class ChatDividerCell: NSTextAttachmentCell {
  private let dateText: String
  private let dateFont = NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)
  private let dateColor = NSColor.secondaryLabelColor
  
  init(dateText: String) {
    self.dateText = dateText
    super.init()
  }
  
  required init(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
  
  private var textAttributes: [NSAttributedString.Key: Any] {
    [
      .font: self.dateFont,
      .foregroundColor: self.dateColor,
    ]
  }
  
  override func cellSize() -> NSSize {
    let textSize = (self.dateText as NSString).size(withAttributes: self.textAttributes)
    return NSSize(width: 10000, height: textSize.height + 4)
  }
  
  override func draw(withFrame cellFrame: NSRect, in controlView: NSView?) {
    let textSize = (self.dateText as NSString).size(withAttributes: self.textAttributes)
    let textX = (cellFrame.width - textSize.width) / 2
    let textY = (cellFrame.height - textSize.height) / 2
    
    // Draw text
    let textRect = NSRect(x: cellFrame.minX + textX, y: cellFrame.minY + textY, width: textSize.width, height: textSize.height)
    (self.dateText as NSString).draw(in: textRect, withAttributes: self.textAttributes)
    
    // Draw lines
    let lineY = cellFrame.midY
    let lineInset: CGFloat = 0
    let gap: CGFloat = 8
    
    self.dateColor.withAlphaComponent(0.25).setStroke()
    let path = NSBezierPath()
    path.lineWidth = 0.5
    
    // Left line
    let leftEnd = cellFrame.minX + textX - gap
    if leftEnd > cellFrame.minX + lineInset {
      path.move(to: NSPoint(x: cellFrame.minX + lineInset, y: lineY))
      path.line(to: NSPoint(x: leftEnd, y: lineY))
    }
    
    // Right line
    let rightStart = cellFrame.minX + textX + textSize.width + gap
    let rightEnd = cellFrame.maxX - lineInset
    if rightEnd > rightStart {
      path.move(to: NSPoint(x: rightStart, y: lineY))
      path.line(to: NSPoint(x: rightEnd, y: lineY))
    }
    
    path.stroke()
  }
  
  static func formatDate(_ date: Date) -> String {
    let day = Calendar.current.component(.day, from: date)
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
    
    let isCurrentYear = Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: Date())
    let f = DateFormatter()
    f.dateFormat = isCurrentYear
    ? "MMMM d'\(suffix)' \u{2022} h:mm a"
    : "MMMM d'\(suffix)', yyyy \u{2022} h:mm a"
    return f.string(from: date)
  }
}

// MARK: - Preview

#Preview {
  ChatTextView(messages: [
    ChatMessage(text: "admin: Hello everyone! Check out https://example.com", type: .message, date: Date()),
    ChatMessage(text: "guest joined the chat", type: .joined, date: Date()),
    ChatMessage(text: "user: **bold** and *italic* text", type: .message, date: Date()),
    ChatMessage(text: "*** admin waves hello", type: .message, date: Date()),
    ChatMessage(text: "", type: .signOut, date: Date()),
    ChatMessage(text: "Welcome to the server!", type: .server, date: Date()),
    ChatMessage(text: "admin: Back online!", type: .message, date: Date()),
  ])
  .frame(width: 500, height: 400)
}
