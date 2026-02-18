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

    guard let textStorage = textStorage, let textContainer = textContainers.first else { return }
    let charRange = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)

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

    if coordinator.needsFullRebuild(for: messages) {
      coordinator.rebuildAll(messages: messages)
    } else if messages.count > coordinator.renderedCount {
      coordinator.appendMessages(messages: messages)
    }
  }

  // MARK: - Coordinator

  class Coordinator {
    weak var textView: BottomAnchoredTextView?
    weak var scrollView: NSScrollView?
    var renderedCount = 0
    private var lastMessageIDs: [UUID] = []

    func needsFullRebuild(for messages: [ChatMessage]) -> Bool {
      if messages.count < renderedCount { return true }
      if renderedCount == 0 && messages.isEmpty { return false }
      if renderedCount == 0 { return false }
      for i in 0..<min(renderedCount, messages.count, lastMessageIDs.count) {
        if messages[i].id != lastMessageIDs[i] { return true }
      }
      return false
    }

    func rebuildAll(messages: [ChatMessage]) {
      guard let textView = textView else { return }
      guard let storage = textView.textStorage else { return }

      storage.beginEditing()
      storage.setAttributedString(NSAttributedString())
      for (index, msg) in messages.enumerated() {
        if index > 0 {
          storage.append(NSAttributedString(string: "\n"))
        }
        storage.append(renderMessage(msg))
      }
      storage.endEditing()

      renderedCount = messages.count
      lastMessageIDs = messages.map(\.id)
      textView.needsDisplay = true
      scrollToBottom()
    }

    func appendMessages(messages: [ChatMessage]) {
      guard let textView = textView else { return }
      guard let storage = textView.textStorage else { return }

      let wasAtBottom = isScrolledToBottom()
      let startIndex = renderedCount

      storage.beginEditing()
      for i in startIndex..<messages.count {
        if storage.length > 0 {
          storage.append(NSAttributedString(string: "\n"))
        }
        storage.append(renderMessage(messages[i]))
      }
      storage.endEditing()

      renderedCount = messages.count
      lastMessageIDs = messages.map(\.id)

      if wasAtBottom || startIndex == 0 {
        scrollToBottom()
      }
    }

    func scrollToBottom() {
      guard let textView = textView else { return }
      guard let layoutManager = textView.layoutManager, let container = textView.textContainer else { return }
      // Force layout to complete before scrolling
      layoutManager.ensureLayout(for: container)
      DispatchQueue.main.async {
        textView.scrollToEndOfDocument(nil)
      }
    }

    func isScrolledToBottom() -> Bool {
      guard let scrollView = scrollView else { return true }
      let clipView = scrollView.contentView
      let docHeight = scrollView.documentView?.frame.height ?? 0
      let clipHeight = clipView.bounds.height
      if docHeight <= clipHeight { return true }
      let scrollY = clipView.bounds.origin.y
      let inset = textView?.textContainerInset.height ?? 0
      return scrollY + clipHeight >= docHeight - (inset * 2 + 20)
    }

    // MARK: - Message Rendering

    func renderMessage(_ msg: ChatMessage) -> NSAttributedString {
      switch msg.type {
      case .message:
        return msg.isEmote ? renderEmoteMessage(msg) : renderChatMessage(msg)
      case .joined:
        return renderJoinedMessage(msg)
      case .left:
        return renderLeftMessage(msg)
      case .signOut:
        return renderSignOutMessage(msg)
      case .server:
        return renderServerMessage(msg)
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

      let italicDescriptor = baseFont.fontDescriptor.withSymbolicTraits(.italic)
      let italicFont = NSFont(descriptor: italicDescriptor, size: baseFont.pointSize) ?? baseFont

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
            .font: semiboldFont,
            .foregroundColor: NSColor.textColor,
            .paragraphStyle: paraStyle,
          ]
        )
        result.append(usernameAttr)

        let bodyAttr = bodyText.toNSAttributedStringWithMarkdownAndLinks(
          baseFont: baseFont,
          linkColor: linkColor,
          paragraphStyle: paraStyle
        )
        result.append(bodyAttr)
      } else {
        let bodyAttr = bodyText.toNSAttributedStringWithMarkdownAndLinks(
          baseFont: baseFont,
          linkColor: linkColor,
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
          .font: baseFont,
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
          .font: baseFont,
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
          .font: semiboldFont,
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
    for area in trackingAreas where area.owner === self {
      removeTrackingArea(area)
    }
    let area = NSTrackingArea(
      rect: bounds,
      options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(area)
  }

  override func mouseMoved(with event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    let charIndex = characterIndexForInsertion(at: point)

    guard let storage = textStorage, charIndex < storage.length else {
      clearHoveredLink()
      super.mouseMoved(with: event)
      return
    }

    var linkRange = NSRange()
    let linkValue = storage.attribute(.link, at: charIndex, effectiveRange: &linkRange)

    if linkValue != nil {
      if hoveredLinkRange != linkRange {
        clearHoveredLink()
        layoutManager?.addTemporaryAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, forCharacterRange: linkRange)
        hoveredLinkRange = linkRange
      }
    } else {
      clearHoveredLink()
    }

    super.mouseMoved(with: event)
  }

  override func mouseExited(with event: NSEvent) {
    clearHoveredLink()
    super.mouseExited(with: event)
  }

  private func clearHoveredLink() {
    if let range = hoveredLinkRange {
      layoutManager?.removeTemporaryAttribute(.underlineStyle, forCharacterRange: range)
      hoveredLinkRange = nil
    }
  }

  override var textContainerOrigin: NSPoint {
    guard let container = textContainer, let layoutManager = layoutManager else {
      return super.textContainerOrigin
    }

    layoutManager.ensureLayout(for: container)
    let usedRect = layoutManager.usedRect(for: container)
    let contentHeight = usedRect.height + textContainerInset.height * 2
    let viewHeight = enclosingScrollView?.contentView.bounds.height ?? bounds.height

    if contentHeight < viewHeight {
      let offset = viewHeight - contentHeight
      return NSPoint(x: textContainerInset.width, y: offset + textContainerInset.height)
    }

    return NSPoint(x: textContainerInset.width, y: textContainerInset.height)
  }
}

// MARK: - BottomPinningScrollView

/// NSScrollView subclass that pins to the bottom on resize when the user was already scrolled to bottom.
class BottomPinningScrollView: NSScrollView {
  weak var pinnedTextView: NSTextView?
  private var shouldPinToBottom = true
  private var isAdjusting = false

  private func isAtBottom() -> Bool {
    let clipHeight = contentView.bounds.height
    guard clipHeight > 0 else { return shouldPinToBottom }
    let docHeight = documentView?.frame.height ?? 0
    if docHeight <= clipHeight { return true }
    let scrollY = contentView.bounds.origin.y
    let inset = pinnedTextView?.textContainerInset.height ?? 0
    return scrollY + clipHeight >= docHeight - (inset * 2 + 20)
  }

  override func setFrameSize(_ newSize: NSSize) {
    shouldPinToBottom = isAtBottom()
    isAdjusting = true
    super.setFrameSize(newSize)
    isAdjusting = false
  }

  override func tile() {
    super.tile()
    let clipHeight = contentView.bounds.height
    let docHeight = documentView?.frame.height ?? 0
    if shouldPinToBottom && docHeight > clipHeight {
      isAdjusting = true
      contentView.setBoundsOrigin(NSPoint(x: 0, y: docHeight - clipHeight))
      isAdjusting = false
    }
  }

  override func reflectScrolledClipView(_ cView: NSClipView) {
    super.reflectScrolledClipView(cView)
    if !isAdjusting {
      shouldPinToBottom = isAtBottom()
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
      .font: dateFont,
      .foregroundColor: dateColor,
    ]
  }

  override func cellSize() -> NSSize {
    let textSize = (dateText as NSString).size(withAttributes: textAttributes)
    return NSSize(width: 10000, height: textSize.height + 4)
  }

  override func draw(withFrame cellFrame: NSRect, in controlView: NSView?) {
    let textSize = (dateText as NSString).size(withAttributes: textAttributes)
    let textX = (cellFrame.width - textSize.width) / 2
    let textY = (cellFrame.height - textSize.height) / 2

    // Draw text
    let textRect = NSRect(x: cellFrame.minX + textX, y: cellFrame.minY + textY, width: textSize.width, height: textSize.height)
    (dateText as NSString).draw(in: textRect, withAttributes: textAttributes)

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
