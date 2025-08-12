import * as MediaLibrary from "expo-media-library";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { getVideosMetadtaByIds } from "./metadata";

export interface MediaLibraryUpdate {
  addedVideos: PhoneMedia[];
  removedIds: string[];
  hasChanges: boolean;
}

export const getMediaLibraryUpdate = async (
  currentVideoIds: string[],
  startDate: Date,
  endDate: Date
): Promise<MediaLibraryUpdate> => {
  // Get all current video IDs in our date range
  const allCurrentVideos = await MediaLibrary.getAssetsAsync({
    mediaType: "video",
    sortBy: "creationTime",
    createdAfter: endDate.getTime(),
    createdBefore: startDate.getTime(),
    first: currentVideoIds.length || 100, // Use exact count, fallback for empty case
  });

  const currentIds = new Set(allCurrentVideos.assets.map((v) => v.id));
  const loadedIds = new Set(currentVideoIds);

  // Find differences
  const addedIds = Array.from(currentIds).filter((id) => !loadedIds.has(id));
  const removedIds = Array.from(loadedIds).filter((id) => !currentIds.has(id));

  // Load full data and metadata for new videos
  let addedVideos: PhoneMedia[] = [];
  if (addedIds.length > 0) {
    const newVideosData = allCurrentVideos.assets.filter((v) => addedIds.includes(v.id));
    const newMetadata = await getVideosMetadtaByIds(addedIds);
    addedVideos = newVideosData.map((v) => ({ ...v, metadata: newMetadata[v.id] }));
  }

  return {
    addedVideos,
    removedIds,
    hasChanges: addedIds.length > 0 || removedIds.length > 0,
  };
};
