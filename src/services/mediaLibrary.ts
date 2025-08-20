import * as MediaLibrary from "expo-media-library";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { getVideoMetadata, getVideosMetadtaByIds } from "./metadata";
import { useEffect } from "react";

export interface MediaValidityOptions {
  createdBefore?: Date;
  createdAfter?: Date;
}

export function isLivePhoto(asset: MediaLibrary.Asset): boolean {
  return asset.mediaType === "photo" && (asset.mediaSubtypes?.includes('livePhoto') ?? false);
}


// Check that:
// - Asset is a video or live photo
// - Asset creationTime (or asigned time) is in the right range
// - Asset is not hidden
export function isAssetWanted(asset: PhoneMedia, options?: MediaValidityOptions): Boolean {
  const assetDate = asset.metadata?.assignedToDate || new Date(asset.creationTime);

  if (options?.createdBefore && assetDate > options.createdBefore) {
    return false;
  }

  if (options?.createdAfter && assetDate < options.createdAfter) {
    return false;
  }

  // Accept videos or live photos
  return asset.mediaType === "video" || isLivePhoto(asset);
}

export interface MediaLibraryUpdate {
  addedVideos: PhoneMedia[];
  removedIds: string[];
  hasChanges: boolean;
  hasIncrementalChanges: boolean; // false if update can't be described by added/removed assets (need full reload)
}

export function useMediaLibraryChanges(onUpdate: (update: MediaLibraryUpdate) => void, options?: MediaValidityOptions) {
  const handleEvent = async (event: MediaLibrary.MediaLibraryAssetsChangeEvent) => {
    if (!event.hasIncrementalChanges) {
      onUpdate({
        addedVideos: [],
        removedIds: [],
        hasChanges: true,
        hasIncrementalChanges: false,
      });
      return;
    }

    // Collect all asset IDs and fetch metadata in one call
    const insertedAssets = event.insertedAssets || [];
    const deletedAssets = event.deletedAssets || [];
    // todo: handle updated assets
    // const updatedAssets = event.updatedAssets || [];

    const allAssetIds = [
      ...insertedAssets.map((v) => v.id),
      ...deletedAssets.map((v) => v.id),
      // ...updatedAssets.map((v) => v.id),
    ];

    const allMetadata = await getVideosMetadtaByIds(allAssetIds);

    const insertedAssetsWithMetadata = insertedAssets.map((v) => ({ ...v, metadata: allMetadata[v.id] }));
    const deletedAssetsWithMetadata = deletedAssets.map((v) => ({ ...v, metadata: allMetadata[v.id] }));
    // const updatedAssetsWithMetadata = updatedAssets.map((v) => ({ ...v, metadata: allMetadata[v.id] }));

    // Only keep asset we are interested in (videos)
    const wantedInsertedAssets = insertedAssetsWithMetadata.filter((a) => isAssetWanted(a, options));
    const wantedDeletedAssets = deletedAssetsWithMetadata.filter((a) => isAssetWanted(a, options));
    // const wantedUpdatedAssets = event.updatedAssetsWithMetadata.filter((a) => isAssetWanted(a, options));

    // Extract ids of deleted videos
    const removedIds = wantedDeletedAssets.map((v) => v.id);

    // todo: handle updated
    onUpdate({
      addedVideos: wantedInsertedAssets,
      removedIds,
      hasChanges: wantedInsertedAssets.length > 0 || removedIds.length > 0,
      hasIncrementalChanges: true,
    });
  };

  // Subscribe to media library changes
  useEffect(() => {
    const subscription = MediaLibrary.addListener((event) => {
      handleEvent(event);
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
