import SwiftUI

struct TrackerBookmarkServerView: View {
  let server: BookmarkServer

  var body: some View {
    HStack(alignment: .center, spacing: 6) {
      Image("Server")
        .resizable()
        .scaledToFit()
        .frame(width: 16, height: 16, alignment: .center)
      Text(self.server.name ?? "Server").lineLimit(1).truncationMode(.tail)
      if let serverDescription = self.server.description {
        Text(serverDescription)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      Spacer(minLength: 0)
      if self.server.users > 0 {
        Text(String(self.server.users))
          .foregroundStyle(.secondary)
          .lineLimit(1)

        Circle()
          .fill(.fileComplete)
          .frame(width: 7, height: 7)
          .keyframeAnimator(initialValue: 1.0, repeating: true) { content, opacity in
            content.opacity(opacity)
          } keyframes: { _ in
            CubicKeyframe(1.0, duration: 2.0)  // Stay visible for 1 second
            CubicKeyframe(0.6, duration: 0.5) // Fade out quickly
            CubicKeyframe(1.0, duration: 0.5) // Fade in quickly
          }
          .padding(.trailing, 6)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
