import * as MediaLibrary from "expo-media-library";
import {
  changeVideoDate,
  markVideoAsSelected,
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
