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

// MARK: - exportMontage records (§7)

struct RenderSizeRecord: Record {
  @Field var width: Double = 1920
  @Field var height: Double = 1080
}

struct OverlaySettingsRecord: Record {
  @Field var position: String = "bottomLeft"
  @Field var cardFontSize: Double = 0
  @Field var dateFontSize: Double = 0
  @Field var hourFontSize: Double = 0
  @Field var titleFontSize: Double = 0
  @Field var descriptionFontSize: Double = 0
}

struct MontageClipRecord: Record {
  /// "video" | "missingDay" | "card"
  @Field var type: String = "video"
  @Field var assetId: String? = nil
  @Field var startMs: Double? = nil
  @Field var endMs: Double? = nil
  @Field var durationMs: Double? = nil
  /// Accepted but ignored in phase 3 — text overlays land in phase 4
  @Field var overlayLines: [String]? = nil
}

struct MontageSettingsRecord: Record {
  @Field var renderSize: RenderSizeRecord = RenderSizeRecord()
  @Field var fps: Double = 30
  @Field var videoAverageBitrate: Double = 16_000_000
  @Field var audioBitrate: Double = 256_000
  /// Accepted but unused in phase 3 — the click sound lands in phase 4
  @Field var missingDayClick: Bool = false
  /// "preview" | "full" — accepted; preview currently behaves like full
  @Field var mode: String = "full"
  /// Accepted but unused in phase 3
  @Field var overlay: OverlaySettingsRecord? = nil
  /// file:// URL under the app's documents directory (parent dir is created)
  @Field var outputPath: String = ""
}

public class ExpoMontageModule: Module {
  private var currentExporter: MontageExporter?
  private let exporterLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("ExpoMontage")

    Events("onExportProgress", "onExportComplete", "onExportError")

    AsyncFunction("spikeConcat") { (clips: [SpikeClip], options: SpikeOptions) async throws -> [String: Any] in
      let composer = SpikeComposer()
      return try await composer.run(clips: clips, options: options)
    }

    // Returns { taskId } immediately; the export proceeds asynchronously and reports
    // through the onExportProgress/onExportComplete/onExportError events.
    AsyncFunction("exportMontage") { (clips: [MontageClipRecord], settings: MontageSettingsRecord) throws -> [String: Any] in
      let specs = try clips.map(ExportClipSpec.init(record:))
      guard let outputURL = URL(string: settings.outputPath), outputURL.isFileURL else {
        throw MontageError.invalidOutputPath(settings.outputPath)
      }
      let config = WriterConfig(
        width: Int(settings.renderSize.width),
        height: Int(settings.renderSize.height),
        fps: Int(settings.fps.rounded()),
        videoBitrate: Int(settings.videoAverageBitrate),
        audioBitrate: Int(settings.audioBitrate)
      )

      let taskId = UUID().uuidString
      let exporter = MontageExporter(
        taskId: taskId,
        specs: specs,
        config: config,
        outputURL: outputURL,
        sendProgress: { [weak self] phase, progress in
          self?.sendEvent("onExportProgress", ["taskId": taskId, "progress": progress, "phase": phase])
        },
        sendComplete: { [weak self] body in
          var event = body
          event["taskId"] = taskId
          self?.sendEvent("onExportComplete", event)
          self?.clearExporter(taskId: taskId)
        },
        sendError: { [weak self] message, failedAssetId in
          var event: [String: Any] = ["taskId": taskId, "message": message]
          if let failedAssetId {
            event["failedAssetId"] = failedAssetId
          }
          self?.sendEvent("onExportError", event)
          self?.clearExporter(taskId: taskId)
        }
      )

      // One export at a time: the pipeline saturates the media hardware as it is
      self.exporterLock.lock()
      if self.currentExporter != nil {
        self.exporterLock.unlock()
        throw MontageError.exportInProgress
      }
      self.currentExporter = exporter
      self.exporterLock.unlock()

      exporter.start()
      return ["taskId": taskId]
    }

    // Aborts the running export: reader/writer are torn down, temp chunk files and
    // the partial output are deleted, then onExportError fires with message "cancelled".
    AsyncFunction("cancelExport") { (taskId: String) throws in
      self.exporterLock.lock()
      let exporter = self.currentExporter
      self.exporterLock.unlock()
      guard let exporter, exporter.taskId == taskId else {
        throw MontageError.unknownTask(taskId)
      }
      exporter.cancel()
    }
  }

  private func clearExporter(taskId: String) {
    exporterLock.lock()
    if currentExporter?.taskId == taskId {
      currentExporter = nil
    }
    exporterLock.unlock()
  }
}

// MARK: - Phase-1 spike (kept as a dev harness; runs on the shared internals)

private final class SpikeComposer {
  private let resolver = AssetResolver()
  private let memory = MemoryTracker()

  func run(clips: [SpikeClip], options: SpikeOptions) async throws -> [String: Any] {
    let config = WriterConfig(
      width: Int(options.width),
      height: Int(options.height),
      fps: Int(options.fps.rounded()),
      videoBitrate: Int(options.videoBitrate),
      audioBitrate: 256_000
    )
    var warnings: [String] = []

    let startedAt = Date()
    let (composition, videoComposition, timeline) = try await buildComposition(
      clips: clips,
      config: config,
      warnings: &warnings
    )
    let audioMode: EncodeAudioMode = composition.tracks(withMediaType: .audio).isEmpty ? .none : .reader

    // Transient AVFoundation failures (media services reset, -11819) are worth one
    // automatic retry with a fresh reader/writer graph and a fresh output file.
    var outputURL: URL!
    var lastError: Error?
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
          timeline: timeline,
          audioMode: audioMode,
          config: config,
          outputURL: outputURL,
          memory: memory
        )
        try await session.encode()
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
      "peakMemoryMB": memory.peakMemoryMB,
      "warnings": warnings,
    ]
  }

  // MARK: - Composition (identity timeline: composition time == output time)

  private func buildComposition(
    clips: [SpikeClip],
    config: WriterConfig,
    warnings: inout [String]
  ) async throws -> (AVMutableComposition, AVMutableVideoComposition, [TimelineItem]) {
    let renderSize = config.renderSize
    let composition = AVMutableComposition()
    guard
      let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      throw MontageError.writerFailed("Could not create composition tracks")
    }

    var cursor = CMTime.zero
    var instructions: [AVMutableVideoCompositionInstruction] = []
    var timeline: [TimelineItem] = []

    for clip in clips {
      let resolved = try await resolver.resolve(assetId: clip.assetId)
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

      let timeRange = MontageCompositionHelpers.clampedTimeRange(
        startMs: clip.startMs,
        endMs: clip.endMs,
        assetDuration: assetDuration
      )
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
      let transform = try await MontageCompositionHelpers.aspectFitTransform(for: sourceVideoTrack, renderSize: renderSize)
      layerInstruction.setTransform(transform, at: outputRange.start)
      instruction.layerInstructions = [layerInstruction]
      instructions.append(instruction)

      let overlay = clip.overlayText.flatMap { MontageCompositionHelpers.overlayImage(text: $0, renderSize: renderSize) }
      timeline.append(
        .video(VideoTimelineItem(compositionRange: outputRange, outputStart: outputRange.start, overlay: overlay))
      )

      cursor = cursor + timeRange.duration
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = config.frameDuration
    videoComposition.instructions = instructions
    // Force SDR BT.709 output: HDR sources (HLG/Dolby Vision, BT.2020) are tone-mapped
    // by the compositor instead of being read as-is (which looks washed out).
    videoComposition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    videoComposition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    videoComposition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    // NOTE: no animationTool — AVAssetReader rejects video compositions that have one.
    // Overlays are composited with CoreImage in the encode loop instead.

    return (composition, videoComposition, timeline)
  }
}
