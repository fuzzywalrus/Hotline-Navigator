import SwiftUI

struct TransfersView: View {
  @Environment(\.appState) private var appState

  var body: some View {
    VStack(spacing: 0) {
      if appState.transfers.isEmpty {
        emptyState
      } else {
        transfersList
      }
    }
    .frame(minWidth: 500, minHeight: 200)
    .navigationTitle("Transfers")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button {
          appState.cancelAllTransfers()
        } label: {
          Label("Cancel All", systemImage: "xmark.circle")
        }
        .disabled(appState.transfers.isEmpty)
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
    List {
      ForEach(appState.transfers) { transfer in
        TransferRow(transfer: transfer)
      }
    }
    .listStyle(.inset(alternatesRowBackgrounds: true))
  }
}

// MARK: - Transfer Row

struct TransferRow: View {
  @Bindable var transfer: TransferInfo

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // File name and server
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(transfer.title)
            .font(.system(.body, design: .default, weight: .medium))

          if let serverName = transfer.serverName {
            Text(serverName)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }

        Spacer()

        // Cancel button
        Button {
          AppState.shared.cancelTransfer(id: transfer.id)
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .help("Cancel download")
      }

      // Progress bar and status
      VStack(alignment: .leading, spacing: 4) {
        if transfer.failed {
          Label("Failed", systemImage: "exclamationmark.triangle.fill")
            .font(.caption)
            .foregroundStyle(.red)
        } else if transfer.completed {
          Label("Complete", systemImage: "checkmark.circle.fill")
            .font(.caption)
            .foregroundStyle(.green)
        } else {
          // Progress bar
          ProgressView(value: transfer.progress, total: 1.0)
            .progressViewStyle(.linear)

          // Progress info
          HStack(spacing: 8) {
            // Progress percentage
            Text("\(Int(transfer.progress * 100))%")
              .font(.caption)
              .foregroundStyle(.secondary)
              .monospacedDigit()

            // File size
            Text(formatSize(transfer.size))
              .font(.caption)
              .foregroundStyle(.secondary)

            // Speed
            if let speed = transfer.speed {
              Text(formatSpeed(speed))
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
            }

            // Time remaining
            if let timeRemaining = transfer.timeRemaining {
              Text(formatTimeRemaining(timeRemaining))
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
            }
          }
        }
      }
    }
    .padding(.vertical, 4)
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
