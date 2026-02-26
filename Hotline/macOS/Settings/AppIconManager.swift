import AppKit

enum AppIconManager {
  private struct ShadowStyle {
    var radius: CGFloat
    var yOffset: CGFloat
    var opacity: CGFloat
  }

  private static var shadowStyle: ShadowStyle {
    if #available(macOS 26, *) {
      return ShadowStyle(radius: 20, yOffset: 8, opacity: 0.25)
    } else {
      return ShadowStyle(radius: 28, yOffset: 12, opacity: 0.5)
    }
  }

  static func apply() {
    let iconName = Prefs.shared.appIcon
    if iconName.isEmpty {
      NSApplication.shared.applicationIconImage = nil
    } else if let image = NSImage(named: iconName) {
      NSApplication.shared.applicationIconImage = self.iconWithShadow(from: image)
    }
  }

  private static func iconWithShadow(from image: NSImage) -> NSImage {
    let style = self.shadowStyle
    let canvasSize = image.size

    let result = NSImage(size: canvasSize)
    result.lockFocus()

    let context = NSGraphicsContext.current!.cgContext

    context.setShadow(
      offset: CGSize(width: 0, height: -style.yOffset),
      blur: style.radius,
      color: CGColor(gray: 0, alpha: style.opacity)
    )

    image.draw(in: NSRect(origin: .zero, size: canvasSize), from: .zero, operation: .sourceOver, fraction: 1.0)

    result.unlockFocus()
    return result
  }
}
