// NetSocket: TransferRateEstimator
// Dustin Mierau • @mierau
// MIT License

import Foundation

/// Transfer rate estimator using exponential moving average (EMA)
///
/// Tracks transfer speed and estimates time remaining. Designed to smooth out
/// network jitter and provide stable estimates after collecting enough samples.
///
/// Example:
/// ```swift
/// var estimator = TransferRateEstimator(total: fileSize)
///
/// while transferring {
///   let chunk = try await receiveData()
///   let progress = estimator.update(bytes: chunk.count)
///   print("Speed: \(progress.bytesPerSecond ?? 0) B/s, ETA: \(progress.estimatedTimeRemaining ?? 0)s")
/// }
/// ```
public struct TransferRateEstimator {
  /// Total bytes to transfer (nil if unknown)
  public let total: Int?
  
  /// Exponential moving average of transfer rate (bytes/second)
  private var emaBytesPerSecond: Double = 0
  
  /// Smoothing factor for EMA (0 < alpha ≤ 1)
  /// Higher = more responsive to recent changes, lower = more smoothing
  private let alpha: Double
  
  /// Number of samples collected
  private var sampleCount: Int = 0
  
  /// Timestamp of first sample (for elapsed time calculation)
  private var startTime: ContinuousClock.Instant?
  
  /// Timestamp of last update (for calculating sample duration)
  private var lastUpdateTime: ContinuousClock.Instant?
  
  /// Minimum elapsed time before trusting estimates (seconds)
  private let minElapsedTime: TimeInterval
  
  /// Minimum number of samples before trusting estimates
  private let minSamples: Int
  
  /// Current number of bytes transferred
  public private(set) var transferred: Int = 0
  
  /// Create a new transfer rate estimator
  ///
  /// - Parameters:
  ///   - total: Total bytes to transfer (nil if unknown)
  ///   - alpha: EMA smoothing factor (default: 0.2). Range: 0.0-1.0
  ///   - minElapsedTime: Minimum elapsed time before estimates are reliable (default: 2.0s)
  ///   - minSamples: Minimum samples before estimates are reliable (default: 4)
  public init(
    total: Int? = nil,
    alpha: Double = 0.2,
    minElapsedTime: TimeInterval = 2.0,
    minSamples: Int = 8
  ) {
    precondition(alpha > 0 && alpha <= 1, "alpha must be in range (0, 1]")
    precondition(minSamples >= 0, "minSamples must be >= 0")
    
    self.total = total
    self.alpha = alpha
    self.minElapsedTime = minElapsedTime
    self.minSamples = minSamples
  }
  
  public mutating func update(total: Int) -> NetSocket.FileProgress {
    return self.update(bytes: max(0, total - self.transferred))
  }
  
  /// Update the estimator with a new data sample
  ///
  /// Automatically calculates the duration since the last update.
  ///
  /// - Parameter bytes: Number of bytes transferred in this sample
  /// - Returns: Current progress with speed and ETA estimates
  public mutating func update(bytes: Int) -> NetSocket.FileProgress {
    let clock = ContinuousClock()
    let now = clock.now
    
    // Record start time on first sample
    if self.startTime == nil {
      self.startTime = now
    }
    
    // Calculate duration since last update
    let duration = self.lastUpdateTime.map { now - $0 } ?? .zero
    self.lastUpdateTime = now
    
    // Update transferred count
    self.transferred += bytes
    
    // Calculate instantaneous rate for this sample
    let seconds: Double = duration / .seconds(1.0)
    if seconds > 0 {
      let instantRate = Double(bytes) / seconds
      self.sampleCount += 1
      
      // Update EMANetSocket
      if self.emaBytesPerSecond == 0 {
        self.emaBytesPerSecond = instantRate
      } else {
        self.emaBytesPerSecond += self.alpha * (instantRate - self.emaBytesPerSecond)
      }
    }
    
    // Determine if we have enough data to trust the estimate
    let elapsed = self.startTime.map { now - $0 } ?? .zero
    let elapsedSeconds: Double = elapsed / .seconds(1.0)
    let haveEstimate = (elapsedSeconds >= self.minElapsedTime || self.sampleCount >= self.minSamples) && self.emaBytesPerSecond > 0
    
    // Calculate ETA if we have both an estimate and a known total
    let eta: TimeInterval?
    if haveEstimate, let total = self.total {
      let remaining = total - self.transferred
      eta = remaining > 0 ? TimeInterval(Double(remaining) / self.emaBytesPerSecond) : 0
    } else {
      eta = nil
    }
    
    return NetSocket.FileProgress(
      sent: self.transferred,
      total: self.total,
      bytesPerSecond: haveEstimate ? self.emaBytesPerSecond : nil,
      estimatedTimeRemaining: eta
    )
  }
}

