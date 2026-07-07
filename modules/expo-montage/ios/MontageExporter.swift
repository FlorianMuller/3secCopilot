import AVFoundation
import CoreMedia
import Foundation

/// Internal, validated form of a MontageClipRecord. `missingDay` and `card` both
/// render as plain black + silence in phase 3 (text and click land in phase 4),
/// so they collapse into a single `black` case here.
enum ExportClipSpec {
  case video(assetId: String, startMs: Double?, endMs: Double?)
  case black(durationMs: Double)

  init(record: MontageClipRecord) throws {
    switch record.type {
    case "video":
      guard let assetId = record.assetId, !assetId.isEmpty else {
        throw MontageError.invalidClip("video clip without assetId")
      }
      self = .video(assetId: assetId, startMs: record.startMs, endMs: record.endMs)
    case "missingDay", "card":
      guard let durationMs = record.durationMs, durationMs > 0 else {
        throw MontageError.invalidClip("\(record.type) clip without a positive durationMs")
      }
      self = .black(durationMs: durationMs)
    default:
      throw MontageError.invalidClip("unknown clip type \"\(record.type)\"")
    }
  }
}

// MARK: - Export task

/// One running export (§5): chunk the timeline, encode each chunk with identical
/// writer settings, then assemble with video passthrough + one continuous AAC
/// audio encode. Owns cancellation, progress weighting, and temp-file hygiene.
/// @unchecked Sendable: mutable state is either lock-guarded or only touched by
/// the single sequential export task.
final class MontageExporter: @unchecked Sendable {
  /// ~monthly chunks (§5.2) — counted in timeline items (clips + beats + card)
  private static let chunkItemLimit = 31
  /// Duration assumed for untrimmed clips until their asset is resolved (progress weighting only)
  private static let untrimmedEstimateMs = 3000.0
  /// Beat used in place of a broken/missing asset (§8.4)
  private static let degradedBeatMs = 500.0
  /// Share of the progress bar reserved for the assemble pass
  private static let assembleShare = 0.08
  /// Share of each chunk's progress slice spent on asset resolution/downloads
  private static let downloadShare = 0.1
  private static let progressEventInterval: TimeInterval = 0.25

  let taskId: String
  private let specs: [ExportClipSpec]
  private let config: WriterConfig
  private let outputURL: URL
  private let sendProgress: (String, Double) -> Void
  private let sendComplete: ([String: Any]) -> Void
  private let sendError: (String, String?) -> Void

  private let resolver = AssetResolver()
  private let memory = MemoryTracker()
  private var warnings: [String] = []

  private let cancelLock = NSLock()
  private var cancelRequested = false

  private let progressLock = NSLock()
  private var maxProgress = 0.0
  private var lastEmitAt = Date.distantPast
  private var lastPhase = ""

  init(
    taskId: String,
    specs: [ExportClipSpec],
    config: WriterConfig,
    outputURL: URL,
    sendProgress: @escaping (String, Double) -> Void,
    sendComplete: @escaping ([String: Any]) -> Void,
    sendError: @escaping (String, String?) -> Void
  ) {
    self.taskId = taskId
    self.specs = specs
    self.config = config
    self.outputURL = outputURL
    self.sendProgress = sendProgress
    self.sendComplete = sendComplete
    self.sendError = sendError
  }

  func start() {
    Task.detached(priority: .userInitiated) { [self] in
      await run()
    }
  }

  func cancel() {
    cancelLock.lock()
    cancelRequested = true
    cancelLock.unlock()
  }

  private func isCancelledNow() -> Bool {
    cancelLock.lock()
    defer { cancelLock.unlock() }
    return cancelRequested
  }

  private func checkCancelled() throws {
    if isCancelledNow() {
      throw MontageError.cancelled
    }
  }

  // MARK: - Lifecycle

  private func run() async {
    do {
      let result = try await performExport()
      sendComplete(result)
    } catch {
      // Never leave a partial output behind (chunk temp cleanup is performExport's defer)
      try? FileManager.default.removeItem(at: outputURL)
      if case MontageError.cancelled = error {
        sendError("cancelled", nil)
      } else {
        let message = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        sendError(message, (error as? MontageError)?.failedAssetId)
      }
    }
  }

  private func performExport() async throws -> [String: Any] {
    guard !specs.isEmpty else {
      throw MontageError.invalidClip("empty clip list")
    }
    let fileManager = FileManager.default

    let chunkDir = fileManager.temporaryDirectory.appendingPathComponent("montage-\(taskId)", isDirectory: true)
    try fileManager.createDirectory(at: chunkDir, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: chunkDir) }

    try fileManager.createDirectory(
      at: outputURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try? fileManager.removeItem(at: outputURL)

    let chunks = stride(from: 0, to: specs.count, by: Self.chunkItemLimit).map {
      Array(specs[$0..<min($0 + Self.chunkItemLimit, specs.count)])
    }
    // Progress denominator: estimates, replaced by real durations as chunks resolve
    // (the monotonic clamp in emitProgress absorbs the estimate corrections)
    var chunkEstimatesMs = chunks.map(Self.estimateMs)
    let assembleShare = chunks.count > 1 ? Self.assembleShare : 0.0

    var chunkURLs: [URL] = []
    var completedMs = 0.0
    var totalOutputSeconds = 0.0

    for (index, chunkSpecs) in chunks.enumerated() {
      try checkCancelled()

      var totalMs = max(chunkEstimatesMs.reduce(0, +), 1)
      var base = completedMs / totalMs * (1 - assembleShare)
      var width = chunkEstimatesMs[index] / totalMs * (1 - assembleShare)
      let downloadableCount = max(Self.videoCount(in: chunkSpecs), 1)

      emitProgress(phase: "download", base)
      let build = try await buildChunk(specs: chunkSpecs) { [weak self] assetFraction, resolvedCount in
        let downloadFraction = (Double(resolvedCount) + assetFraction) / Double(downloadableCount)
        self?.emitProgress(phase: "download", base + width * Self.downloadShare * min(downloadFraction, 1))
      }

      // Replace this chunk's estimate with its real output duration
      chunkEstimatesMs[index] = build.outputDuration.seconds * 1000
      totalMs = max(chunkEstimatesMs.reduce(0, +), 1)
      base = completedMs / totalMs * (1 - assembleShare)
      width = chunkEstimatesMs[index] / totalMs * (1 - assembleShare)
      let chunkSeconds = max(build.outputDuration.seconds, 0.001)
      totalOutputSeconds += build.outputDuration.seconds

      let chunkURL = chunkDir.appendingPathComponent("chunk-\(index).mp4")
      do {
        try await encodeChunk(build, to: chunkURL) { [weak self] encodedSeconds in
          let encodeFraction = min(encodedSeconds / chunkSeconds, 1)
          self?.emitProgress(
            phase: "chunk",
            base + width * (Self.downloadShare + (1 - Self.downloadShare) * encodeFraction)
          )
        }
      } catch {
        Self.deleteFiles(build.tempFileURLs)
        throw error
      }
      Self.deleteFiles(build.tempFileURLs)

      chunkURLs.append(chunkURL)
      completedMs += chunkEstimatesMs[index]
    }

    try checkCancelled()

    if chunkURLs.count == 1 {
      try fileManager.moveItem(at: chunkURLs[0], to: outputURL)
    } else {
      emitProgress(phase: "assemble", 1 - assembleShare)
      let assemble = AssembleSession(
        chunkURLs: chunkURLs,
        outputURL: outputURL,
        config: config,
        isCancelled: { [weak self] in self?.isCancelledNow() ?? true },
        onProgress: { [weak self] fraction in
          self?.emitProgress(phase: "assemble", (1 - assembleShare) + assembleShare * fraction)
        }
      )
      try await assemble.run()
    }

    memory.sample()
    let attributes = try? fileManager.attributesOfItem(atPath: outputURL.path)
    let fileSize = (attributes?[.size] as? Int64) ?? 0

    return [
      "outputPath": outputURL.absoluteString,
      "durationMs": totalOutputSeconds * 1000,
      "fileSizeBytes": fileSize,
      "peakMemoryMB": memory.peakMemoryMB,
      "warnings": warnings,
    ]
  }

  // MARK: - Chunk build (resolve assets -> 2-track composition + output timeline)

  private struct ChunkBuild {
    let composition: AVMutableComposition?
    let videoComposition: AVMutableVideoComposition?
    let timeline: [TimelineItem]
    let audioMode: EncodeAudioMode
    let outputDuration: CMTime
    /// Temp files (Live Photo paired videos) the composition reads from — delete
    /// only after the chunk encode is done with them
    let tempFileURLs: [URL]
    /// Source assets backing the composition's inserted tracks. `AVAssetTrack.asset`
    /// is a weak back-pointer, so without these strong references the assets are
    /// deallocated between resolution and encode and `startReading` fails with
    /// AVFoundationErrorDomain -11800 (Fig -12780 "object invalidated").
    let retainedAssets: [AVAsset]
  }

  private enum PreparedItem {
    case video(videoTrack: AVAssetTrack, audioTrack: AVAssetTrack?, range: CMTimeRange, assetId: String)
    case black(durationMs: Double)
  }

  private func buildChunk(
    specs chunkSpecs: [ExportClipSpec],
    onDownloadProgress: @escaping (Double, Int) -> Void
  ) async throws -> ChunkBuild {
    var prepared: [PreparedItem] = []
    var tempFileURLs: [URL] = []
    var retainedAssets: [AVAsset] = []
    var resolvedCount = 0

    for spec in chunkSpecs {
      try checkCancelled()
      switch spec {
      case .black(let durationMs):
        prepared.append(.black(durationMs: durationMs))
      case .video(let assetId, let startMs, let endMs):
        do {
          let resolved = try await resolver.resolve(assetId: assetId) { progress in
            onDownloadProgress(progress, resolvedCount)
          }
          if let note = resolved.note {
            warnings.append(note)
          }
          if let tempFile = resolved.tempFileURL {
            tempFileURLs.append(tempFile)
          }
          retainedAssets.append(resolved.asset)
          let assetDuration = try await resolved.asset.load(.duration)
          guard let videoTrack = try await resolved.asset.loadTracks(withMediaType: .video).first else {
            throw MontageError.noVideoTrack(assetId)
          }
          let audioTrack = try await resolved.asset.loadTracks(withMediaType: .audio).first
          if audioTrack == nil {
            warnings.append("Clip \(assetId) has no audio track — inserted silence")
          }
          let range = MontageCompositionHelpers.clampedTimeRange(
            startMs: startMs,
            endMs: endMs,
            assetDuration: assetDuration
          )
          prepared.append(.video(videoTrack: videoTrack, audioTrack: audioTrack, range: range, assetId: assetId))
        } catch {
          // §8.4: one bad/missing asset must never abort the export — degrade to a
          // short black beat and keep going. Cancellation still aborts.
          if case MontageError.cancelled = error { throw error }
          warnings.append(
            "Clip \(assetId) could not be loaded (\((error as NSError).localizedDescription)) — replaced with a black beat"
          )
          prepared.append(.black(durationMs: Self.degradedBeatMs))
        }
        resolvedCount += 1
        onDownloadProgress(0, resolvedCount)
      }
    }

    let hasVideoClips = prepared.contains {
      if case .video = $0 { return true }
      return false
    }

    // A chunk that is only beats (sparse month, or every asset degraded): no reader
    // at all — the encode session synthesizes black frames + silence.
    if !hasVideoClips {
      var outputCursor = CMTime.zero
      var timeline: [TimelineItem] = []
      for case .black(let durationMs) in prepared {
        let (item, duration) = Self.blackItem(durationMs: durationMs, at: outputCursor, config: config)
        timeline.append(.black(item))
        outputCursor = outputCursor + duration
      }
      return ChunkBuild(
        composition: nil,
        videoComposition: nil,
        timeline: timeline,
        audioMode: .silence(outputCursor),
        outputDuration: outputCursor,
        tempFileURLs: tempFileURLs,
        retainedAssets: retainedAssets
      )
    }

    let composition = AVMutableComposition()
    guard
      let compVideoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
      )
    else {
      throw MontageError.writerFailed("Could not create composition video track")
    }
    let hasRealAudio = prepared.contains {
      if case .video(_, let audioTrack, _, _) = $0 { return audioTrack != nil }
      return false
    }
    var compAudioTrack: AVMutableCompositionTrack?
    if hasRealAudio {
      guard
        let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
      else {
        throw MontageError.writerFailed("Could not create composition audio track")
      }
      compAudioTrack = track
    }

    // Two timelines (§5.3): the video track is dense (clips back to back, beats do
    // not exist in the composition), the audio track lives on the *output* timeline
    // (real audio + insertEmptyTimeRange for beats and silent clips, as in the spike).
    // The encode loop remaps video PTS and generates black frames for the beats.
    var videoCursor = CMTime.zero
    var outputCursor = CMTime.zero
    var timeline: [TimelineItem] = []
    var instructions: [AVMutableVideoCompositionInstruction] = []

    func appendBlack(durationMs: Double) {
      let (item, duration) = Self.blackItem(durationMs: durationMs, at: outputCursor, config: config)
      timeline.append(.black(item))
      compAudioTrack?.insertEmptyTimeRange(item.outputRange)
      outputCursor = outputCursor + duration
    }

    for item in prepared {
      switch item {
      case .black(let durationMs):
        appendBlack(durationMs: durationMs)

      case .video(let videoTrack, let audioTrack, let range, let assetId):
        do {
          let transform = try await MontageCompositionHelpers.aspectFitTransform(
            for: videoTrack,
            renderSize: config.renderSize
          )
          try compVideoTrack.insertTimeRange(range, of: videoTrack, at: videoCursor)
          let compRange = CMTimeRange(start: videoCursor, duration: range.duration)
          do {
            if let compAudioTrack {
              if let audioTrack {
                try compAudioTrack.insertTimeRange(range, of: audioTrack, at: outputCursor)
              } else {
                compAudioTrack.insertEmptyTimeRange(CMTimeRange(start: outputCursor, duration: range.duration))
              }
            }
          } catch {
            // Roll back the video insertion so the degraded beat stays consistent
            compVideoTrack.removeTimeRange(compRange)
            throw error
          }

          let instruction = AVMutableVideoCompositionInstruction()
          instruction.timeRange = compRange
          let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
          layerInstruction.setTransform(transform, at: compRange.start)
          instruction.layerInstructions = [layerInstruction]
          instructions.append(instruction)

          timeline.append(
            .video(VideoTimelineItem(compositionRange: compRange, outputStart: outputCursor, overlay: nil))
          )
          videoCursor = videoCursor + range.duration
          outputCursor = outputCursor + range.duration
        } catch {
          // Same degradation rule for insertion failures (e.g. slow-mo AVComposition
          // rough edges, §5.5) — black beat + warning instead of aborting
          if case MontageError.cancelled = error { throw error }
          warnings.append(
            "Clip \(assetId) could not be composed (\((error as NSError).localizedDescription)) — replaced with a black beat"
          )
          appendBlack(durationMs: Self.degradedBeatMs)
        }
      }
    }

    // When the chunk ends in beats, the audio track outlives the video track; the
    // video composition still has to cover that span for the reader to accept it.
    // Frames it may render there are dropped by the encode loop (blacks are generated).
    if hasRealAudio, CMTimeCompare(outputCursor, videoCursor) > 0 {
      let tail = AVMutableVideoCompositionInstruction()
      tail.timeRange = CMTimeRange(start: videoCursor, end: outputCursor)
      instructions.append(tail)
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = config.renderSize
    videoComposition.frameDuration = config.frameDuration
    videoComposition.instructions = instructions
    // Force SDR BT.709 output: HDR sources (HLG/Dolby Vision, BT.2020) are tone-mapped
    // by the compositor instead of being read as-is (which looks washed out).
    videoComposition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    videoComposition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    videoComposition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2

    return ChunkBuild(
      composition: composition,
      videoComposition: videoComposition,
      timeline: timeline,
      audioMode: hasRealAudio ? .reader : .silence(outputCursor),
      outputDuration: outputCursor,
      tempFileURLs: tempFileURLs,
      retainedAssets: retainedAssets
    )
  }

  /// Beats are quantized to whole output frames so black-frame PTS land exactly on
  /// the fps grid.
  private static func blackItem(durationMs: Double, at outputStart: CMTime, config: WriterConfig) -> (BlackTimelineItem, CMTime) {
    let frames = max(1, Int((durationMs / 1000 * Double(config.fps)).rounded()))
    let duration = CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(config.fps))
    let item = BlackTimelineItem(
      outputRange: CMTimeRange(start: outputStart, duration: duration),
      frameCount: frames
    )
    return (item, duration)
  }

  // MARK: - Chunk encode

  private func encodeChunk(
    _ build: ChunkBuild,
    to chunkURL: URL,
    onEncodedSeconds: @escaping (Double) -> Void
  ) async throws {
    // Transient AVFoundation failures (media services reset, -11819) are worth one
    // automatic retry with a fresh reader/writer graph (spike lesson).
    var lastError: Error?
    for attempt in 0..<2 {
      try checkCancelled()
      if attempt > 0 {
        try? await Task.sleep(nanoseconds: 700_000_000)
        try? FileManager.default.removeItem(at: chunkURL)
      }
      do {
        let session = try EncodeSession(
          composition: build.composition,
          videoComposition: build.videoComposition,
          timeline: build.timeline,
          audioMode: build.audioMode,
          config: config,
          outputURL: chunkURL,
          memory: memory,
          isCancelled: { [weak self] in self?.isCancelledNow() ?? true },
          onProgress: onEncodedSeconds
        )
        try await session.encode()
        if attempt > 0 {
          warnings.append(
            "Chunk encode succeeded on automatic retry (first attempt: \(lastError.map(String.init(describing:)) ?? "?"))"
          )
        }
        return
      } catch {
        if case MontageError.cancelled = error { throw error }
        lastError = error
      }
    }
    throw lastError ?? MontageError.writerFailed("chunk encode failed")
  }

  // MARK: - Progress

  /// Monotonic, throttled (~4 events/s) progress emission. Phase changes always emit.
  private func emitProgress(phase: String, _ value: Double) {
    progressLock.lock()
    let clamped = min(max(value, maxProgress), 1)
    maxProgress = clamped
    let now = Date()
    let shouldEmit = phase != lastPhase || now.timeIntervalSince(lastEmitAt) >= Self.progressEventInterval
    if shouldEmit {
      lastPhase = phase
      lastEmitAt = now
    }
    progressLock.unlock()
    if shouldEmit {
      sendProgress(phase, clamped)
    }
  }

  // MARK: - Helpers

  private static func estimateMs(_ specs: [ExportClipSpec]) -> Double {
    specs.reduce(0) { sum, spec in
      switch spec {
      case .black(let durationMs):
        return sum + durationMs
      case .video(_, let startMs, let endMs):
        if let startMs, let endMs, endMs > startMs {
          return sum + (endMs - startMs)
        }
        return sum + untrimmedEstimateMs
      }
    }
  }

  private static func videoCount(in specs: [ExportClipSpec]) -> Int {
    specs.filter {
      if case .video = $0 { return true }
      return false
    }.count
  }

  private static func deleteFiles(_ urls: [URL]) {
    for url in urls {
      try? FileManager.default.removeItem(at: url)
    }
  }
}

// MARK: - Assemble pass (§5.2)

/// One reader+writer pass over the uniform chunk files: video is passthrough
/// (compressed samples copied, no re-encode), audio is decoded and re-encoded as a
/// single continuous AAC stream (kills the AAC priming-sample pops at boundaries).
/// @unchecked Sendable: AVFoundation objects only touched from the pump queues.
final class AssembleSession: @unchecked Sendable {
  private let chunkURLs: [URL]
  private let outputURL: URL
  private let config: WriterConfig
  private let isCancelled: () -> Bool
  private let onProgress: (Double) -> Void

  init(
    chunkURLs: [URL],
    outputURL: URL,
    config: WriterConfig,
    isCancelled: @escaping () -> Bool,
    onProgress: @escaping (Double) -> Void
  ) {
    self.chunkURLs = chunkURLs
    self.outputURL = outputURL
    self.config = config
    self.isCancelled = isCancelled
    self.onProgress = onProgress
  }

  func run() async throws {
    var assets: [AVURLAsset] = []
    var durations: [CMTime] = []
    var videoFormatHint: CMFormatDescription?
    for url in chunkURLs {
      let asset = AVURLAsset(url: url)
      durations.append(try await asset.load(.duration))
      assets.append(asset)
      if videoFormatHint == nil, let track = try await asset.loadTracks(withMediaType: .video).first {
        videoFormatHint = try await track.load(.formatDescriptions).first
      }
    }
    guard let videoFormatHint else {
      throw MontageError.writerFailed("No video track found in chunk files")
    }
    let totalSeconds = max(durations.reduce(CMTime.zero, +).seconds, 0.001)

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    // Video passthrough: nil outputSettings — compressed samples copied as-is
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: videoFormatHint)
    videoInput.expectsMediaDataInRealTime = false
    writer.add(videoInput)
    let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: config.audioOutputSettings)
    audioInput.expectsMediaDataInRealTime = false
    writer.add(audioInput)

    // All chunk readers are opened up front and each writer input is armed with
    // requestMediaDataWhenReady exactly ONCE — AVFoundation throws
    // "cannot be called more than once" if it is re-armed per chunk. The pump
    // itself advances through the per-chunk reader outputs.
    var readers: [AVAssetReader] = []
    var videoSegments: [SegmentSource] = []
    var audioSegments: [SegmentSource] = []
    var offset = CMTime.zero
    for (index, asset) in assets.enumerated() {
      let reader = try AVAssetReader(asset: asset)
      guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
        throw MontageError.readerFailed("chunk file has no video track: \(asset.url.lastPathComponent)")
      }
      let videoOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: nil)
      videoOutput.alwaysCopiesSampleData = false
      reader.add(videoOutput)
      videoSegments.append(SegmentSource(output: videoOutput, offset: offset))

      if let audioTrack = try await asset.loadTracks(withMediaType: .audio).first {
        // Decode to PCM here; the writer re-encodes everything as one AAC stream
        let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
        output.alwaysCopiesSampleData = false
        reader.add(output)
        audioSegments.append(SegmentSource(output: output, offset: offset))
      }

      guard reader.startReading() else {
        throw MontageError.readerFailed("assemble startReading: \(MontageCompositionHelpers.describe(reader.error))")
      }
      readers.append(reader)
      offset = offset + durations[index]
    }

    guard writer.startWriting() else {
      throw MontageError.writerFailed("assemble startWriting: \(MontageCompositionHelpers.describe(writer.error))")
    }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    var cancelled = false
    group.enter()
    pumpSequence(
      input: videoInput,
      segments: videoSegments,
      queueLabel: "expo.montage.assemble.video",
      group: group,
      cancelledFlag: { cancelled = true },
      progressSeconds: { [onProgress = self.onProgress] seconds in onProgress(min(seconds / totalSeconds, 1)) }
    )
    if audioSegments.isEmpty {
      audioInput.markAsFinished()
    } else {
      group.enter()
      pumpSequence(
        input: audioInput,
        segments: audioSegments,
        queueLabel: "expo.montage.assemble.audio",
        group: group,
        cancelledFlag: { cancelled = true },
        progressSeconds: nil
      )
    }

    await withCheckedContinuation { continuation in
      group.notify(queue: .global()) { continuation.resume() }
    }

    if cancelled || isCancelled() {
      readers.forEach { $0.cancelReading() }
      writer.cancelWriting()
      throw MontageError.cancelled
    }
    if let failed = readers.first(where: { $0.status == .failed }) {
      writer.cancelWriting()
      throw MontageError.readerFailed("assemble read: \(MontageCompositionHelpers.describe(failed.error))")
    }
    readers.filter { $0.status == .reading }.forEach { $0.cancelReading() }

    await writer.finishWriting()
    if writer.status != .completed {
      throw MontageError.writerFailed(
        "assemble finishWriting: \(MontageCompositionHelpers.describe(writer.error)) (status \(writer.status.rawValue))"
      )
    }
  }

  /// One chunk file's contribution to a writer input: the reader output plus the
  /// accumulated timeline offset its samples are retimed by.
  private struct SegmentSource {
    let output: AVAssetReaderTrackOutput
    let offset: CMTime
  }

  /// Feeds a whole sequence of chunk outputs into a writer input. Armed exactly once
  /// per input; advances to the next segment when the current one is exhausted and
  /// calls markAsFinished after the last (or on cancellation).
  ///
  /// Retiming anchors every segment's first sample at `offset` past the first
  /// segment's own start instead of trusting the delivered timestamps: passthrough
  /// track outputs deliver *media*-timeline timestamps, which include the chunk
  /// file's edit-list shift for the H.264 reorder delay (first video pts is 1–2
  /// frames > 0). Concatenating with plain container-duration offsets therefore left
  /// a 1–2 frame hole before every chunk and an equal overlap at its end — the
  /// writer papered over each boundary with an empty edit (visible stutter) and a
  /// dropped frame. Anchoring per segment keeps the grid dense across boundaries.
  /// (The first sample in decode order is the segment's first *displayed* frame too
  /// — guaranteed for our own uniform chunk encodes, which open on an IDR frame.)
  private func pumpSequence(
    input: AVAssetWriterInput,
    segments: [SegmentSource],
    queueLabel: String,
    group: DispatchGroup,
    cancelledFlag: @escaping () -> Void,
    progressSeconds: ((Double) -> Void)?
  ) {
    let queue = DispatchQueue(label: queueLabel)
    var segmentIndex = 0
    var trackAnchor: CMTime?
    var segmentAdjust: CMTime?
    var done = false
    input.requestMediaDataWhenReady(on: queue) { [self] in
      if done { return }
      while input.isReadyForMoreMediaData {
        if isCancelled() {
          cancelledFlag()
          done = true
          input.markAsFinished()
          group.leave()
          return
        }
        let finishedAll = autoreleasepool { () -> Bool in
          while segmentIndex < segments.count {
            let segment = segments[segmentIndex]
            guard let sample = segment.output.copyNextSampleBuffer() else {
              // Current chunk exhausted — move on to the next one
              segmentIndex += 1
              segmentAdjust = nil
              continue
            }
            // Zero-length marker buffers emitted at the chunk's edit-list
            // boundaries carry no media (some with invalid timestamps) — skip them
            guard CMSampleBufferGetNumSamples(sample) > 0 else { continue }
            if segmentAdjust == nil {
              let firstPTS = CMSampleBufferGetPresentationTimeStamp(sample)
              let anchor = trackAnchor ?? firstPTS
              trackAnchor = anchor
              segmentAdjust = segment.offset + anchor - firstPTS
            }
            if let retimed = Self.retimed(sample, by: segmentAdjust ?? segment.offset) {
              input.append(retimed)
              if let progressSeconds {
                progressSeconds(CMSampleBufferGetPresentationTimeStamp(retimed).seconds)
              }
            }
            return false
          }
          done = true
          input.markAsFinished()
          group.leave()
          return true
        }
        if finishedAll {
          return
        }
      }
    }
  }

  private static func retimed(_ sample: CMSampleBuffer, by offset: CMTime) -> CMSampleBuffer? {
    guard CMTimeCompare(offset, .zero) != 0 else { return sample }
    var count: CMItemCount = 0
    CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count)
    guard count > 0 else { return sample }
    var infos = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(), count: count)
    CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: count, arrayToFill: &infos, entriesNeededOut: &count)
    for index in 0..<Int(count) {
      infos[index].presentationTimeStamp = infos[index].presentationTimeStamp + offset
      if infos[index].decodeTimeStamp.isValid {
        infos[index].decodeTimeStamp = infos[index].decodeTimeStamp + offset
      }
    }
    var retimed: CMSampleBuffer?
    let status = CMSampleBufferCreateCopyWithNewTiming(
      allocator: kCFAllocatorDefault,
      sampleBuffer: sample,
      sampleTimingEntryCount: count,
      sampleTimingArray: &infos,
      sampleBufferOut: &retimed
    )
    return status == noErr ? retimed : nil
  }
}
