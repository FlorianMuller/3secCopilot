export type SpikeClip = {
  /** PHAsset localIdentifier (= videoId in videos_metadata) */
  assetId: string;
  /** Trim start in milliseconds; null/undefined = from 0 */
  startMs?: number | null;
  /** Trim end in milliseconds; null/undefined = to end */
  endMs?: number | null;
  /** Pre-formatted overlay text rendered bottom-left; null/undefined = no overlay */
  overlayText?: string | null;
};

export type SpikeOptions = {
  width: number;
  height: number;
  fps: number;
  /** H.264 average bitrate in bits per second */
  videoBitrate: number;
};

export type SpikeResult = {
  /** file:// URL of the encoded mp4 (in the temporary directory) */
  outputPath: string;
  /** Duration of the montage in milliseconds */
  durationMs: number;
  fileSizeBytes: number;
  /** Wall-clock time of composition + encode in milliseconds */
  encodeMs: number;
  /** Peak app memory footprint observed during the encode, in MB */
  peakMemoryMB: number;
  /** Non-fatal issues encountered (e.g. audio-less clips) */
  warnings: string[];
};

// ----------------------------------------------------------------------------------------------------
// exportMontage API (doc/export-spec.md §7)

/**
 * One clip's metadata from analyzeClips (§4.1) — resolution & frame rate, used to
 * compute the quality picker's combos and the default (mode) render target.
 */
export type ClipAnalysis = {
  /** PHAsset localIdentifier (= videoId in videos_metadata) */
  assetId: string;
  /** Display width in pixels (rotation metadata applied) */
  width: number;
  /** Display height in pixels (rotation metadata applied) */
  height: number;
  /** Nominal frame rate of the video track */
  fps: number;
};

/**
 * Structured overlay text for a clip or missing-day beat (§7 "Overlay format"),
 * pre-formatted in JS with luxon in the device locale. Parts are split (instead of
 * one pre-joined line) so the native renderer can de-emphasize the hour in a
 * smaller font within the first line:
 *   <dateText> <hourText> - <titleText>
 *   <descriptionText>
 */
export type ClipOverlay = {
  /** e.g. "Lundi 4 juin" — dateFontSize, semibold */
  dateText?: string;
  /** e.g. "12:39" — hourFontSize, smaller & de-emphasized */
  hourText?: string;
  /** titleFontSize; joined to the first line with " - " */
  titleText?: string;
  /** Second line, descriptionFontSize — only rendered if present */
  descriptionText?: string;
};

export type MontageClip =
  | {
      type: "video";
      /** PHAsset localIdentifier (= videoId in videos_metadata) */
      assetId: string;
      /** Trim start in milliseconds; null/undefined = from 0 (clamping: §8.4, defensive native-side too) */
      startMs?: number | null;
      /** Trim end in milliseconds; null/undefined = to end */
      endMs?: number | null;
      /** Bottom-left overlay over a subtle scrim; omit for no overlay */
      overlay?: ClipOverlay;
    }
  | {
      type: "missingDay"; // ONE beat per missing day — never grouped (§6.2)
      /** Beat length, from the exportMissingDayDurationMs preference */
      durationMs: number;
      /** Date-only overlay (dateText), only when the date overlay is enabled */
      overlay?: ClipOverlay;
    }
  | {
      type: "card"; // opening title card (§6.1) — black + centered text, no click
      durationMs: number;
      /** Centered card lines, cardFontSize (e.g. ["2026"]) */
      overlayLines: string[];
    };

export type MontageSettings = {
  /** Orientation + chosen resolution combo (§4.1) */
  renderSize: { width: number; height: number };
  fps: number;
  /** bps, from the JS bitrate table (§4.2) */
  videoAverageBitrate: number;
  /** bps */
  audioBitrate: number;
  /** Play the bundled click on missingDay beats (§6.2); the card never clicks */
  missingDayClick: boolean;
  /**
   * "preview" = fast/low-res draft (§9.4). The shortcuts themselves (small
   * renderSize, capped fps, draft bitrate, proportional overlay px) are chosen in
   * JS and arrive through the other settings — the native pipeline is identical.
   */
  mode: "preview" | "full";
  /** Overlay font sizes in *pixels at renderSize* (§7); missing/zero values fall
   * back to proportional native defaults */
  overlay?: {
    position: "bottomLeft";
    cardFontSize: number;
    dateFontSize: number;
    hourFontSize: number;
    titleFontSize: number;
    descriptionFontSize: number;
  };
  /** file:// URL under documentDirectory/exports/ — the parent directory is created natively */
  outputPath: string;
};

export type ExportPhase = "download" | "chunk" | "assemble";

export type ExportProgressEvent = {
  taskId: string;
  /** 0–1, monotonic, phase- and chunk-weighted */
  progress: number;
  phase: ExportPhase;
};

export type ExportCompleteEvent = {
  taskId: string;
  /** file:// URL of the finished mp4 (the requested outputPath) */
  outputPath: string;
  durationMs: number;
  fileSizeBytes: number;
  /** Peak app memory footprint observed during the export, in MB */
  peakMemoryMB: number;
  /** Non-fatal issues (Live Photos, silent clips, assets degraded to black beats...) */
  warnings: string[];
};

export type ExportErrorEvent = {
  taskId: string;
  /** "cancelled" when the export was cancelled via cancelExport */
  message: string;
  failedAssetId?: string;
};

export type ExpoMontageModuleEvents = {
  onExportProgress: (event: ExportProgressEvent) => void;
  onExportComplete: (event: ExportCompleteEvent) => void;
  onExportError: (event: ExportErrorEvent) => void;
};
