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
