import SwiftUI

struct GroupedIconView: View {
  let color: Color
  let systemName: String
  var padding: CGFloat = 6.0
  var cornerRadius: CGFloat = 8.0
  
  var body: some View {
    RoundedRectangle(cornerRadius: self.cornerRadius, style: .continuous)
      .fill(LinearGradient(colors: [self.color.mix(with: .white, by: 0.2), self.color], startPoint: .top, endPoint: .bottom))
      .shadow(color: self.color.mix(with: .black, by: 0.5).opacity(0.2), radius: 1, x: 0, y: 1)
      .overlay {
        Image(systemName: self.systemName)
          .resizable()
          .scaledToFit()
          .symbolRenderingMode(.palette)
          .foregroundStyle(.white, .white.opacity(0.4))
          .padding(self.padding)
          .shadow(color: self.color.mix(with: .black, by: 0.5).opacity(0.2), radius: 0, x: 0, y: -1)
      }
  }
}
