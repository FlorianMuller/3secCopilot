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

export type MontageClip =
  | {
      type: "video";
      /** PHAsset localIdentifier (= videoId in videos_metadata) */
      assetId: string;
      /** Trim start in milliseconds; null/undefined = from 0 (clamping: §8.4, defensive native-side too) */
      startMs?: number | null;
      /** Trim end in milliseconds; null/undefined = to end */
      endMs?: number | null;
      /** Pre-formatted overlay lines — accepted but ignored in phase 3 (rendered in phase 4) */
      overlayLines?: string[];
    }
  | {
      type: "missingDay"; // ONE beat per missing day — never grouped (§6.2)
      /** Beat length, from the exportMissingDayDurationMs preference */
      durationMs: number;
      overlayLines?: string[];
    }
  | {
      type: "card"; // opening title card (§6.1) — black + centered text, no click
      durationMs: number;
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
  /** Play the bundled click on missingDay beats — accepted but unused in phase 3 */
  missingDayClick: boolean;
  /** "preview" = fast/low-res internal draft — accepted; currently behaves like "full" */
  mode: "preview" | "full";
  /** Accepted but unused in phase 3 */
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
