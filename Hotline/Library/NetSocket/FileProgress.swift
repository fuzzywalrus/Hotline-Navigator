// NetSocket FileProgress
// Dustin Mierau • @mierau
// MIT License

import Foundation

public extension NetSocket {
  
  /// Progress information for file uploads/downloads
  struct FileProgress: Sendable {
    /// Number of bytes sent/received so far
    public let sent: Int
    /// Total file size (may be nil if unknown)
    public let total: Int?
    /// Smoothed transfer rate in bytes per second (EMA), if enough samples collected
    public let bytesPerSecond: Double?
    /// Estimated time remaining (seconds) based on smoothed rate, if available
    public let estimatedTimeRemaining: TimeInterval?
    
    public init(sent: Int, total: Int?, bytesPerSecond: Double? = nil, estimatedTimeRemaining: TimeInterval? = nil) {
      self.sent = sent
      self.total = total
      self.bytesPerSecond = bytesPerSecond
      self.estimatedTimeRemaining = estimatedTimeRemaining
    }
    
    /// Format transfer speed in human-readable format
    ///
    /// Automatically selects appropriate unit (B/sec, KB/sec, MB/sec, GB/sec)
    /// based on the magnitude of the speed.
    ///
    /// - Returns: Formatted string like "45KB/sec", "5B/sec", "12.5MB/sec", or nil if speed unavailable
    ///
    /// Example:
    /// ```swift
    /// if let speedString = progress.formattedSpeed {
    ///   print(speedString)  // "2.5MB/sec"
    /// }
    /// ```
    public var formattedSpeed: String? {
      guard let bytesPerSecond = bytesPerSecond, bytesPerSecond > 0 else { return nil }
      
      let kb = 1024.0
      let mb = kb * 1024.0
      let gb = mb * 1024.0
      
      if bytesPerSecond >= gb {
        return String(format: "%.1fGB/sec", bytesPerSecond / gb)
      } else if bytesPerSecond >= mb {
        return String(format: "%.1fMB/sec", bytesPerSecond / mb)
      } else if bytesPerSecond >= kb {
        return String(format: "%.0fKB/sec", bytesPerSecond / kb)
      } else {
        return String(format: "%.0fB/sec", bytesPerSecond)
      }
    }
  }
}
