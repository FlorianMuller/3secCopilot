import AVFoundation
import CoreImage
import UIKit

// MARK: - Overlay style & content (§7)

/// Font sizes in *pixels at renderSize* (JS computes them for the chosen render
/// target, §7). Values ≤ 0 fall back to proportional defaults so the module keeps
/// rendering sensibly if a caller omits the overlay settings.
struct OverlayStyle {
  let cardFontSize: CGFloat
  let dateFontSize: CGFloat
  let hourFontSize: CGFloat
  let titleFontSize: CGFloat
  let descriptionFontSize: CGFloat

  init(
    cardFontSize: Double,
    dateFontSize: Double,
    hourFontSize: Double,
    titleFontSize: Double,
    descriptionFontSize: Double,
    renderHeight: CGFloat
  ) {
    func resolve(_ value: Double, fallbackRatio: CGFloat) -> CGFloat {
      value > 0 ? CGFloat(value) : renderHeight * fallbackRatio
    }
    self.cardFontSize = resolve(cardFontSize, fallbackRatio: 0.10)
    self.dateFontSize = resolve(dateFontSize, fallbackRatio: 0.032)
    self.hourFontSize = resolve(hourFontSize, fallbackRatio: 0.024)
    self.titleFontSize = resolve(titleFontSize, fallbackRatio: 0.032)
    self.descriptionFontSize = resolve(descriptionFontSize, fallbackRatio: 0.026)
  }
}

/// Structured overlay text for one clip or missing-day beat, pre-formatted in JS
/// (luxon, device locale — §7/§8). Split into parts so the hour renders in a
/// smaller, de-emphasized font within the first line (§7 "Overlay format").
struct ClipOverlayContent {
  let dateText: String?
  let hourText: String?
  let titleText: String?
  let descriptionText: String?

  var isEmpty: Bool {
    [dateText, hourText, titleText, descriptionText]
      .compactMap { $0 }
      .allSatisfy { $0.isEmpty }
  }
}

// MARK: - Overlay rendering (CoreImage, §5.3)

/// Renders overlay text blocks into CIImages, one per segment, cached by the
/// timeline and composited per frame in the encode loop. Text is drawn with
/// UIGraphicsImageRenderer (thread-safe) — full control over mixed font sizes,
/// baseline alignment and the rounded scrim, unlike CIAttributedTextImageGenerator.
enum MontageOverlayRenderer {
  private static let textColor = UIColor.white
  private static let dimmedAlpha: CGFloat = 0.72
  private static let descriptionAlpha: CGFloat = 0.85
  private static let scrimColor = UIColor(white: 0, alpha: 0.35)

  /// Bottom-left clip/missing-day overlay over a subtle rounded scrim:
  ///   <date> <hour> - <title>     (hour smaller & de-emphasized)
  ///   <description>               (only if present)
  /// Positioned in CoreImage coordinates (origin bottom-left), ready to be
  /// `composited(over:)` a full render-size frame.
  static func clipOverlay(content: ClipOverlayContent, style: OverlayStyle, renderSize: CGSize) -> CIImage? {
    var lines: [NSAttributedString] = []

    let firstLine = NSMutableAttributedString()
    if let date = content.dateText, !date.isEmpty {
      firstLine.append(attributed(date, size: style.dateFontSize, weight: .semibold))
    }
    if let hour = content.hourText, !hour.isEmpty {
      if firstLine.length > 0 {
        firstLine.append(attributed(" ", size: style.hourFontSize, weight: .regular))
      }
      firstLine.append(attributed(hour, size: style.hourFontSize, weight: .regular, alpha: dimmedAlpha))
    }
    if let title = content.titleText, !title.isEmpty {
      if firstLine.length > 0 {
        firstLine.append(attributed(" - ", size: style.titleFontSize, weight: .regular, alpha: dimmedAlpha))
      }
      firstLine.append(attributed(title, size: style.titleFontSize, weight: .regular))
    }
    if firstLine.length > 0 {
      lines.append(firstLine)
    }
    if let description = content.descriptionText, !description.isEmpty {
      lines.append(
        attributed(description, size: style.descriptionFontSize, weight: .regular, alpha: descriptionAlpha)
      )
    }
    guard !lines.isEmpty else { return nil }

    let margin = renderSize.height * 0.05
    let padding = style.dateFontSize * 0.45
    let lineSpacing = style.dateFontSize * 0.25
    let maxTextWidth = renderSize.width - 2 * margin - 2 * padding

    let lineSizes = lines.map { line -> CGSize in
      let natural = line.size()
      return CGSize(width: min(ceil(natural.width), maxTextWidth), height: ceil(natural.height))
    }
    let textWidth = lineSizes.map(\.width).max() ?? 0
    let textHeight = lineSizes.map(\.height).reduce(0, +) + CGFloat(max(lines.count - 1, 0)) * lineSpacing
    let blockSize = CGSize(width: textWidth + 2 * padding, height: textHeight + 2 * padding)

    let image = drawImage(size: blockSize) { _ in
      scrimColor.setFill()
      UIBezierPath(roundedRect: CGRect(origin: .zero, size: blockSize), cornerRadius: padding * 0.5).fill()
      var y = padding
      for (line, size) in zip(lines, lineSizes) {
        truncated(line).draw(in: CGRect(x: padding, y: y, width: size.width, height: size.height))
        y += size.height + lineSpacing
      }
    }
    guard let cgImage = image.cgImage else { return nil }
    // UIKit draws top-down, CIImage(cgImage:) preserves the visual orientation;
    // CI coordinates are bottom-left-origin, so this lands the block bottom-left.
    return CIImage(cgImage: cgImage).transformed(by: CGAffineTransform(translationX: margin, y: margin))
  }

  /// Opening title card (§6.1): centered lines over black, cardFontSize, no scrim.
  static func cardOverlay(lines: [String], style: OverlayStyle, renderSize: CGSize) -> CIImage? {
    let text = lines.joined(separator: "\n")
    guard !text.isEmpty else { return nil }

    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineSpacing = style.cardFontSize * 0.2
    let attributed = NSAttributedString(
      string: text,
      attributes: [
        .font: UIFont.systemFont(ofSize: style.cardFontSize, weight: .semibold),
        .foregroundColor: textColor,
        .paragraphStyle: paragraph,
      ]
    )
    let bounds = attributed.boundingRect(
      with: CGSize(width: renderSize.width * 0.9, height: renderSize.height),
      options: [.usesLineFragmentOrigin],
      context: nil
    )
    let blockSize = CGSize(width: ceil(bounds.width), height: ceil(bounds.height))

    let image = drawImage(size: blockSize) { _ in
      attributed.draw(with: CGRect(origin: .zero, size: blockSize), options: [.usesLineFragmentOrigin], context: nil)
    }
    guard let cgImage = image.cgImage else { return nil }
    return CIImage(cgImage: cgImage).transformed(
      by: CGAffineTransform(
        translationX: ((renderSize.width - blockSize.width) / 2).rounded(),
        y: ((renderSize.height - blockSize.height) / 2).rounded()
      )
    )
  }

  private static func attributed(
    _ text: String,
    size: CGFloat,
    weight: UIFont.Weight,
    alpha: CGFloat = 1
  ) -> NSAttributedString {
    NSAttributedString(
      string: text,
      attributes: [
        .font: UIFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: textColor.withAlphaComponent(alpha),
      ]
    )
  }

  /// Single-line rendering with tail truncation when the text is wider than the block
  private static func truncated(_ line: NSAttributedString) -> NSAttributedString {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineBreakMode = .byTruncatingTail
    let result = NSMutableAttributedString(attributedString: line)
    result.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: result.length))
    return result
  }

  private static func drawImage(size: CGSize, drawing: (CGContext) -> Void) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1 // font sizes are pixels at renderSize, not screen points
    format.opaque = false
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      drawing(context.cgContext)
    }
  }
}

// MARK: - Missing-day click sound (§6.2, bundled resource)

/// Interleaved stereo int16 PCM at 44.1 kHz — matches the silence pump's format so
/// clicks can be spliced straight into synthesized-silence chunks.
struct ClickPCM {
  let data: Data
  let frameCount: Int
}

private final class MontageBundleFinder {}

enum MontageClickSound {
  /// The bundled click file (ios/resources/click.caf, packaged via the podspec's
  /// resource_bundles as ExpoMontage.bundle). Nil if the resource is missing —
  /// callers degrade to silent beats with a warning rather than failing the export.
  static func locate() -> URL? {
    for bundle in [Bundle(for: MontageBundleFinder.self), Bundle.main] {
      if let bundleURL = bundle.url(forResource: "ExpoMontage", withExtension: "bundle"),
         let resourceBundle = Bundle(url: bundleURL),
         let url = resourceBundle.url(forResource: "click", withExtension: "caf") {
        return url
      }
      if let url = bundle.url(forResource: "click", withExtension: "caf") {
        return url
      }
    }
    return nil
  }

  /// Decodes the click into the silence pump's PCM layout. The bundled file is
  /// authored as 44.1 kHz stereo int16, so this is a straight read, no conversion.
  static func decodePCM(url: URL) throws -> ClickPCM {
    let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatInt16, interleaved: true)
    let format = file.processingFormat
    guard format.sampleRate == 44_100, format.channelCount == 2 else {
      throw MontageError.writerFailed(
        "click.caf must be 44.1 kHz stereo (got \(format.sampleRate) Hz, \(format.channelCount) ch)"
      )
    }
    let frameCount = AVAudioFrameCount(file.length)
    guard frameCount > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
      throw MontageError.writerFailed("click.caf is empty or unreadable")
    }
    try file.read(into: buffer)
    let audioBuffer = buffer.audioBufferList.pointee.mBuffers
    guard let source = audioBuffer.mData else {
      throw MontageError.writerFailed("click.caf decode produced no data")
    }
    let byteCount = Int(buffer.frameLength) * 4 // 2 ch × int16
    return ClickPCM(data: Data(bytes: source, count: byteCount), frameCount: Int(buffer.frameLength))
  }
}
