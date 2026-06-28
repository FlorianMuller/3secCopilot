import * as MediaLibrary from "expo-media-library";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { isAssetWanted } from "./mediaLibrary";
import { getVideosMetadtaByIds, getVideosWithAssignedDateInRange } from "./metadata";
import { getVideoDatetime } from "./videoDatetime";

// Chronological window used to find videos *assigned* into a range (matches
// getVideosWithAssignedDateInRange's argument order).
export interface AssignedDateRange {
  createdAfter: Date;
  createdBefore: Date;
}

// Builds the renderable video list from a page/window of raw media-library assets:
// keeps only wanted videos/live photos, drops any reassigned to another date, pulls in
// videos assigned *into* the range, attaches DB metadata, and sorts newest-first by
// effective date. Shared by the camera-roll batch loader (useVideoLoader) and the
// single-day loader (getVideosForDay).
//
// assignedRange can be a fixed window or a resolver computed from the creation-day videos:
// the batch loader derives its assigned-date window from the last loaded video, while the
// day loader uses a fixed window. excludeIds skips assets already loaded by the caller.
export async function assembleVideosFromAssets(
  rawAssets: MediaLibrary.Asset[],
  assignedRange: AssignedDateRange | ((creationDayVideos: MediaLibrary.Asset[]) => AssignedDateRange),
  excludeIds?: Set<string>
): Promise<PhoneMedia[]> {
  const wantedAssets = rawAssets.filter((asset) => isAssetWanted(asset));

  const batchMetadata = await getVideosMetadtaByIds(wantedAssets.map((v) => v.id));

  // Drop assets reassigned to another date — they belong to their assigned day, handled separately.
  const creationDayVideos = wantedAssets.filter((asset) => !batchMetadata[asset.id]?.assignedToDate);

  const range = typeof assignedRange === "function" ? assignedRange(creationDayVideos) : assignedRange;
  const assignedMetadata = await getVideosWithAssignedDateInRange(range.createdAfter, range.createdBefore);

  // Pull in videos assigned into the range that weren't filmed in it and aren't already loaded.
  const creationDayIds = new Set(creationDayVideos.map((v) => v.id));
  const assignedIds = Object.keys(assignedMetadata).filter((id) => !creationDayIds.has(id) && !excludeIds?.has(id));

  const assignedVideos = (
    await Promise.all(
      assignedIds.map(async (id) => {
        try {
          return await MediaLibrary.getAssetInfoAsync(id);
        } catch {
          console.error(`Failed to get asset info for id ${id}`);
          return null;
        }
      })
    )
  ).filter((a): a is MediaLibrary.AssetInfo => a !== null);

  const allMetadata = { ...batchMetadata, ...assignedMetadata };

  return [...creationDayVideos, ...assignedVideos]
    .map((v) => ({ ...v, metadata: allMetadata[v.id] }))
    .sort((a, b) => getVideoDatetime(b).getTime() - getVideoDatetime(a).getTime());
}
