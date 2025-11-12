import SwiftUI

struct NewFolderSheet: View {
  @Environment(\.dismiss) private var dismiss
  
  let action: ((String) -> Void)?
  
  @State private var folderName: String = "Untitled"
  
  var body: some View {
    Form {
      TextField(text: self.$folderName) {
        Text("Folder Name")
      }
    }
    .formStyle(.grouped)
    .fixedSize(horizontal: false, vertical: true)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("New Folder") {
          self.dismiss()
          self.action?(self.folderName)
        }
      }
      ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") {
          self.dismiss()
        }
      }
    }
  }
}
