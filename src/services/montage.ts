import * as FileSystem from "expo-file-system";
import { DateTime } from "luxon";
import {
  ClipAnalysis,
  ClipOverlay,
  ExportCompleteEvent,
  ExportErrorEvent,
  ExportProgressEvent,
  MontageClip,
  MontageSettings,
} from "../../modules/expo-montage/src/ExpoMontage.types";
import ExpoMontage from "../../modules/expo-montage/src/ExpoMontageModule";
import { SelectVideoMetadata } from "../db/schema";
import { Period } from "../features/CameraRoll/hooks/usePeriod";
import { DayShiftTime } from "../features/Options/sections/DayShiftSection";
import { capitalize } from "../utils/capitalize";
import { getDaysBetween } from "../utils/getDaysBetween";
import { getEffectiveDate } from "./dayShift";
import { AppLanguage, ExportOrientation } from "./preferences";

// JS side of the export pipeline (doc/export-spec.md §8).
// Phase 2: timeline/day grouping and the size/duration math backing the export screen.
// Phase 3: MontageClip[] build + the exportMontage orchestration.
// Phase 4: overlay strings (luxon, device locale) + overlay/click settings.
// Phase 5: quality combos (analyzeClips, §4.1) + the preview render (§9.4).

export const OPENING_CARD_DURATION_MS = 2000; // §6.1 — always on, no toggle

export const AUDIO_BITRATE = 256_000; // AAC stereo, §4.2

// The native side reports a cancelled export as onExportError with this message
export const EXPORT_CANCELLED_MESSAGE = "cancelled";

// Premiere-class bitrate table (§4.2). Owned by JS so the size estimate and the
// native encoder settings always agree. Portrait uses its landscape twin's value.
const VIDEO_BITRATE_TABLE: { longEdge: number; upTo30Fps: number; at60Fps: number }[] = [
  { longEdge: 1280, upTo30Fps: 8_000_000, at60Fps: 12_000_000 },
  { longEdge: 1920, upTo30Fps: 16_000_000, at60Fps: 24_000_000 },
  { longEdge: 3840, upTo30Fps: 45_000_000, at60Fps: 68_000_000 },
];

export function getVideoBitrate(renderSize: { width: number; height: number }, fps: number): number {
  const longEdge = Math.max(renderSize.width, renderSize.height);
  const row =
    VIDEO_BITRATE_TABLE.find((r) => longEdge <= r.longEdge) ?? VIDEO_BITRATE_TABLE[VIDEO_BITRATE_TABLE.length - 1];
  return fps > 30 ? row.at60Fps : row.upTo30Fps;
}

// ----------------------------------------------------------------------------------------------------
// Render-target quality (§4.1) — derived fresh from analyzeClips each time the export
// screen opens; the user's pick is a session-local override, never persisted.

export interface QualityCombo {
  /** Picker label and identity, e.g. "1080p30" */
  label: string;
  /** Landscape long edge of the resolution tier (1280 | 1920 | 3840) */
  longEdge: number;
  /** Render frame rate (30 | 60) */
  fps: number;
  /** How many analyzed clips fall in this combo */
  clipCount: number;
}

const QUALITY_TIERS = [
  { longEdge: 1280, shortEdge: 720, name: "720p" },
  { longEdge: 1920, shortEdge: 1080, name: "1080p" },
  { longEdge: 3840, shortEdge: 2160, name: "4K" },
] as const;

// Fallback when nothing resolves (empty period, every asset offloaded/deleted)
export const DEFAULT_QUALITY: QualityCombo = { label: "1080p30", longEdge: 1920, fps: 30, clipCount: 0 };

function qualityTierFor(longEdge: number) {
  return QUALITY_TIERS.find((tier) => longEdge <= tier.longEdge) ?? QUALITY_TIERS[QUALITY_TIERS.length - 1];
}

// Distinct resolution/fps combos present in the analyzed clips (§4.1). Each clip is
// bucketed by its display long edge into a resolution tier (portrait/landscape twins
// are the same combo — the render orientation comes from the exportOrientation pref)
// and into 30/60 fps (24/25 render as 30; 50+ and slow-mo 120/240 as 60). The default
// is the MODE (most common) combo — deliberately not the max, so a single 4K outlier
// doesn't drag the whole export's size/time up. Ties resolve to the lighter combo.
export function computeQualityCombos(analyses: ClipAnalysis[]): {
  combos: QualityCombo[];
  defaultCombo: QualityCombo;
} {
  const byLabel = new Map<string, QualityCombo>();
  for (const analysis of analyses) {
    const tier = qualityTierFor(Math.max(analysis.width, analysis.height));
    const fps = analysis.fps >= 45 ? 60 : 30;
    const label = `${tier.name}${fps}`;
    const combo = byLabel.get(label);
    if (combo !== undefined) {
      combo.clipCount += 1;
    } else {
      byLabel.set(label, { label, longEdge: tier.longEdge, fps, clipCount: 1 });
    }
  }
  if (byLabel.size === 0) {
    return { combos: [DEFAULT_QUALITY], defaultCombo: DEFAULT_QUALITY };
  }
  const combos = [...byLabel.values()].sort((a, b) => a.longEdge - b.longEdge || a.fps - b.fps);
  const defaultCombo = combos.reduce((best, combo) => (combo.clipCount > best.clipCount ? combo : best));
  return { combos, defaultCombo };
}

// §4.2: (videoBitrate + audioBitrate) × totalDuration
export function estimateFileSizeBytes(
  durationMs: number,
  renderSize: { width: number; height: number },
  fps: number
): number {
  return ((getVideoBitrate(renderSize, fps) + AUDIO_BITRATE) / 8) * (durationMs / 1000);
}

// ----------------------------------------------------------------------------------------------------
// Day timeline of a period

export interface PeriodClips {
  // Period days in ascending chronological order, only up to today (the period's
  // startDate is already capped at today for the in-progress period)
  days: Date[];
  // One clip per filled day, keyed by `Date.toDateString()`
  clipByDay: Map<string, SelectVideoMetadata>;
  // Days without a selected clip, ascending
  missingDays: Date[];
  totalDays: number;
  filledDaysCount: number;
  // Σ (trimEnd - trimStart) over clips that have a trim
  trimmedDurationMs: number;
  // Clips whose full duration will be used (no trim stored) — durations must be
  // fetched from the media library to complete the total duration
  untrimmedClips: SelectVideoMetadata[];
  // Chronologically first clip of the period (thumbnail source), null if none
  firstClipId: string | null;
}

export function hasTrim(metadata: SelectVideoMetadata): boolean {
  return (
    metadata.trimStartTime !== null && metadata.trimEndTime !== null && metadata.trimEndTime > metadata.trimStartTime
  );
}

export function trimDurationMs(metadata: SelectVideoMetadata): number {
  return hasTrim(metadata) ? metadata.trimEndTime! - metadata.trimStartTime! : 0;
}

// Group selected-video metadata into a period's day timeline. `metadataList` may cover
// more than the period (e.g. one query shared by all PeriodList rows) — membership is
// decided here via the effective (day-shifted) date.
export function groupClipsForPeriod(
  period: Period,
  metadataList: SelectVideoMetadata[],
  dayShift: DayShiftTime
): PeriodClips {
  // getDaysBetween walks from startDate (later bound) backwards — reverse to ascending
  const days = getDaysBetween(period.startDate, period.endDate).reverse();
  const periodDaySet = new Set(days.map((d) => d.toDateString()));

  const clipByDay = new Map<string, SelectVideoMetadata>();
  for (const metadata of metadataList) {
    const dayKey = getEffectiveDate(metadata.assignedToDate ?? metadata.videoOriginalDate, dayShift).toDateString();
    if (periodDaySet.has(dayKey) && !clipByDay.has(dayKey)) {
      clipByDay.set(dayKey, metadata);
    }
  }

  const missingDays = days.filter((d) => !clipByDay.has(d.toDateString()));

  let trimmedDurationMs = 0;
  const untrimmedClips: SelectVideoMetadata[] = [];
  let firstClipId: string | null = null;
  for (const day of days) {
    const clip = clipByDay.get(day.toDateString());
    if (!clip) {
      continue;
    }
    firstClipId = firstClipId ?? clip.videoId;
    if (hasTrim(clip)) {
      trimmedDurationMs += trimDurationMs(clip);
    } else {
      untrimmedClips.push(clip);
    }
  }

  return {
    days,
    clipByDay,
    missingDays,
    totalDays: days.length,
    filledDaysCount: clipByDay.size,
    trimmedDurationMs,
    untrimmedClips,
    firstClipId,
  };
}

// Dev debug (doc/export-device-checklist.md L91): restrict a period's day timeline to
// an inclusive [fromDate, toDate] calendar-day window, recomputing the derived totals,
// so a small slice (e.g. late-January around a missing-day batch) can be exported fast
// to reproduce an A/V-sync issue instead of rendering a whole 6-month period.
export function slicePeriodClips(periodClips: PeriodClips, fromDate: Date, toDate: Date): PeriodClips {
  const fromMs = new Date(fromDate).setHours(0, 0, 0, 0);
  const toMs = new Date(toDate).setHours(23, 59, 59, 999);
  const days = periodClips.days.filter((day) => {
    const t = day.getTime();
    return t >= fromMs && t <= toMs;
  });

  const clipByDay = new Map<string, SelectVideoMetadata>();
  const missingDays: Date[] = [];
  let trimmedDurationMs = 0;
  const untrimmedClips: SelectVideoMetadata[] = [];
  let firstClipId: string | null = null;
  for (const day of days) {
    const clip = periodClips.clipByDay.get(day.toDateString());
    if (clip === undefined) {
      missingDays.push(day);
      continue;
    }
    clipByDay.set(day.toDateString(), clip);
    firstClipId = firstClipId ?? clip.videoId;
    if (hasTrim(clip)) {
      trimmedDurationMs += trimDurationMs(clip);
    } else {
      untrimmedClips.push(clip);
    }
  }

  return {
    days,
    clipByDay,
    missingDays,
    totalDays: days.length,
    filledDaysCount: clipByDay.size,
    trimmedDurationMs,
    untrimmedClips,
    firstClipId,
  };
}

// ----------------------------------------------------------------------------------------------------
// MontageClip[] build (§8 step 5) + overlay strings (§7 "Overlay format")

export interface BuildMontageClipsOptions {
  // Period label for the opening title card, e.g. "2025"
  periodLabel: string;
  showMissingDays: boolean;
  missingDayDurationMs: number;
  // Overlay toggles (§9.3): date/hour and title share the first line, description
  // (tied to the title toggle) has its own fixed slot below (§7 "Overlay format")
  showDate: boolean;
  showHour: boolean;
  showTitle: boolean;
  // Date/hour wording follows the appLanguage preference (not the device locale)
  language: AppLanguage;
}

// "Lundi 4 juin" — luxon in the preferred app language (§7), capitalized for
// locales with lowercase weekdays
function formatOverlayDate(day: Date, language: AppLanguage): string {
  return capitalize(
    DateTime.fromJSDate(day).setLocale(language).toLocaleString({ weekday: "long", day: "numeric", month: "long" })
  );
}

// Bottom-left overlay parts for one filled day. The date is the *effective* (possibly
// day-shifted) timeline day; the hour is the clip's original creation time — always
// present in videos_metadata. Returns undefined when every toggle is off.
function buildClipOverlay(
  metadata: SelectVideoMetadata,
  day: Date,
  options: BuildMontageClipsOptions
): ClipOverlay | undefined {
  const overlay: ClipOverlay = {};
  if (options.showDate) {
    overlay.dateText = formatOverlayDate(day, options.language);
  }
  if (options.showHour) {
    overlay.hourText = DateTime.fromJSDate(metadata.videoOriginalDate)
      .setLocale(options.language)
      .toLocaleString(DateTime.TIME_SIMPLE);
  }
  if (options.showTitle && metadata.title) {
    overlay.titleText = metadata.title;
  }
  if (options.showTitle && metadata.description) {
    overlay.descriptionText = metadata.description;
  }
  return Object.keys(overlay).length > 0 ? overlay : undefined;
}

// One filled day's video entry (raw trim values — the native side clamps defensively
// against the real asset duration, §8.4)
function buildVideoClip(metadata: SelectVideoMetadata, day: Date, options: BuildMontageClipsOptions): MontageClip {
  const trim = hasTrim(metadata)
    ? { startMs: Math.max(0, metadata.trimStartTime!), endMs: metadata.trimEndTime }
    : { startMs: null, endMs: null }; // no/invalid trim = full clip (§8.4)
  return {
    type: "video",
    assetId: metadata.videoId,
    ...trim,
    overlay: buildClipOverlay(metadata, day, options),
  };
}

function buildMissingDayClip(day: Date, options: BuildMontageClipsOptions): MontageClip {
  return {
    type: "missingDay",
    durationMs: options.missingDayDurationMs,
    overlay: options.showDate ? { dateText: formatOverlayDate(day, options.language) } : undefined,
  };
}

// Opening card, then one entry per period day ascending: the day's selected clip or
// a missing-day beat (one per day, never grouped, §6.2; date overlay only, §6.2
// "Overlays").
export function buildMontageClips(periodClips: PeriodClips, options: BuildMontageClipsOptions): MontageClip[] {
  const clips: MontageClip[] = [
    { type: "card", durationMs: OPENING_CARD_DURATION_MS, overlayLines: [options.periodLabel] },
  ];

  for (const day of periodClips.days) {
    const metadata = periodClips.clipByDay.get(day.toDateString());
    if (metadata === undefined) {
      if (options.showMissingDays) {
        clips.push(buildMissingDayClip(day, options));
      }
      continue;
    }
    clips.push(buildVideoClip(metadata, day, options));
  }

  return clips;
}

// Preview clip list (§9.4): the opening card + the first PREVIEW_FILLED_DAYS filled
// days of the period + the missing-day beats falling *between* those days (a sparse
// period's leading gap and anything after the last included day are not part of the
// preview) — always real footage, the whole period when fewer days are filled.
export const PREVIEW_FILLED_DAYS = 20;

export function buildPreviewClips(periodClips: PeriodClips, options: BuildMontageClipsOptions): MontageClip[] {
  const clips: MontageClip[] = [
    { type: "card", durationMs: OPENING_CARD_DURATION_MS, overlayLines: [options.periodLabel] },
  ];

  let filledCount = 0;
  let pendingMissing: MontageClip[] = [];
  for (const day of periodClips.days) {
    const metadata = periodClips.clipByDay.get(day.toDateString());
    if (metadata === undefined) {
      if (options.showMissingDays && filledCount > 0) {
        pendingMissing.push(buildMissingDayClip(day, options));
      }
      continue;
    }
    clips.push(...pendingMissing, buildVideoClip(metadata, day, options));
    pendingMissing = [];
    filledCount += 1;
    if (filledCount >= PREVIEW_FILLED_DAYS) {
      break;
    }
  }

  return clips;
}

// ----------------------------------------------------------------------------------------------------
// Export orchestration (§8 step 7 / §9.5)

// Orientation (§9.3 pref) + chosen resolution tier (§4.1) → renderSize
export function getRenderSize(orientation: ExportOrientation, quality: QualityCombo): { width: number; height: number } {
  const tier = qualityTierFor(quality.longEdge);
  return orientation === "portrait"
    ? { width: tier.shortEdge, height: tier.longEdge }
    : { width: tier.longEdge, height: tier.shortEdge };
}

// Preview encoder shortcuts (§9.4/§11.4): the same pipeline and overlay path as the
// full export, but rendered on a 640×360 (16:9 — the aspect of every final tier, so
// aspect-fit framing is identical) canvas at a ~1.5 Mbps draft bitrate, fps capped at
// 30. Overlay font px come from getOverlaySettings at the preview renderSize, so text
// proportions match the final render exactly. Audio settings stay as-is.
const PREVIEW_LONG_EDGE = 640;
const PREVIEW_SHORT_EDGE = 360;
const PREVIEW_VIDEO_BITRATE = 1_500_000;

export function getPreviewRenderSize(orientation: ExportOrientation): { width: number; height: number } {
  return orientation === "portrait"
    ? { width: PREVIEW_SHORT_EDGE, height: PREVIEW_LONG_EDGE }
    : { width: PREVIEW_LONG_EDGE, height: PREVIEW_SHORT_EDGE };
}

// Overlay font sizes in pixels at renderSize (§7), proportional to the render height
// so the text keeps the same visual weight across resolutions/orientations. First
// draft (§7) — easy to nudge once the in-app preview lands.
function getOverlaySettings(renderSize: { width: number; height: number }): MontageSettings["overlay"] {
  const height = renderSize.height;
  return {
    position: "bottomLeft",
    cardFontSize: Math.round(height * 0.1),
    dateFontSize: Math.round(height * 0.032),
    hourFontSize: Math.round(height * 0.024),
    titleFontSize: Math.round(height * 0.032),
    descriptionFontSize: Math.round(height * 0.026),
  };
}

export interface MontageExportListeners {
  onProgress: (event: ExportProgressEvent) => void;
  // Terminal events — the handle's subscriptions are removed before these fire
  onComplete: (event: ExportCompleteEvent) => void;
  onError: (event: ExportErrorEvent) => void;
}

export interface MontageExportHandle {
  taskId: string;
  outputPath: string;
  cancel: () => Promise<void>;
  // Detach the listeners without stopping the export (e.g. screen unmount)
  removeListeners: () => void;
}

// Ensures documentDirectory/exports/ exists, derives the output path and settings
// (§4.2 bitrate table, orientation pref, chosen quality combo §4.1), starts the
// native export and wires the event subscriptions.
export async function startMontageExport(
  periodId: string,
  clips: MontageClip[],
  orientation: ExportOrientation,
  quality: QualityCombo,
  listeners: MontageExportListeners,
  // Dev only (doc/export-device-checklist.md L91): ask the native side to attach A/V
  // diagnostics to the complete event so the `.debug.jsonl` sidecar can be written.
  diagnostics = false
): Promise<MontageExportHandle> {
  const exportsDirectory = `${FileSystem.documentDirectory}exports/`;
  const directoryInfo = await FileSystem.getInfoAsync(exportsDirectory);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(exportsDirectory, { intermediates: true });
  }

  const outputPath = `${exportsDirectory}${periodId}-${Date.now()}.mp4`;
  const renderSize = getRenderSize(orientation, quality);
  return startExportTask(
    clips,
    {
      renderSize,
      fps: quality.fps,
      videoAverageBitrate: getVideoBitrate(renderSize, quality.fps),
      audioBitrate: AUDIO_BITRATE,
      // §6.2/§7: no dedicated preference (§9.3) — the click is on whenever missing-day
      // beats are part of the timeline (no beats in the clip list = no clicks anyway)
      missingDayClick: true,
      mode: "full",
      overlay: getOverlaySettings(renderSize),
      outputPath,
      diagnostics,
    },
    listeners
  );
}

// Preview render (§9.4): same pipeline in mode "preview" with the §11.4 shortcuts,
// output under cacheDirectory — a cache, wiped before each render (unlike real
// exports, which are never overwritten).
export async function startMontagePreview(
  clips: MontageClip[],
  orientation: ExportOrientation,
  quality: QualityCombo,
  listeners: MontageExportListeners
): Promise<MontageExportHandle> {
  const previewDirectory = `${FileSystem.cacheDirectory}exports-preview/`;
  await FileSystem.deleteAsync(previewDirectory, { idempotent: true });
  await FileSystem.makeDirectoryAsync(previewDirectory, { intermediates: true });

  // Timestamped name so a re-render is never served from a stale player/file cache
  const outputPath = `${previewDirectory}preview-${Date.now()}.mp4`;
  const renderSize = getPreviewRenderSize(orientation);
  return startExportTask(
    clips,
    {
      renderSize,
      fps: Math.min(quality.fps, 30),
      videoAverageBitrate: PREVIEW_VIDEO_BITRATE,
      audioBitrate: AUDIO_BITRATE,
      missingDayClick: true,
      mode: "preview",
      overlay: getOverlaySettings(renderSize),
      outputPath,
    },
    listeners
  );
}

// Starts the native task and wires the event subscriptions. Listeners are registered
// before the native call so no event can be missed; the native module runs a single
// export at a time (preview and full export share that slot).
async function startExportTask(
  clips: MontageClip[],
  settings: MontageSettings,
  listeners: MontageExportListeners
): Promise<MontageExportHandle> {
  const { outputPath } = settings;
  // taskId is only known once exportMontage resolves; events carry it from the very
  // first emission, so match once known (single export at a time natively).
  let taskId: string | undefined;
  const isCurrentTask = (event: { taskId: string }) => taskId === undefined || event.taskId === taskId;

  const subscriptions = [
    ExpoMontage.addListener("onExportProgress", (event) => {
      if (isCurrentTask(event)) {
        listeners.onProgress(event);
      }
    }),
    ExpoMontage.addListener("onExportComplete", (event) => {
      if (isCurrentTask(event)) {
        removeListeners();
        listeners.onComplete(event);
      }
    }),
    ExpoMontage.addListener("onExportError", (event) => {
      if (isCurrentTask(event)) {
        removeListeners();
        listeners.onError(event);
      }
    }),
  ];
  const removeListeners = () => subscriptions.forEach((subscription) => subscription.remove());

  try {
    ({ taskId } = await ExpoMontage.exportMontage(clips, settings));
  } catch (error) {
    removeListeners();
    throw error;
  }

  return {
    taskId,
    outputPath,
    cancel: () => ExpoMontage.cancelExport(taskId!),
    removeListeners,
  };
}

// Per-asset degradation warnings arrive from the native side as one line per clip —
// at year scale that can be dozens of near-identical lines. Group the known families
// into single human sentences for the done screen and keep unknown lines verbatim.
export function summarizeExportWarnings(warnings: string[]): string[] {
  const families = [
    {
      pattern: /replaced with a black beat/,
      summarize: (count: number) =>
        count === 1
          ? "1 clip couldn't be read and was rendered as a missing day"
          : `${count} clips couldn't be read and were rendered as missing days`,
    },
    {
      pattern: /has no audio track — inserted silence/,
      summarize: (count: number) =>
        count === 1 ? "1 clip has no sound of its own" : `${count} clips have no sound of their own`,
    },
    {
      pattern: /is a Live Photo — used its paired video/,
      summarize: (count: number) =>
        count === 1 ? "1 Live Photo — its video part was used" : `${count} Live Photos — their video parts were used`,
    },
  ].map((family) => ({ ...family, count: 0 }));

  const others: string[] = [];
  for (const warning of warnings) {
    const family = families.find((f) => f.pattern.test(warning));
    if (family !== undefined) {
      family.count += 1;
    } else {
      others.push(warning);
    }
  }
  return [...families.filter((f) => f.count > 0).map((f) => f.summarize(f.count)), ...others];
}

// Total montage duration (§9.2) — recomputed live as options change.
// `untrimmedDurationMs` is the fetched sum of full durations of untrimmed clips.
export function computeMontageDurationMs(
  clips: PeriodClips,
  untrimmedDurationMs: number,
  options: { showMissingDays: boolean; missingDayDurationMs: number }
): number {
  const missingBeatsMs = options.showMissingDays ? clips.missingDays.length * options.missingDayDurationMs : 0;
  return OPENING_CARD_DURATION_MS + clips.trimmedDurationMs + untrimmedDurationMs + missingBeatsMs;
}
