import { SelectVideoMetadata } from "../db/schema";
import { Period } from "../features/CameraRoll/hooks/usePeriod";
import { DayShiftTime } from "../features/Options/sections/DayShiftSection";
import { getDaysBetween } from "../utils/getDaysBetween";
import { getEffectiveDate } from "./dayShift";

// JS side of the export pipeline (doc/export-spec.md §8).
// Phase 2 scope: timeline/day grouping and the size/duration math backing the export screen.
// Phase 3 adds the MontageClip[] build + exportMontage call on top of these.

export const OPENING_CARD_DURATION_MS = 2000; // §6.1 — always on, no toggle

export const AUDIO_BITRATE = 256_000; // AAC stereo, §4.2

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
