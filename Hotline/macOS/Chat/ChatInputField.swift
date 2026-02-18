import SwiftUI
import AppKit

/// A chat input field that supports:
/// - **Enter**: Send message
/// - **Option+Enter**: Send as announcement
/// - **Shift+Enter**: Insert newline
///
/// Auto-resizes vertically up to `maxLines` lines, then scrolls.
/// Fills its entire frame; text is inset internally so the scroll bar
/// sits at the right edge of the container.
struct ChatInputField: NSViewRepresentable {
  @Binding var text: String
  @Binding var height: CGFloat
  var maxLines: Int = 5
  var onSubmit: (_ announce: Bool) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  func makeNSView(context: Context) -> NSScrollView {
    let textView = ChatInputTextView()
    textView.isRichText = false
    textView.isAutomaticQuoteSubstitutionEnabled = false
    textView.isAutomaticDashSubstitutionEnabled = false
    textView.isAutomaticTextReplacementEnabled = false
    textView.allowsUndo = true
    textView.font = .systemFont(ofSize: NSFont.systemFontSize)
    textView.textColor = .textColor
    textView.drawsBackground = false

    // Use textContainerInset for the width calculation (average of left+right
    // so widthTracksTextView sizes the container correctly), and override
    // textContainerOrigin in the subclass for the asymmetric left inset.
    let avgHorizontal = (textView.leftInset + textView.rightInset) / 2.0
    textView.textContainerInset = NSSize(width: avgHorizontal, height: textView.verticalInset)
    textView.textContainer?.lineFragmentPadding = 0

    textView.isVerticallyResizable = true
    textView.isHorizontallyResizable = false
    textView.textContainer?.widthTracksTextView = true
    textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    textView.delegate = context.coordinator
    textView.submitHandler = { announce in
      context.coordinator.parent.onSubmit(announce)
    }

    let scrollView = NSScrollView()
    scrollView.documentView = textView
    scrollView.hasVerticalScroller = false
    scrollView.hasHorizontalScroller = false
    scrollView.drawsBackground = false
    scrollView.autohidesScrollers = true
    scrollView.verticalScrollElasticity = .none

    context.coordinator.textView = textView
    context.coordinator.scrollView = scrollView

    DispatchQueue.main.async {
      context.coordinator.recalculateHeight()
    }

    return scrollView
  }

  func updateNSView(_ scrollView: NSScrollView, context: Context) {
    guard let textView = context.coordinator.textView else { return }
    if textView.string != text {
      textView.string = text
      context.coordinator.recalculateHeight()
    }
  }

  class Coordinator: NSObject, NSTextViewDelegate {
    var parent: ChatInputField
    weak var textView: ChatInputTextView?
    weak var scrollView: NSScrollView?

    init(_ parent: ChatInputField) {
      self.parent = parent
    }

    func textDidChange(_ notification: Notification) {
      guard let textView = textView else { return }
      parent.text = textView.string
      recalculateHeight()
    }

    func recalculateHeight() {
      guard let textView = textView, let layoutManager = textView.layoutManager,
            let textContainer = textView.textContainer else { return }

      let font = textView.font ?? .systemFont(ofSize: NSFont.systemFontSize)
      let lineHeight = layoutManager.defaultLineHeight(for: font)
      let maxContentHeight = ceil(lineHeight * CGFloat(parent.maxLines))

      layoutManager.ensureLayout(for: textContainer)
      let usedRect = layoutManager.usedRect(for: textContainer)
      let contentHeight = max(ceil(usedRect.height), ceil(lineHeight))

      let needsScroller = contentHeight > maxContentHeight
      let clampedContent = needsScroller ? maxContentHeight : contentHeight
      let newHeight = clampedContent + textView.verticalInset * 2

      scrollView?.hasVerticalScroller = needsScroller
      scrollView?.verticalScrollElasticity = needsScroller ? .allowed : .none

      if abs(newHeight - parent.height) > 0.5 {
        parent.height = newHeight
      }
    }
  }
}

/// NSTextView subclass that intercepts Enter key variants and provides
/// asymmetric internal padding so the text area is inset from the edges.
/// Shows a chevron indicator next to the line containing the insertion point.
class ChatInputTextView: NSTextView {
  var submitHandler: ((_ announce: Bool) -> Void)?

  let leftInset: CGFloat = 30
  let rightInset: CGFloat = 12
  let verticalInset: CGFloat = 24

  private lazy var chevronView: NSImageView = {
    let config = NSImage.SymbolConfiguration(pointSize: NSFont.systemFontSize, weight: .semibold)
    let image = NSImage(systemSymbolName: "chevron.right", accessibilityDescription: nil)?
      .withSymbolConfiguration(config)
    let iv = NSImageView()
    iv.image = image
    iv.contentTintColor = .tertiaryLabelColor
    iv.imageScaling = .scaleNone
    iv.setContentHuggingPriority(.required, for: .horizontal)
    iv.setContentHuggingPriority(.required, for: .vertical)
    iv.frame.size = image?.size ?? NSSize(width: 10, height: 12)
    return iv
  }()

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if window != nil {
      DispatchQueue.main.async { [weak self] in
        self?.window?.makeFirstResponder(self)
      }
    }
  }

  override var textContainerOrigin: NSPoint {
    return NSPoint(x: leftInset, y: verticalInset)
  }

  override func viewDidMoveToSuperview() {
    super.viewDidMoveToSuperview()
    if chevronView.superview == nil {
      addSubview(chevronView)
      updateChevronPosition()
    }
  }

  override func resetCursorRects() {
    addCursorRect(bounds, cursor: .iBeam)
  }

  override func setSelectedRanges(_ ranges: [NSValue], affinity: NSSelectionAffinity, stillSelecting: Bool) {
    super.setSelectedRanges(ranges, affinity: affinity, stillSelecting: stillSelecting)
    updateChevronPosition()
  }

  override func didChangeText() {
    super.didChangeText()
    updateChevronPosition()
  }

  func updateChevronPosition() {
    guard let layoutManager = layoutManager else { return }

    let font = self.font ?? .systemFont(ofSize: NSFont.systemFontSize)
    let length = textStorage?.length ?? 0

    let lineRect: NSRect
    if length == 0 {
      let lineHeight = layoutManager.defaultLineHeight(for: font)
      lineRect = NSRect(x: 0, y: 0, width: 0, height: lineHeight)
    } else {
      let insertionIndex = selectedRange().location
      let charIndex = min(insertionIndex, length - 1)
      let glyphIndex = layoutManager.glyphIndexForCharacter(at: charIndex)
      lineRect = layoutManager.lineFragmentRect(forGlyphAt: glyphIndex, effectiveRange: nil)
    }

    let chevronSize = chevronView.frame.size
    let x = (leftInset - chevronSize.width - 4)
    let y = textContainerOrigin.y + lineRect.origin.y + (lineRect.height - chevronSize.height) / 2.0
    chevronView.frame.origin = NSPoint(x: x, y: y)
  }

  override func keyDown(with event: NSEvent) {
    let isReturn = event.keyCode == 36 // Return key
    let isShift = event.modifierFlags.contains(.shift)
    let isOption = event.modifierFlags.contains(.option)

    if isReturn && isShift {
      // Shift+Enter: insert newline
      insertNewline(nil)
      return
    }

    if isReturn && isOption {
      // Option+Enter: send as announcement
      submitHandler?(true)
      return
    }

    if isReturn && !isShift && !isOption {
      // Enter: send normally
      submitHandler?(false)
      return
    }

    super.keyDown(with: event)
  }
}
