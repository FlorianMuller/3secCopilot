import * as MediaLibrary from "expo-media-library";
import {
  changeVideoDate,
  markVideoAsSelected,
  markVideoAsUnselected,
  updateVideoTitleAndDescription,
  updateVideoTrimMetadata,
} from "./metadata";

const DAY_MS = 86_400_000;

// Dev-only (simulator testing): selects every video in the library and spreads them
// over recent days (one per day, with gaps) so the Export flow has realistic data —
// trims on most clips, titles/descriptions on some, day gaps to exercise missing-day
// beats. Callable from the Options dev section or the EXPO_PUBLIC_AUTOSEED hook.
export async function seedDemoData(): Promise<string> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Media library permission is required.");
  }

  const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: "video", first: 200 });
  if (assets.length === 0) {
    return "No videos in the library — add some first (simctl addmedia).";
  }

  let dayOffset = 0;
  for (const [index, asset] of assets.entries()) {
    const originalDate = new Date(asset.creationTime);
    // Every 3rd day is left empty to create missing-day beats
    if (dayOffset % 3 === 2) {
      dayOffset += 1;
    }
    const assignedDate = new Date(Date.now() - dayOffset * DAY_MS);
    assignedDate.setHours(12, 0, 0, 0);
    dayOffset += 1;

    await markVideoAsSelected(asset.id, originalDate);
    await changeVideoDate(asset.id, originalDate, assignedDate);

    // Trim 2 clips out of 3, leave the rest full-length (untrimmed warning path)
    if (index % 3 !== 2) {
      const durationMs = asset.duration * 1000;
      const endMs = Math.min(2500, Math.max(500, durationMs));
      await updateVideoTrimMetadata(asset.id, originalDate, 0, endMs);
    }

    if (index % 2 === 0) {
      await updateVideoTitleAndDescription(
        asset.id,
        originalDate,
        `Demo title ${index + 1}`,
        index % 4 === 0 ? `Demo description ${index + 1}` : null
      );
    }
  }

  return `Seeded ${assets.length} videos over ${dayOffset} days.`;
}

// Dev-only A/V-sync repro (doc/export-device-checklist.md L91): reproduce the device
// desync that appears after a LONG consecutive missing-day batch. Uses the 6 newest
// library assets (the ffmpeg audio-bearing testsrc clips added via simctl addmedia)
// as filled days on either side of a 65-day gap, big enough to force at least one
// beats-only ("silence" path) chunk plus reader chunks that begin/end in beats.
// Clears all prior selection first for a clean, deterministic timeline.
export async function seedBatchRepro(): Promise<string> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Media library permission is required.");
  }

  const { assets } = await MediaLibrary.getAssetsAsync({
    mediaType: "video",
    first: 200,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]], // newest first
  });
  // Clean slate: unselect everything so old seeds don't pollute the timeline
  for (const asset of assets) {
    await markVideoAsUnselected(asset.id);
  }

  const audioClips = assets.slice(0, 6);
  if (audioClips.length < 6) {
    return `Need 6 audio clips in the library, found ${audioClips.length} — run simctl addmedia first.`;
  }

  // 4 filled | 65 missing | 2 filled  → card + 4 + 65 + 2 = 72 items (31-item chunks):
  // chunk0 = card+4 filled+26 beats, chunk1 = 31 beats (beats-only), chunk2 = beats+2 filled
  const dayOffsets = [0, 1, 2, 3, 69, 70];
  for (const [index, asset] of audioClips.entries()) {
    const originalDate = new Date(asset.creationTime);
    const assignedDate = new Date(Date.now() - dayOffsets[index] * DAY_MS);
    assignedDate.setHours(12, 0, 0, 0);
    await markVideoAsSelected(asset.id, originalDate);
    await changeVideoDate(asset.id, originalDate, assignedDate);
    // Left UNTRIMMED on purpose: the full-asset range surfaces real-footage track-length
    // mismatch (audio track longer than video track), the suspected drift trigger.
    await updateVideoTitleAndDescription(asset.id, originalDate, `Clip ${index + 1}`, null);
  }

  return `Batch repro: 6 filled days around a 65-day gap (72 timeline items → 3 chunks incl. a beats-only one).`;
}
