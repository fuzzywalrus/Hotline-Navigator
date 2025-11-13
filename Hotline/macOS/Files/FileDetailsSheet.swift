import Foundation
import SwiftUI

struct FileDetailsSheet: View {
  @Environment(HotlineState.self) private var model: HotlineState
  @Environment(\.presentationMode) var presentationMode

  var fd: FileDetails
  
  @State private var comment: String = ""
  @State private var filename: String = ""
  
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center, spacing: 16){
        if self.fd.type == "Folder" {
          FolderIconView()
            .frame(width: 32, height: 32)
        }
        else {
          FileIconView(filename: fd.name, fileType: nil)
            .frame(width: 32, height: 32)
        }
        TextField("", text: $filename)
          .disabled(!self.canRename())
      }
      
      let rows: [(String, String)] = [
        ("Type", fd.type),
        ("Creator", fd.creator),
        ("Size", self.formattedSize(byteCount: fd.size)),
        ("Created", Self.dateFormatter.string(from: fd.created)),
        ("Modified", Self.dateFormatter.string(from: fd.modified))
      ]
      
      Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
        ForEach(rows, id: \.0) { label, value in
          GridRow {
            Text(label)
              .font(.body.bold())
              .gridColumnAlignment(.trailing) // right-align label column
            Text(value)
              .font(.body)
              .gridColumnAlignment(.leading)  // left-align value column
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.leading, 32 + 16)
      
      TextField(text: self.$comment, prompt: Text("Comments"), axis: .vertical) {
        EmptyView()
      }
      .font(.body)
      .lineLimit(10, reservesSpace: true)
      .padding(.leading, 32 + 16)
      .disabled(!self.canSetComment())
    }
    .padding(.vertical, 24)
    .padding(.horizontal, 24)
    .frame(width: 400)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") {
          presentationMode.wrappedValue.dismiss()
        }
      }
      
      ToolbarItem(placement: .primaryAction) {
        Button{
          var editedFilename: String?
          if filename != fd.name {
            editedFilename = filename
          }
          
          var editedComment: String?
          if comment != fd.comment {
            editedComment = comment
          }
          
          model.setFileInfo(fileName: fd.name, path: fd.path, fileNewName: editedFilename, comment: editedComment)
          presentationMode.wrappedValue.dismiss()
          
          // TODO: Update the file list if the filename was changed
        } label: {
          Text("Save")
        }.disabled(!isEdited())
      }
    }
    .onAppear {
      self.filename = fd.name
      self.comment = fd.comment
    }
  }
  
  
  static var dateFormatter: DateFormatter = {
    var dateFormatter = DateFormatter()
    dateFormatter.dateStyle = .long
    dateFormatter.timeStyle = .short
    
    // Original format: Fri, Aug 20, 2021, 5:14:07 PM
    return dateFormatter
  }()
  
  static var byteCountSizeFormatter: NumberFormatter = {
    let numberFormatter = NumberFormatter()
    numberFormatter.numberStyle = .decimal
    return numberFormatter
  }()
  
  static let byteFormatter = ByteCountFormatter()
  
  private func formattedFileSize(_ fileSize: UInt) -> String {
    FileItemView.byteFormatter.allowedUnits = [.useAll]
    FileItemView.byteFormatter.countStyle = .file
    return FileItemView.byteFormatter.string(fromByteCount: Int64(fileSize))
  }
  
  // Format byte count Int into string like: 23.4M (24,601,664 bytes)
  private func formattedSize(byteCount: Int) -> String {
    let formattedByteCount = Self.byteCountSizeFormatter.string(from: NSNumber(value:byteCount)) ?? "0"
    return "\(FileItemView.byteFormatter.string(fromByteCount: Int64(byteCount))) (\(formattedByteCount) bytes)"
  }
  
  private func isEdited() -> Bool {
    return self.filename != fd.name || self.comment != fd.comment
  }
  
  private func canRename() -> Bool {
    if self.fd.type == "fldr" {
      return model.access?.contains(.canRenameFolders) == true
    }
    return model.access?.contains(.canRenameFiles) == true
  }
  
  private func canSetComment() -> Bool {
    if self.fd.type == "fldr" {
      return model.access?.contains(.canSetFolderComment) == true
    }
    return model.access?.contains(.canSetFileComment) == true
  }
}

//#Preview {
//  FileDetailsView(fd: FileDetails(name: "AppleWorks 6.sit", path: [""], size: 24601664, comment: "test comment", type: "SITD", creator: "SIT!", created: Date.now, modified: Date.now ))
//}
