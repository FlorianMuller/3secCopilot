import AVFoundation
import CoreImage
import CoreMedia

/// One entry of the output timeline of an encode session.
///
/// Video items map frames read from the composition (video-track timeline) to their
/// position on the output timeline. Black items have no source at all — solid black
/// frames are generated straight into pool pixel buffers in the encode loop (§5.3),
/// no composition trick involved. When the two timelines are identical (spike, chunks
/// without beats) the mapping is the identity and samples pass through untouched.
enum TimelineItem {
  case video(VideoTimelineItem)
  case black(BlackTimelineItem)
}

struct VideoTimelineItem {
  /// Where the clip's frames live on the composition's video-track timeline
  let compositionRange: CMTimeRange
  /// Where they belong on the output timeline
  let outputStart: CMTime
  /// Pre-rendered overlay (§5.3), composited per frame
  let overlay: CIImage?
}

struct BlackTimelineItem {
  let outputRange: CMTimeRange
  /// Frame-quantized beat length (durations are rounded to whole frames upstream)
  let frameCount: Int
  /// Pre-rendered overlay (missing-day date line or the opening card's text, §6)
  let overlay: CIImage?
}

/// Missing-day clicks spliced into a synthesized-silence audio span (§6.2) — used
/// when the chunk has no composition audio track to insert the click file into.
struct SilenceClicks {
  let pcm: ClickPCM
  /// Click start positions on the chunk's output timeline, in 44.1 kHz frames
  let positions: [Int]
}

/// How the session produces its audio stream.
enum EncodeAudioMode {
  /// Composition audio track(s) laid out on the output timeline (real audio +
  /// insertEmptyTimeRange spans + inserted click file segments) — read and appended as-is.
  case reader
  /// No usable source audio in this span: synthesize silent PCM for the whole
  /// output duration (with missing-day clicks spliced in when enabled) so every
  /// chunk file has an audio track for the assemble pass.
  case silence(duration: CMTime, clicks: SilenceClicks?)
  /// No audio at all (spike with an audio-less composition).
  case none
}

// MARK: - Encode session (AVAssetReader -> CoreImage/black generation -> AVAssetWriter)

/// Holds the reader/writer graph for one encode (the spike or one export chunk).
/// @unchecked Sendable: the AVFoundation objects are only touched from their
/// requestMediaDataWhenReady serial queues.
final class EncodeSession: @unchecked Sendable {
  private let reader: AVAssetReader?
  private let writer: AVAssetWriter
  private let videoOutput: AVAssetReaderVideoCompositionOutput?
  private let audioOutput: AVAssetReaderAudioMixOutput?
  private let videoInput: AVAssetWriterInput
  private let audioInput: AVAssetWriterInput?
  private let pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor
  private let timeline: [TimelineItem]
  private let config: WriterConfig
  private let memory: MemoryTracker
  private let isCancelled: () -> Bool
  private let onProgress: ((Double) -> Void)?
  private let renderBounds: CGRect
  private let renderColorSpace: CGColorSpace
  private let ciContext = CIContext(options: [.cacheIntermediates: false])
  private lazy var blackImage = CIImage(color: CIColor(red: 0, green: 0, blue: 0)).cropped(to: renderBounds)

  // Video pump state — only touched on the video pump queue
  private var itemCursor = 0
  private var blackFramesEmitted = 0
  private var pendingSample: CMSampleBuffer?
  private var readerVideoDone = false
  private var frameCount = 0

  // Silence pump state — only touched on the audio pump queue
  private let silenceTotalFrames: Int
  private var silenceFramesEmitted = 0
  private let silenceFormat: CMAudioFormatDescription?
  private let silenceClicks: SilenceClicks?

  /// Set from the pump queues when isCancelled() fires mid-encode
  private var wasCancelled = false

  init(
    composition: AVComposition?,
    videoComposition: AVVideoComposition?,
    timeline: [TimelineItem],
    audioMode: EncodeAudioMode,
    config: WriterConfig,
    outputURL: URL,
    memory: MemoryTracker,
    isCancelled: @escaping () -> Bool = { false },
    onProgress: ((Double) -> Void)? = nil
  ) throws {
    self.timeline = timeline
    self.config = config
    self.memory = memory
    self.isCancelled = isCancelled
    self.onProgress = onProgress
    self.renderBounds = CGRect(x: 0, y: 0, width: config.width, height: config.height)
    self.renderColorSpace = CGColorSpace(name: CGColorSpace.itur_709) ?? CGColorSpaceCreateDeviceRGB()

    if let composition {
      let reader = try AVAssetReader(asset: composition)

      let videoOutput = AVAssetReaderVideoCompositionOutput(
        videoTracks: composition.tracks(withMediaType: .video),
        videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      )
      videoOutput.videoComposition = videoComposition
      videoOutput.alwaysCopiesSampleData = false
      reader.add(videoOutput)
      self.videoOutput = videoOutput

      if case .reader = audioMode {
        let audioTracks = composition.tracks(withMediaType: .audio)
        if !audioTracks.isEmpty {
          let output = AVAssetReaderAudioMixOutput(audioTracks: audioTracks, audioSettings: nil)
          output.alwaysCopiesSampleData = false
          reader.add(output)
          self.audioOutput = output
        } else {
          self.audioOutput = nil
        }
      } else {
        self.audioOutput = nil
      }
      self.reader = reader
    } else {
      // Pure synthesized span (a chunk that is only beats): no reader at all
      self.reader = nil
      self.videoOutput = nil
      self.audioOutput = nil
    }

    writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: config.videoOutputSettings)
    videoInput.expectsMediaDataInRealTime = false
    pixelBufferAdaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: config.width,
        kCVPixelBufferHeightKey as String: config.height,
      ]
    )
    writer.add(videoInput)
    self.videoInput = videoInput

    switch audioMode {
    case .none:
      self.audioInput = nil
      self.silenceTotalFrames = 0
      self.silenceFormat = nil
      self.silenceClicks = nil
    case .reader:
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: config.audioOutputSettings)
      input.expectsMediaDataInRealTime = false
      writer.add(input)
      self.audioInput = input
      self.silenceTotalFrames = 0
      self.silenceFormat = nil
      self.silenceClicks = nil
    case .silence(let duration, let clicks):
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: config.audioOutputSettings)
      input.expectsMediaDataInRealTime = false
      writer.add(input)
      self.audioInput = input
      self.silenceTotalFrames = Int((duration.seconds * 44_100).rounded())
      self.silenceFormat = Self.makeSilenceFormatDescription()
      self.silenceClicks = clicks
    }
  }

  func encode() async throws {
    guard writer.startWriting() else {
      throw MontageError.writerFailed("startWriting: \(MontageCompositionHelpers.describe(writer.error))")
    }
    if let reader, !reader.startReading() {
      writer.cancelWriting()
      throw MontageError.readerFailed("startReading: \(MontageCompositionHelpers.describe(reader.error))")
    }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    group.enter()
    pumpVideo(group: group)
    if audioInput != nil {
      group.enter()
      if audioOutput != nil {
        pumpAudio(group: group)
      } else {
        pumpSilence(group: group)
      }
    }

    await withCheckedContinuation { continuation in
      group.notify(queue: .global()) { continuation.resume() }
    }

    if wasCancelled {
      reader?.cancelReading()
      writer.cancelWriting()
      throw MontageError.cancelled
    }

    if let reader {
      if reader.status == .failed {
        writer.cancelWriting()
        throw MontageError.readerFailed("during read: \(MontageCompositionHelpers.describe(reader.error))")
      }
      if reader.status == .reading {
        // Unconsumed tail samples (a chunk ending in beats) — the timeline is done, drop them
        reader.cancelReading()
      }
    }

    await writer.finishWriting()
    if writer.status != .completed {
      throw MontageError.writerFailed(
        "finishWriting: \(MontageCompositionHelpers.describe(writer.error)) (status \(writer.status.rawValue))"
      )
    }
  }

  // MARK: - Video pump

  private func pumpVideo(group: DispatchGroup) {
    let queue = DispatchQueue(label: "expo.montage.video")
    videoInput.requestMediaDataWhenReady(on: queue) { [self] in
      while videoInput.isReadyForMoreMediaData {
        if isCancelled() {
          wasCancelled = true
          finishVideo(group: group)
          return
        }
        var finished = false
        var stalled = false
        // Each 1080p BGRA frame is ~8 MB of transient buffers; without draining the
        // autorelease pool per frame they accumulate for the whole callback and the
        // app gets jetsammed on year-scale (or even 60fps spike-scale) encodes (§11.5).
        autoreleasepool {
          (finished, stalled) = stepVideo(group: group)
        }
        if finished || stalled {
          return
        }
      }
    }
  }

  /// One unit of video work (one frame appended, or one cursor advance).
  /// Returns (finished, stalled): finished = the video input was marked finished;
  /// stalled = temporarily out of pool buffers, retry on the next callback.
  private func stepVideo(group: DispatchGroup) -> (Bool, Bool) {
    guard itemCursor < timeline.count else {
      pendingSample = nil
      finishVideo(group: group)
      return (true, false)
    }

    switch timeline[itemCursor] {
    case .black(let item):
      guard blackFramesEmitted < item.frameCount else {
        itemCursor += 1
        blackFramesEmitted = 0
        return (false, false)
      }
      guard let buffer = makePoolBuffer() else {
        return (false, true)
      }
      let frameImage = item.overlay.map { $0.composited(over: blackImage) } ?? blackImage
      ciContext.render(frameImage, to: buffer, bounds: renderBounds, colorSpace: renderColorSpace)
      let pts = item.outputRange.start
        + CMTimeMultiply(config.frameDuration, multiplier: Int32(blackFramesEmitted))
      pixelBufferAdaptor.append(buffer, withPresentationTime: pts)
      blackFramesEmitted += 1
      countFrame()
      onProgress?((pts + config.frameDuration).seconds)
      return (false, false)

    case .video(let item):
      let sample: CMSampleBuffer?
      if let pendingSample {
        sample = pendingSample
      } else if readerVideoDone {
        sample = nil
      } else {
        sample = videoOutput?.copyNextSampleBuffer()
      }
      guard let sample else {
        // Reader exhausted: this (and any later) video item has no more frames
        readerVideoDone = true
        pendingSample = nil
        itemCursor += 1
        return (false, false)
      }

      let pts = CMSampleBufferGetPresentationTimeStamp(sample)
      if CMTimeCompare(pts, item.compositionRange.end) >= 0 {
        // Belongs to a later timeline item — flush intervening beats first
        pendingSample = sample
        itemCursor += 1
        return (false, false)
      }
      pendingSample = nil
      countFrame()

      let offset = item.outputStart - item.compositionRange.start
      let mappedPTS = pts + offset

      if let overlay = item.overlay,
         let outputBuffer = makePoolBuffer(),
         let sourceBuffer = CMSampleBufferGetImageBuffer(sample) {
        let composited = overlay.composited(over: CIImage(cvPixelBuffer: sourceBuffer))
        ciContext.render(composited, to: outputBuffer, bounds: renderBounds, colorSpace: renderColorSpace)
        pixelBufferAdaptor.append(outputBuffer, withPresentationTime: mappedPTS)
      } else if offset == .zero {
        // Identity mapping, no overlay (or the pixel pool is exhausted, in which
        // case passing the frame through un-overlaid beats dropping it)
        videoInput.append(sample)
      } else if let sourceBuffer = CMSampleBufferGetImageBuffer(sample) {
        // Retimed passthrough: append the reader's own pixel buffer at the mapped time
        pixelBufferAdaptor.append(sourceBuffer, withPresentationTime: mappedPTS)
      }
      onProgress?((mappedPTS + config.frameDuration).seconds)
      return (false, false)
    }
  }

  private func finishVideo(group: DispatchGroup) {
    videoInput.markAsFinished()
    group.leave()
  }

  private func countFrame() {
    frameCount += 1
    if frameCount % 60 == 0 {
      memory.sample()
    }
  }

  private func makePoolBuffer() -> CVPixelBuffer? {
    guard let pool = pixelBufferAdaptor.pixelBufferPool else { return nil }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    return buffer
  }

  // MARK: - Audio pumps

  private func pumpAudio(group: DispatchGroup) {
    guard let audioInput, let audioOutput else { return }
    let queue = DispatchQueue(label: "expo.montage.audio")
    audioInput.requestMediaDataWhenReady(on: queue) { [self] in
      while audioInput.isReadyForMoreMediaData {
        if isCancelled() {
          wasCancelled = true
          audioInput.markAsFinished()
          group.leave()
          return
        }
        let finished = autoreleasepool { () -> Bool in
          guard reader?.status == .reading, let sample = audioOutput.copyNextSampleBuffer() else {
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

  private func pumpSilence(group: DispatchGroup) {
    guard let audioInput, let silenceFormat else {
      audioInput?.markAsFinished()
      group.leave()
      return
    }
    let queue = DispatchQueue(label: "expo.montage.audio")
    audioInput.requestMediaDataWhenReady(on: queue) { [self] in
      while audioInput.isReadyForMoreMediaData {
        if isCancelled() {
          wasCancelled = true
          audioInput.markAsFinished()
          group.leave()
          return
        }
        guard silenceFramesEmitted < silenceTotalFrames else {
          audioInput.markAsFinished()
          group.leave()
          return
        }
        let frames = min(24_000, silenceTotalFrames - silenceFramesEmitted)
        guard let buffer = Self.makeSilenceBuffer(
          startFrame: silenceFramesEmitted,
          frameCount: frames,
          format: silenceFormat,
          clicks: silenceClicks
        ) else {
          audioInput.markAsFinished()
          group.leave()
          return
        }
        audioInput.append(buffer)
        silenceFramesEmitted += frames
      }
    }
  }

  // MARK: - Silence synthesis (LPCM 44.1 kHz stereo int16, zero-filled + spliced clicks)

  private static func makeSilenceFormatDescription() -> CMAudioFormatDescription? {
    var asbd = AudioStreamBasicDescription(
      mSampleRate: 44_100,
      mFormatID: kAudioFormatLinearPCM,
      mFormatFlags: kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked,
      mBytesPerPacket: 4,
      mFramesPerPacket: 1,
      mBytesPerFrame: 4,
      mChannelsPerFrame: 2,
      mBitsPerChannel: 16,
      mReserved: 0
    )
    var format: CMAudioFormatDescription?
    let status = CMAudioFormatDescriptionCreate(
      allocator: kCFAllocatorDefault,
      asbd: &asbd,
      layoutSize: 0,
      layout: nil,
      magicCookieSize: 0,
      magicCookie: nil,
      extensions: nil,
      formatDescriptionOut: &format
    )
    return status == noErr ? format : nil
  }

  private static func makeSilenceBuffer(
    startFrame: Int,
    frameCount: Int,
    format: CMAudioFormatDescription,
    clicks: SilenceClicks? = nil
  ) -> CMSampleBuffer? {
    let dataLength = frameCount * 4
    var blockBuffer: CMBlockBuffer?
    guard CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault,
      memoryBlock: nil,
      blockLength: dataLength,
      blockAllocator: nil,
      customBlockSource: nil,
      offsetToData: 0,
      dataLength: dataLength,
      flags: 0,
      blockBufferOut: &blockBuffer
    ) == kCMBlockBufferNoErr, let blockBuffer else { return nil }
    guard CMBlockBufferFillDataBytes(
      with: 0,
      blockBuffer: blockBuffer,
      offsetIntoDestination: 0,
      dataLength: dataLength
    ) == kCMBlockBufferNoErr else { return nil }

    // Splice the click PCM over the zero-filled span wherever a click overlaps
    // this buffer's frame window [startFrame, startFrame + frameCount)
    if let clicks {
      let bufferEnd = startFrame + frameCount
      for position in clicks.positions {
        let overlapStart = max(position, startFrame)
        let overlapEnd = min(position + clicks.pcm.frameCount, bufferEnd)
        guard overlapEnd > overlapStart else { continue }
        let copied = clicks.pcm.data.withUnsafeBytes { source -> Bool in
          guard let base = source.baseAddress else { return false }
          return CMBlockBufferReplaceDataBytes(
            with: base + (overlapStart - position) * 4,
            blockBuffer: blockBuffer,
            offsetIntoDestination: (overlapStart - startFrame) * 4,
            dataLength: (overlapEnd - overlapStart) * 4
          ) == kCMBlockBufferNoErr
        }
        guard copied else { return nil }
      }
    }

    var sample: CMSampleBuffer?
    guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(
      allocator: kCFAllocatorDefault,
      dataBuffer: blockBuffer,
      formatDescription: format,
      sampleCount: frameCount,
      presentationTimeStamp: CMTime(value: CMTimeValue(startFrame), timescale: 44_100),
      packetDescriptions: nil,
      sampleBufferOut: &sample
    ) == noErr else { return nil }
    return sample
  }
}
