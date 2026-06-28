import * as MediaLibrary from "expo-media-library";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { DayShiftTime } from "../features/Options/sections/DayShiftSection";
import { assembleVideosFromAssets } from "./videoAssembly";

// Creation-time window [windowStart, windowEnd) whose effective date (after applying day-shift) is `day`.
// A video filmed before the day-shift cutoff counts as the previous day, so day D's window runs from
// D at the cutoff time to D+1 at the cutoff time (e.g. cutoff 03:00 → [D 03:00, D+1 03:00)). With a
// 00:00 cutoff this is exactly the calendar day.
function getDayWindow(day: Date, dayShift: DayShiftTime): { windowStart: Date; windowEnd: Date } {
  const windowStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayShift.hour, dayShift.minute);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 1);
  return { windowStart, windowEnd };
}

async function getAssetsInWindow(windowStart: Date, windowEnd: Date): Promise<MediaLibrary.Asset[]> {
  const assets: MediaLibrary.Asset[] = [];
  let after: MediaLibrary.AssetRef | undefined = undefined;

  // A single day rarely spans more than a page, but loop to stay correct on heavy-shooting days.
  while (true) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: ["video", "photo"],
      sortBy: "creationTime",
      createdAfter: windowStart.getTime(),
      createdBefore: windowEnd.getTime(),
      first: 200,
      after,
    });
    assets.push(...page.assets);
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }

  return assets;
}

// Loads every video/live photo whose effective date is `day`, with its DB metadata attached and
// sorted newest-first — the same shape the batch loader produces, but scoped to one day so the
// "unselected only" filter can render a day's thumbnails on demand without paging the whole roll.
// Mirrors useVideoLoader's batch logic: assets reassigned elsewhere are dropped, and videos assigned
// into this day are pulled in separately.
export async function getVideosForDay(day: Date, dayShift: DayShiftTime): Promise<PhoneMedia[]> {
  const { windowStart, windowEnd } = getDayWindow(day, dayShift);

  const rawAssets = await getAssetsInWindow(windowStart, windowEnd);
  return assembleVideosFromAssets(rawAssets, { createdAfter: windowStart, createdBefore: windowEnd });
}
