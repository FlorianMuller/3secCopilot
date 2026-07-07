import AVFoundation
import CoreImage
import Photos
import UIKit

enum MontageError: Error, LocalizedError {
  case assetNotFound(String)
  case avAssetUnavailable(String)
  case unsupportedMediaType(String)
  case noVideoTrack(String)
  case readerFailed(String)
  case writerFailed(String)
  case exportInProgress
  case unknownTask(String)
  case invalidClip(String)
  case invalidOutputPath(String)
  case cancelled

  var errorDescription: String? {
    switch self {
    case .assetNotFound(let id): return "PHAsset not found in Photos library: \(id)"
    case .avAssetUnavailable(let id): return "Could not load AVAsset for: \(id)"
    case .unsupportedMediaType(let id): return "Asset is neither a video nor a Live Photo: \(id)"
    case .noVideoTrack(let id): return "Asset has no video track: \(id)"
    case .readerFailed(let message): return "Reader failed: \(message)"
    case .writerFailed(let message): return "Writer failed: \(message)"
    case .exportInProgress: return "An export is already running — only one export at a time is supported"
    case .unknownTask(let id): return "No running export with taskId: \(id)"
    case .invalidClip(let message): return "Invalid clip: \(message)"
    case .invalidOutputPath(let path): return "Invalid outputPath (expected a file:// URL): \(path)"
    case .cancelled: return "cancelled"
    }
  }

  /// The asset id involved in a per-asset failure, for onExportError.failedAssetId
  var failedAssetId: String? {
    switch self {
    case .assetNotFound(let id), .avAssetUnavailable(let id),
         .unsupportedMediaType(let id), .noVideoTrack(let id):
      return id
    default:
      return nil
    }
  }
}

/// Uniform encoder settings shared by the spike, every chunk encode, and the
/// final assemble pass (identical writer settings are what make video passthrough
/// concat of chunk files possible, §5.2).
struct WriterConfig {
  let width: Int
  let height: Int
  let fps: Int
  let videoBitrate: Int
  let audioBitrate: Int

  var renderSize: CGSize { CGSize(width: width, height: height) }
  var frameDuration: CMTime { CMTime(value: 1, timescale: CMTimeScale(fps)) }

  var videoOutputSettings: [String: Any] {
    [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: videoBitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoMaxKeyFrameIntervalKey: fps * 2,
        // No B-frames: chunk files are concatenated by the passthrough assemble
        // pass (§5.2), and per-chunk reorder delays (1–2 frames, varying with
        // content) make a dense concat impossible — the next chunk's first DTS
        // lands on/before the previous chunk's last DTS. Delay-free streams keep
        // pts == dts, so chunks butt together exactly. Compression cost at these
        // bitrates is negligible.
        AVVideoAllowFrameReorderingKey: false,
      ],
    ]
  }

  var audioOutputSettings: [String: Any] {
    [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVNumberOfChannelsKey: 2,
      AVSampleRateKey: 44_100,
      AVEncoderBitRateKey: audioBitrate,
    ]
  }
}

// MARK: - Memory instrumentation

/// Peak phys_footprint observed across an export, in MB (§11.5). Sampled from the
/// pump queues; the unsynchronized max update is benign (monotonic, advisory).
final class MemoryTracker: @unchecked Sendable {
  private(set) var peakMemoryMB: Double = 0

  func sample() {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return }
    let footprintMB = Double(info.phys_footprint) / 1_048_576
    if footprintMB > peakMemoryMB {
      peakMemoryMB = footprintMB
    }
  }
}

// MARK: - Asset resolution

struct ResolvedAsset {
  let asset: AVAsset
  /// Non-fatal note about how the asset was resolved (e.g. Live Photo paired video)
  let note: String?
  /// Temp file backing the asset (Live Photo paired video) — delete when done with it
  let tempFileURL: URL?
}

/// Resolves PHAsset local identifiers to AVAssets, including the Live Photo
/// paired-video fallback. iCloud downloads are allowed and reported through
/// `downloadProgress` (0–1 per asset).
final class AssetResolver {
  func resolve(assetId: String, downloadProgress: ((Double) -> Void)? = nil) async throws -> ResolvedAsset {
    let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let phAsset = fetchResult.firstObject else {
      throw MontageError.assetNotFound(assetId)
    }

    if phAsset.mediaType == .video {
      let asset = try await requestAVAsset(for: phAsset, assetId: assetId, downloadProgress: downloadProgress)
      return ResolvedAsset(asset: asset, note: nil, tempFileURL: nil)
    }

    if phAsset.mediaType == .image, phAsset.mediaSubtypes.contains(.photoLive) {
      let (asset, tempURL) = try await pairedVideoAsset(for: phAsset, assetId: assetId, downloadProgress: downloadProgress)
      return ResolvedAsset(
        asset: asset,
        note: "Clip \(assetId) is a Live Photo — used its paired video",
        tempFileURL: tempURL
      )
    }

    throw MontageError.unsupportedMediaType(assetId)
  }

  private func requestAVAsset(
    for phAsset: PHAsset,
    assetId: String,
    downloadProgress: ((Double) -> Void)?
  ) async throws -> AVAsset {
    let requestOptions = PHVideoRequestOptions()
    requestOptions.isNetworkAccessAllowed = true
    requestOptions.deliveryMode = .highQualityFormat
    requestOptions.version = .current
    if let downloadProgress {
      requestOptions.progressHandler = { progress, _, _, _ in
        downloadProgress(progress)
      }
    }

    return try await withCheckedThrowingContinuation { continuation in
      PHImageManager.default().requestAVAsset(forVideo: phAsset, options: requestOptions) { avAsset, _, _ in
        if let avAsset {
          continuation.resume(returning: avAsset)
        } else {
          continuation.resume(throwing: MontageError.avAssetUnavailable(assetId))
        }
      }
    }
  }

  /// Live Photos are image assets; their video half is only reachable as a paired
  /// PHAssetResource, written to a temp file.
  private func pairedVideoAsset(
    for phAsset: PHAsset,
    assetId: String,
    downloadProgress: ((Double) -> Void)?
  ) async throws -> (AVAsset, URL) {
    let resources = PHAssetResource.assetResources(for: phAsset)
    guard
      let paired = resources.first(where: { $0.type == .fullSizePairedVideo })
        ?? resources.first(where: { $0.type == .pairedVideo })
    else {
      throw MontageError.avAssetUnavailable(assetId)
    }

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("live-photo-\(UUID().uuidString).mov")
    let requestOptions = PHAssetResourceRequestOptions()
    requestOptions.isNetworkAccessAllowed = true
    if let downloadProgress {
      requestOptions.progressHandler = { progress in
        downloadProgress(progress)
      }
    }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      PHAssetResourceManager.default().writeData(for: paired, toFile: url, options: requestOptions) { error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: ())
        }
      }
    }
    return (AVURLAsset(url: url), url)
  }
}

// MARK: - Shared composition helpers

enum MontageCompositionHelpers {
  /// Defensive trim clamping (§8.4): clamp to the asset's real duration; an empty or
  /// inverted range falls back to the full clip. A bad trim must never abort an export.
  static func clampedTimeRange(startMs: Double?, endMs: Double?, assetDuration: CMTime) -> CMTimeRange {
    let durationSeconds = assetDuration.seconds
    var start = max(0, (startMs ?? 0) / 1000)
    var end = min(durationSeconds, (endMs ?? durationSeconds * 1000) / 1000)
    if end <= start {
      // Invalid trim (asset shorter than expected, inverted range): fall back to the full clip
      start = 0
      end = durationSeconds
    }
    return CMTimeRange(
      start: CMTime(seconds: start, preferredTimescale: 600),
      end: CMTime(seconds: end, preferredTimescale: 600)
    )
  }

  /// Normalize orientation via preferredTransform, then aspect-fit (scaled, centered, never cropped).
  static func aspectFitTransform(for track: AVAssetTrack, renderSize: CGSize) async throws -> CGAffineTransform {
    let naturalSize = try await track.load(.naturalSize)
    let preferredTransform = try await track.load(.preferredTransform)

    let displayRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    let displaySize = CGSize(width: abs(displayRect.width), height: abs(displayRect.height))

    var transform = preferredTransform.concatenating(
      CGAffineTransform(translationX: -displayRect.minX, y: -displayRect.minY)
    )
    let scale = min(renderSize.width / displaySize.width, renderSize.height / displaySize.height)
    transform = transform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    transform = transform.concatenating(
      CGAffineTransform(
        translationX: (renderSize.width - displaySize.width * scale) / 2,
        y: (renderSize.height - displaySize.height * scale) / 2
      )
    )
    return transform
  }

  /// Bottom-left overlay text with a subtle scrim (spike/§5.3). Phase 4 grows this
  /// into the full multi-line date/hour/title renderer.
  static func overlayImage(text: String, renderSize: CGSize) -> CIImage? {
    let fontSize = renderSize.height * 0.035
    let attributed = NSAttributedString(
      string: text,
      attributes: [
        .font: UIFont.systemFont(ofSize: fontSize, weight: .semibold),
        .foregroundColor: UIColor.white,
      ]
    )
    guard let filter = CIFilter(name: "CIAttributedTextImageGenerator") else { return nil }
    filter.setValue(attributed, forKey: "inputText")
    filter.setValue(1.0, forKey: "inputScaleFactor")
    guard let textImage = filter.outputImage else { return nil }

    // Subtle scrim behind the text for readability over any footage
    let padding: CGFloat = fontSize * 0.4
    let scrimRect = textImage.extent.insetBy(dx: -padding, dy: -padding)
    let scrim = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0.35)).cropped(to: scrimRect)

    let margin = renderSize.height * 0.05
    return textImage
      .composited(over: scrim)
      .transformed(by: CGAffineTransform(translationX: margin - scrimRect.minX, y: margin - scrimRect.minY))
  }

  static func describe(_ error: Error?) -> String {
    guard let error = error as NSError? else { return "no error info" }
    return "\(error.localizedDescription) [\(error.domain) \(error.code)]"
  }
}
