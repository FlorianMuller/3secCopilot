import AVFoundation
import CoreImage
import ExpoModulesCore
import Photos
import UIKit

struct SpikeClip: Record {
  @Field var assetId: String = ""
  @Field var startMs: Double? = nil
  @Field var endMs: Double? = nil
  @Field var overlayText: String? = nil
}

struct SpikeOptions: Record {
  @Field var width: Double = 1920
  @Field var height: Double = 1080
  @Field var fps: Double = 30
  @Field var videoBitrate: Double = 16_000_000
}

enum MontageError: Error, LocalizedError {
  case assetNotFound(String)
  case avAssetUnavailable(String)
  case unsupportedMediaType(String)
  case noVideoTrack(String)
  case readerFailed(String)
  case writerFailed(String)

  var errorDescription: String? {
    switch self {
    case .assetNotFound(let id): return "PHAsset not found in Photos library: \(id)"
    case .avAssetUnavailable(let id): return "Could not load AVAsset for: \(id)"
    case .unsupportedMediaType(let id): return "Asset is neither a video nor a Live Photo: \(id)"
    case .noVideoTrack(let id): return "Asset has no video track: \(id)"
    case .readerFailed(let message): return "Reader failed: \(message)"
    case .writerFailed(let message): return "Writer failed: \(message)"
    }
  }
}

public class ExpoMontageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoMontage")

    AsyncFunction("spikeConcat") { (clips: [SpikeClip], options: SpikeOptions) async throws -> [String: Any] in
      let composer = SpikeComposer()
      return try await composer.run(clips: clips, options: options)
    }
  }
}

/// Overlay data for one segment of the output timeline.
private struct Segment {
  let timeRange: CMTimeRange
  let overlay: CIImage?
}

private struct ResolvedAsset {
  let asset: AVAsset
  /// Non-fatal note about how the asset was resolved (e.g. Live Photo paired video)
  let note: String?
}

private final class SpikeComposer {
  func run(clips: [SpikeClip], options: SpikeOptions) async throws -> [String: Any] {
    let renderSize = CGSize(width: options.width, height: options.height)
    var warnings: [String] = []

    let startedAt = Date()
    let (composition, videoComposition, segments) = try await buildComposition(
      clips: clips,
      renderSize: renderSize,
      fps: options.fps,
      warnings: &warnings
    )

    // Transient AVFoundation failures (media services reset, -11819) are worth one
    // automatic retry with a fresh reader/writer graph and a fresh output file.
    var outputURL: URL!
    var lastError: Error?
    var peakMemoryMB: Double = 0
    for attempt in 0..<2 {
      if attempt > 0 {
        try? await Task.sleep(nanoseconds: 700_000_000)
      }
      outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("montage-spike-\(Int(Date().timeIntervalSince1970))-\(attempt).mp4")
      do {
        let session = try EncodeSession(
          composition: composition,
          videoComposition: videoComposition,
          segments: segments,
          options: options,
          outputURL: outputURL
        )
        try await session.encode()
        peakMemoryMB = session.peakMemoryMB
        if attempt > 0 {
          warnings.append("Encode succeeded on automatic retry (first attempt: \(lastError.map(String.init(describing:)) ?? "?"))")
        }
        lastError = nil
        break
      } catch {
        lastError = error
      }
    }
    if let lastError {
      throw lastError
    }

    let encodeMs = Date().timeIntervalSince(startedAt) * 1000
    let attributes = try? FileManager.default.attributesOfItem(atPath: outputURL.path)
    let fileSize = (attributes?[.size] as? Int64) ?? 0
    let durationMs = composition.duration.seconds * 1000

    return [
      "outputPath": outputURL.absoluteString,
      "durationMs": durationMs,
      "fileSizeBytes": fileSize,
      "encodeMs": encodeMs,
      "peakMemoryMB": peakMemoryMB,
      "warnings": warnings,
    ]
  }

  // MARK: - Asset resolution

  private func resolveAsset(assetId: String) async throws -> ResolvedAsset {
    let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let phAsset = fetchResult.firstObject else {
      throw MontageError.assetNotFound(assetId)
    }

    if phAsset.mediaType == .video {
      let asset = try await requestAVAsset(for: phAsset, assetId: assetId)
      return ResolvedAsset(asset: asset, note: nil)
    }

    if phAsset.mediaType == .image, phAsset.mediaSubtypes.contains(.photoLive) {
      let asset = try await pairedVideoAsset(for: phAsset, assetId: assetId)
      return ResolvedAsset(asset: asset, note: "Clip \(assetId) is a Live Photo — used its paired video")
    }

    throw MontageError.unsupportedMediaType(assetId)
  }

  private func requestAVAsset(for phAsset: PHAsset, assetId: String) async throws -> AVAsset {
    let requestOptions = PHVideoRequestOptions()
    requestOptions.isNetworkAccessAllowed = true
    requestOptions.deliveryMode = .highQualityFormat
    requestOptions.version = .current

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
  private func pairedVideoAsset(for phAsset: PHAsset, assetId: String) async throws -> AVAsset {
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

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      PHAssetResourceManager.default().writeData(for: paired, toFile: url, options: requestOptions) { error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: ())
        }
      }
    }
    return AVURLAsset(url: url)
  }

  // MARK: - Composition

  private func buildComposition(
    clips: [SpikeClip],
    renderSize: CGSize,
    fps: Double,
    warnings: inout [String]
  ) async throws -> (AVMutableComposition, AVMutableVideoComposition, [Segment]) {
    let composition = AVMutableComposition()
    guard
      let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      throw MontageError.writerFailed("Could not create composition tracks")
    }

    var cursor = CMTime.zero
    var instructions: [AVMutableVideoCompositionInstruction] = []
    var segments: [Segment] = []

    for clip in clips {
      let resolved = try await resolveAsset(assetId: clip.assetId)
      if let note = resolved.note {
        warnings.append(note)
      }
      let asset = resolved.asset
      let assetDuration = try await asset.load(.duration)

      guard let sourceVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
        throw MontageError.noVideoTrack(clip.assetId)
      }
      let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first
      if sourceAudioTrack == nil {
        warnings.append("Clip \(clip.assetId) has no audio track — inserted silence")
      }

      let timeRange = clampedTimeRange(startMs: clip.startMs, endMs: clip.endMs, assetDuration: assetDuration)
      try compVideoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: cursor)
      if let sourceAudioTrack {
        try compAudioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: cursor)
      } else {
        compAudioTrack.insertEmptyTimeRange(CMTimeRange(start: cursor, duration: timeRange.duration))
      }

      let outputRange = CMTimeRange(start: cursor, duration: timeRange.duration)
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = outputRange
      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
      let transform = try await aspectFitTransform(for: sourceVideoTrack, renderSize: renderSize)
      layerInstruction.setTransform(transform, at: outputRange.start)
      instruction.layerInstructions = [layerInstruction]
      instructions.append(instruction)

      let overlay = clip.overlayText.flatMap { overlayImage(text: $0, renderSize: renderSize) }
      segments.append(Segment(timeRange: outputRange, overlay: overlay))

      cursor = cursor + timeRange.duration
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
    videoComposition.instructions = instructions
    // Force SDR BT.709 output: HDR sources (HLG/Dolby Vision, BT.2020) are tone-mapped
    // by the compositor instead of being read as-is (which looks washed out).
    videoComposition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    videoComposition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    videoComposition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    // NOTE: no animationTool — AVAssetReader rejects video compositions that have one.
    // Overlays are composited with CoreImage in the encode loop instead.

    return (composition, videoComposition, segments)
  }

  private func clampedTimeRange(startMs: Double?, endMs: Double?, assetDuration: CMTime) -> CMTimeRange {
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
  private func aspectFitTransform(for track: AVAssetTrack, renderSize: CGSize) async throws -> CGAffineTransform {
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

  // MARK: - Overlay

  private func overlayImage(text: String, renderSize: CGSize) -> CIImage? {
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
}

// MARK: - Encode (AVAssetReader -> CoreImage overlay -> AVAssetWriter)

/// Holds the reader/writer graph for one encode. @unchecked Sendable: the AVFoundation
/// objects are only touched from their requestMediaDataWhenReady serial queues.
private final class EncodeSession: @unchecked Sendable {
  private let reader: AVAssetReader
  private let writer: AVAssetWriter
  private let videoOutput: AVAssetReaderVideoCompositionOutput
  private let audioOutput: AVAssetReaderAudioMixOutput?
  private let videoInput: AVAssetWriterInput
  private let audioInput: AVAssetWriterInput?
  private let pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor
  private let segments: [Segment]
  private let renderBounds: CGRect
  private let renderColorSpace: CGColorSpace
  private let ciContext = CIContext(options: [.cacheIntermediates: false])

  init(
    composition: AVComposition,
    videoComposition: AVVideoComposition,
    segments: [Segment],
    options: SpikeOptions,
    outputURL: URL
  ) throws {
    self.segments = segments
    let width = Int(options.width)
    let height = Int(options.height)
    self.renderBounds = CGRect(x: 0, y: 0, width: width, height: height)
    self.renderColorSpace = CGColorSpace(name: CGColorSpace.itur_709) ?? CGColorSpaceCreateDeviceRGB()

    reader = try AVAssetReader(asset: composition)

    let videoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: composition.tracks(withMediaType: .video),
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    videoOutput.videoComposition = videoComposition
    videoOutput.alwaysCopiesSampleData = false
    reader.add(videoOutput)
    self.videoOutput = videoOutput

    let audioTracks = composition.tracks(withMediaType: .audio)
    if !audioTracks.isEmpty {
      let output = AVAssetReaderAudioMixOutput(audioTracks: audioTracks, audioSettings: nil)
      output.alwaysCopiesSampleData = false
      reader.add(output)
      self.audioOutput = output
    } else {
      self.audioOutput = nil
    }

    writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

    let colorProperties: [String: Any] = [
      AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
      AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
      AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ]
    let videoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoColorPropertiesKey: colorProperties,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: Int(options.videoBitrate),
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoExpectedSourceFrameRateKey: Int(options.fps),
          AVVideoMaxKeyFrameIntervalKey: Int(options.fps) * 2,
        ],
      ]
    )
    videoInput.expectsMediaDataInRealTime = false
    pixelBufferAdaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
      ]
    )
    writer.add(videoInput)
    self.videoInput = videoInput

    if audioOutput != nil {
      let input = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVNumberOfChannelsKey: 2,
          AVSampleRateKey: 44_100,
          AVEncoderBitRateKey: 256_000,
        ]
      )
      input.expectsMediaDataInRealTime = false
      writer.add(input)
      self.audioInput = input
    } else {
      self.audioInput = nil
    }
  }

  private static func describe(_ error: Error?) -> String {
    guard let error = error as NSError? else { return "no error info" }
    return "\(error.localizedDescription) [\(error.domain) \(error.code)]"
  }

  func encode() async throws {
    guard writer.startWriting() else {
      throw MontageError.writerFailed("startWriting: \(Self.describe(writer.error))")
    }
    guard reader.startReading() else {
      writer.cancelWriting()
      throw MontageError.readerFailed("startReading: \(Self.describe(reader.error))")
    }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    group.enter()
    pumpVideo(group: group)
    if audioInput != nil {
      group.enter()
      pumpAudio(group: group)
    }

    await withCheckedContinuation { continuation in
      group.notify(queue: .global()) { continuation.resume() }
    }

    if reader.status == .failed {
      writer.cancelWriting()
      throw MontageError.readerFailed("during read: \(Self.describe(reader.error))")
    }

    await writer.finishWriting()
    if writer.status != .completed {
      throw MontageError.writerFailed("finishWriting: \(Self.describe(writer.error)) (status \(writer.status.rawValue))")
    }
  }

  private func overlay(at time: CMTime) -> CIImage? {
    segments.first { $0.timeRange.containsTime(time) }?.overlay
  }

  private func pumpVideo(group: DispatchGroup) {
    let queue = DispatchQueue(label: "expo.montage.video")
    var frameCount = 0
    videoInput.requestMediaDataWhenReady(on: queue) { [self] in
      while videoInput.isReadyForMoreMediaData {
        // Each 1080p BGRA frame is ~8 MB of transient buffers; without draining the
        // autorelease pool per frame they accumulate for the whole callback and the
        // app gets jetsammed on year-scale (or even 60fps spike-scale) encodes.
        let finished = autoreleasepool { () -> Bool in
          guard reader.status == .reading, let sample = videoOutput.copyNextSampleBuffer() else {
            videoInput.markAsFinished()
            group.leave()
            return true
          }
          frameCount += 1
          if frameCount % 60 == 0 {
            recordMemoryPeak()
          }
          guard let sourceBuffer = CMSampleBufferGetImageBuffer(sample) else { return false }
          let presentationTime = CMSampleBufferGetPresentationTimeStamp(sample)

          if let overlay = overlay(at: presentationTime),
             let outputBuffer = makePoolBuffer() {
            let composited = overlay.composited(over: CIImage(cvPixelBuffer: sourceBuffer))
            ciContext.render(composited, to: outputBuffer, bounds: renderBounds, colorSpace: renderColorSpace)
            pixelBufferAdaptor.append(outputBuffer, withPresentationTime: presentationTime)
          } else {
            // No overlay for this frame — or the pixel pool is exhausted, in which
            // case passing the frame through un-overlaid beats dropping it.
            videoInput.append(sample)
          }
          return false
        }
        if finished {
          return
        }
      }
    }
  }

  private func makePoolBuffer() -> CVPixelBuffer? {
    guard let pool = pixelBufferAdaptor.pixelBufferPool else { return nil }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    return buffer
  }

  private func pumpAudio(group: DispatchGroup) {
    guard let audioInput, let audioOutput else { return }
    let queue = DispatchQueue(label: "expo.montage.audio")
    audioInput.requestMediaDataWhenReady(on: queue) { [self] in
      while audioInput.isReadyForMoreMediaData {
        let finished = autoreleasepool { () -> Bool in
          guard reader.status == .reading, let sample = audioOutput.copyNextSampleBuffer() else {
            audioInput.markAsFinished()
            group.leave()
            return true
          }
          audioInput.append(sample)
          return false
        }
        if finished {
          return
        }
      }
    }
  }

  // MARK: - Memory instrumentation

  /// Peak phys_footprint observed during the encode, in MB. Only mutated from the
  /// video pump queue; read after both pumps finish.
  private(set) var peakMemoryMB: Double = 0

  private func recordMemoryPeak() {
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
