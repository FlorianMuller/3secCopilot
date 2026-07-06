import ExpoModulesCore
import AVFoundation
import Photos

// SPIKE — Phase 1 de-risking module for the export feature (see doc/export-spec.md §10).
// Proves: fetch PHAssets by id -> AVMutableComposition (1 video + 1 audio track) ->
// per-segment orientation normalization + aspect-fit scaling into a fixed renderSize ->
// single AVAssetExportSession encode. No chunking, no overlays, no missing-day beats —
// those are later phases. Not production API surface.
public class ExpoMontageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoMontage")

    AsyncFunction("spikeConcat") { (assetIds: [String], renderSize: [String: Double], outputPath: String, promise: Promise) in
      guard let width = renderSize["width"], let height = renderSize["height"] else {
        promise.resolve([
          "success": false,
          "error": "renderSize must include width and height",
        ])
        return
      }
      let targetSize = CGSize(width: width, height: height)

      ExpoMontageModule.spikeConcat(assetIds: assetIds, renderSize: targetSize, outputPath: outputPath) { result in
        promise.resolve(result)
      }
    }
  }

  // MARK: - Implementation

  private static func spikeConcat(
    assetIds: [String],
    renderSize: CGSize,
    outputPath: String,
    completion: @escaping ([String: Any?]) -> Void
  ) {
    let startedAt = Date()

    // Run the whole pipeline off the JS/main thread — this can take a few seconds.
    DispatchQueue.global(qos: .userInitiated).async {
      let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: assetIds, options: nil)
      guard fetchResult.count == assetIds.count else {
        completion([
          "success": false,
          "error": "Expected \(assetIds.count) PHAssets, found \(fetchResult.count). Some assetIds may not resolve.",
        ])
        return
      }

      // Preserve caller-specified order (fetchResult order is not guaranteed to match assetIds).
      var assetsById: [String: PHAsset] = [:]
      fetchResult.enumerateObjects { asset, _, _ in
        assetsById[asset.localIdentifier] = asset
      }
      let orderedAssets = assetIds.compactMap { assetsById[$0] }
      guard orderedAssets.count == assetIds.count else {
        completion([
          "success": false,
          "error": "Could not resolve all assetIds to PHAssets.",
        ])
        return
      }

      // Resolve every PHAsset -> AVAsset via the completion-handler based PHImageManager API,
      // synchronizing back onto this background queue with a DispatchGroup.
      var avAssetsById: [String: AVAsset] = [:]
      var resolutionErrors: [String] = []
      let group = DispatchGroup()
      let lock = NSLock()

      let requestOptions = PHVideoRequestOptions()
      requestOptions.isNetworkAccessAllowed = true
      requestOptions.deliveryMode = .highQualityFormat
      requestOptions.version = .current

      for asset in orderedAssets {
        group.enter()
        PHImageManager.default().requestAVAsset(forVideo: asset, options: requestOptions) { avAsset, _, info in
          lock.lock()
          if let avAsset = avAsset {
            avAssetsById[asset.localIdentifier] = avAsset
          } else {
            let reason = (info?[PHImageErrorKey] as? NSError)?.localizedDescription ?? "unknown error"
            resolutionErrors.append("Failed to resolve AVAsset for \(asset.localIdentifier): \(reason)")
          }
          lock.unlock()
          group.leave()
        }
      }

      group.wait()

      guard resolutionErrors.isEmpty else {
        completion([
          "success": false,
          "error": resolutionErrors.joined(separator: "; "),
        ])
        return
      }

      let orderedAVAssets = assetIds.compactMap { avAssetsById[$0] }
      guard orderedAVAssets.count == assetIds.count else {
        completion([
          "success": false,
          "error": "AVAsset resolution produced an incomplete/out-of-order result set.",
        ])
        return
      }

      do {
        let (composition, videoComposition) = try buildComposition(from: orderedAVAssets, renderSize: renderSize)
        export(
          composition: composition,
          videoComposition: videoComposition,
          outputPath: outputPath,
          startedAt: startedAt,
          completion: completion
        )
      } catch {
        completion([
          "success": false,
          "error": "Composition build failed: \(error.localizedDescription)",
        ])
      }
    }
  }

  private static func buildComposition(
    from avAssets: [AVAsset],
    renderSize: CGSize
  ) throws -> (AVMutableComposition, AVMutableVideoComposition) {
    let composition = AVMutableComposition()
    guard
      let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      throw NSError(domain: "ExpoMontage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create composition tracks"])
    }

    var instructions: [AVMutableVideoCompositionInstruction] = []
    var cursor = CMTime.zero

    for avAsset in avAssets {
      guard let sourceVideoTrack = avAsset.tracks(withMediaType: .video).first else {
        throw NSError(domain: "ExpoMontage", code: 2, userInfo: [NSLocalizedDescriptionKey: "Asset has no video track"])
      }
      let timeRange = CMTimeRange(start: .zero, duration: avAsset.duration)

      try videoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: cursor)

      if let sourceAudioTrack = avAsset.tracks(withMediaType: .audio).first {
        try audioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: cursor)
      }
      // else: silent segment (no audio track on source) — video-only insertion above still holds the timeline.

      // Per-segment layer instruction: orientation-correct + aspect-fit scale into renderSize, centered.
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: avAsset.duration)

      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
      let transform = aspectFitTransform(for: sourceVideoTrack, renderSize: renderSize)
      layerInstruction.setTransform(transform, at: cursor)
      instruction.layerInstructions = [layerInstruction]
      instructions.append(instruction)

      cursor = cursor + avAsset.duration
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = instructions

    return (composition, videoComposition)
  }

  /// Computes the transform that maps a source video track's natural size (after applying its
  /// own `preferredTransform` for orientation) into `renderSize` via aspect-fit: scaled to fit,
  /// centered, letterboxed/pillarboxed as needed — never cropped, never stretched.
  private static func aspectFitTransform(for track: AVAssetTrack, renderSize: CGSize) -> CGAffineTransform {
    let naturalSize = track.naturalSize
    let preferredTransform = track.preferredTransform

    // CGRect.applying(_:) returns the smallest (normalized, non-negative width/height) rect
    // containing the transformed corners — i.e. the orientation-corrected bounding box, with
    // its origin telling us how far off (0,0) the rotation moved the frame.
    let transformedRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    let orientedSize = transformedRect.size

    let scale = min(renderSize.width / orientedSize.width, renderSize.height / orientedSize.height)
    let scaledWidth = orientedSize.width * scale
    let scaledHeight = orientedSize.height * scale
    let translateX = (renderSize.width - scaledWidth) / 2
    let translateY = (renderSize.height - scaledHeight) / 2

    // 1) orient the source frame correctly (preferredTransform), 2) slide its (possibly
    // negative-origin) bounding box back to (0,0), 3) scale to fit renderSize, 4) center.
    let moveToOrigin = CGAffineTransform(translationX: -transformedRect.origin.x, y: -transformedRect.origin.y)
    let scaleTransform = CGAffineTransform(scaleX: scale, y: scale)
    let centerTransform = CGAffineTransform(translationX: translateX, y: translateY)

    return preferredTransform
      .concatenating(moveToOrigin)
      .concatenating(scaleTransform)
      .concatenating(centerTransform)
  }

  private static func export(
    composition: AVMutableComposition,
    videoComposition: AVMutableVideoComposition,
    outputPath: String,
    startedAt: Date,
    completion: @escaping ([String: Any?]) -> Void
  ) {
    guard let outputURL = URL(string: outputPath) ?? URL(string: "file://" + outputPath) else {
      completion(["success": false, "error": "Invalid outputPath: \(outputPath)"])
      return
    }

    // AVAssetExportSession refuses to overwrite an existing file.
    if FileManager.default.fileExists(atPath: outputURL.path) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      completion(["success": false, "error": "Could not create AVAssetExportSession"])
      return
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.videoComposition = videoComposition
    exportSession.shouldOptimizeForNetworkUse = true

    exportSession.exportAsynchronously {
      let durationMs = Int(Date().timeIntervalSince(startedAt) * 1000)
      switch exportSession.status {
      case .completed:
        completion([
          "success": true,
          "outputPath": outputURL.absoluteString,
          "durationMs": durationMs,
        ])
      case .failed, .cancelled:
        completion([
          "success": false,
          "error": exportSession.error?.localizedDescription ?? "Export failed with status \(exportSession.status.rawValue)",
          "durationMs": durationMs,
        ])
      default:
        completion([
          "success": false,
          "error": "Unexpected export status \(exportSession.status.rawValue)",
          "durationMs": durationMs,
        ])
      }
    }
  }
}
