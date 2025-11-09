import SwiftUI

struct TransfersView: View {
  @Environment(\.appState) private var appState
  
  @State private var selectedTransfers = Set<TransferInfo>()
  
  var body: some View {
    VStack(spacing: 0) {
      if self.appState.transfers.isEmpty {
        self.emptyState
      } else {
        self.transfersList
      }
    }
    .frame(minWidth: 500, minHeight: 200)
    .navigationTitle("Transfers")
    .toolbar {
//      ToolbarItem(placement: .primaryAction) {
//        Button {
//          self.appState.sweepTransfers()
//          self.selectedTransfers = []
//        } label: {
//          Label("Remove Completed", systemImage: "checklist")
//        }
//        .disabled(self.appState.transfers.isEmpty)
//      }
      
      ToolbarItem(placement: .primaryAction) {
        Button {
          for transfer in self.selectedTransfers {
            self.appState.cancelTransfer(id: transfer.id)
          }
          self.selectedTransfers = []
        } label: {
          Label("Cancel Transfer", systemImage: "xmark")
        }
        .disabled(self.selectedTransfers.isEmpty)
      }
    }
  }

  // MARK: - Empty State

  private var emptyState: some View {
    ContentUnavailableView {
      Label("No Transfers", systemImage: "arrow.up.arrow.down")
    } description: {
      Text("Your Hotline file transfers will appear here")
    }
  }

  // MARK: - Transfers List

  private var transfersList: some View {
    List(selection: self.$selectedTransfers) {
      ForEach(self.appState.transfers) { transfer in
        TransferRow(transfer: transfer)
          .id(transfer)
      }
    }
    .listStyle(.inset)
    .environment(\.defaultMinListRowHeight, 56)
    .contextMenu(forSelectionType: TransferInfo.self) { items in
      if let item = items.first {
        if item.completed,
           let fileURL = item.fileURL {
          Button("Remove Transfer") {
            self.appState.cancelTransfer(id: item.id)
          }
          
          Divider()
          
          Button("Show in Finder") {
            NSWorkspace.shared.activateFileViewerSelecting([fileURL])
          }

          Button("Open") {
            NSWorkspace.shared.open(fileURL)
          }

          Divider()

          Button("Move to Trash") {
            NSWorkspace.shared.recycle([fileURL])
          }
        }
        else if !item.done {
          Button("Cancel Transfer") {
            self.appState.cancelTransfer(id: item.id)
          }
        }
      }
    } primaryAction: { items in
      let fileURLs: [URL] = items.compactMap { $0.fileURL }
      if !fileURLs.isEmpty {
        NSWorkspace.shared.activateFileViewerSelecting(fileURLs)
      }
    }
  }
}

// MARK: - Transfer Row

struct TransferRow: View {
  @Environment(\.appState) private var appState
  
  @Bindable var transfer: TransferInfo
  
  private var statsView: some View {
    HStack(spacing: 8) {
      // Progress percentage
//      Text("\(Int(self.transfer.progress * 100))%")
      
      // Speed
      if let speed = self.transfer.speed {
        Text(self.formatSpeed(speed))
      }

      // Time remaining
      if let timeRemaining = self.transfer.timeRemaining {
        Text(self.formatTimeRemaining(timeRemaining))
      }
      
      // File size
      Text(self.formatSize(self.transfer.size))
    }
    .font(.subheadline)
    .foregroundStyle(.secondary)
    .monospacedDigit()
  }
  
  private var fileIconView: some View {
    FileIconView(filename: self.transfer.title, fileType: nil)
      .frame(width: 32, height: 32)
      .overlay(alignment: .bottomTrailing) {
        if self.transfer.cancelled || self.transfer.failed {
          Image(systemName: "exclamationmark.triangle.fill")
            .resizable()
            .symbolRenderingMode(.multicolor)
            .scaledToFit()
            .frame(width: 16, height: 16)
        }
        else if self.transfer.completed {
          Image(systemName: "checkmark.circle.fill")
            .resizable()
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, .fileComplete)
            .scaledToFit()
            .frame(width: 16, height: 16)
        }
      }
  }

  var body: some View {
    HStack(alignment: .center, spacing: 8) {
      self.fileIconView
      
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(self.transfer.title)
            .font(.headline)
            .lineLimit(1)
            .truncationMode(.tail)
          
          Spacer()
          
          if !self.transfer.done {
            self.statsView
          }
        }
        
        // Progress bar and status
        if self.transfer.cancelled {
          Text("Cancelled")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        else if self.transfer.failed {
          Text("Failed")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        else if self.transfer.completed {
          Text("Complete")
            .font(.subheadline)
            .foregroundStyle(.fileComplete)
        }
        else {
          ProgressView(value: self.transfer.progress, total: 1.0)
            .progressViewStyle(.linear)
            .controlSize(.large)
        }
      }
      
      if self.transfer.completed {
        Button {
          guard let fileURL = self.transfer.fileURL else {
            return
          }
          
          NSWorkspace.shared.activateFileViewerSelecting([fileURL])
        } label: {
          Image(systemName: "eye.circle.fill")
            .resizable()
            .scaledToFit()
            .frame(width: 24, height: 24)
            .foregroundStyle(.secondary)
        }
        .buttonBorderShape(.circle)
        .buttonStyle(.plain)
      }
    }
        
//        VStack(alignment: .leading, spacing: 2) {
          

//          if let serverName = self.transfer.serverName {
//            Text(serverName)
//              .font(.caption)
//              .foregroundStyle(.secondary)
//          }
//        }

//        // Cancel button
//        Button {
//          self.appState.cancelTransfer(id: transfer.id)
//        } label: {
//          Image(systemName: "xmark.circle.fill")
//            .foregroundStyle(.secondary)
//        }
//        .buttonStyle(.plain)
//        .help("Cancel download")
//      }
//    }
  }

  // MARK: - Formatting

  private func formatSize(_ bytes: UInt) -> String {
    let formatter = ByteCountFormatter()
    formatter.countStyle = .file
    formatter.allowedUnits = [.useKB, .useMB, .useGB]
    return formatter.string(fromByteCount: Int64(bytes))
  }

  private func formatSpeed(_ bytesPerSecond: Double) -> String {
    let formatter = ByteCountFormatter()
    formatter.countStyle = .file
    formatter.allowedUnits = [.useKB, .useMB, .useGB]
    return "\(formatter.string(fromByteCount: Int64(bytesPerSecond)))/s"
  }

  private func formatTimeRemaining(_ seconds: TimeInterval) -> String {
    if seconds < 60 {
      return "\(Int(seconds))s"
    } else if seconds < 3600 {
      let minutes = Int(seconds / 60)
      let secs = Int(seconds.truncatingRemainder(dividingBy: 60))
      return "\(minutes)m \(secs)s"
    } else {
      let hours = Int(seconds / 3600)
      let minutes = Int((seconds.truncatingRemainder(dividingBy: 3600)) / 60)
      return "\(hours)h \(minutes)m"
    }
  }
}

// MARK: - Preview

#Preview {
  TransfersView()
    .environment(AppState.shared)
}
