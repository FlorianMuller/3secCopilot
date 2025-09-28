import * as MediaLibrary from "expo-media-library";
import { useCallback, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-native";
import { VideoMetadata } from "../db/schema";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { useMediaLibraryChanges, isAssetWanted } from "../services/mediaLibrary";
import { getVideosMetadtaByIds, getVideosWithAssignedDateInRange } from "../services/metadata";
import { getVideoDatetime } from "../services/videoDatetime";

export interface UseVideoLoaderProps {
  startDate: Date;
  endDate: Date;
  batchSize?: number;
}

export interface UseVideoLoaderReturn {
  videos?: PhoneMedia[];
  allVideoLoaded: boolean;
  lastDateToDisplay?: Date;
  loadNextBatch: () => Promise<void>;
  refetchMetadata: () => Promise<void>;
  updateVideosMetadata: (updates: Record<string, VideoMetadata>) => void;
  resetVideoLoader: () => void;
}

export function useVideoLoader({ startDate, endDate, batchSize = 300 }: UseVideoLoaderProps): UseVideoLoaderReturn {
  const [videos, setVideos] = useState<PhoneMedia[] | undefined>(undefined);
  const endCursorRef = useRef<MediaLibrary.AssetRef | undefined>(undefined);
  const loadingVideoRef = useRef<boolean>(false);
  const [allVideoLoaded, setAllVideoLoaded] = useState<boolean>(false);

  const getLastDateFromVideos = (videoList: PhoneMedia[], allLoaded: boolean): Date => {
    if (allLoaded || videoList.length === 0) return endDate;
    return getVideoDatetime(videoList[videoList.length - 1]);
  };

  // Calculate last date to display for media library changes monitoring
  const lastDateToDisplay = videos !== undefined ? getLastDateFromVideos(videos, allVideoLoaded) : undefined;

  const loadNextBatch = useCallback(async () => {
    if (loadingVideoRef.current || allVideoLoaded) {
      return;
    }

    // Set loading lock
    loadingVideoRef.current = true;

    try {
      // Step 1: Get videos from MediaLibrary based on creation time
      const mediaPage = await MediaLibrary.getAssetsAsync({
        mediaType: ["video", "photo"],
        sortBy: "creationTime",
        createdBefore: startDate.getTime(),
        createdAfter: endDate.getTime(),
        first: batchSize,
        after: endCursorRef.current,
      });

      // Update cursor
      endCursorRef.current = mediaPage.endCursor;

      // Filter current batch to only videos/live photos
      const wantedAssets = mediaPage.assets.filter((asset) => isAssetWanted(asset));
      
      // Get metadata for all videos in this batch to check for assignedToDate
      const batchMetadata = await getVideosMetadtaByIds(wantedAssets.map((v) => v.id));
      
      // Filter out videos that have assignedToDate (they'll be handled separately)
      const currentBatchVideos = wantedAssets.filter((asset) => {
        const metadata = batchMetadata[asset.id];
        return !metadata?.assignedToDate;
      });

      // Calculate new last date from current batch (only from media library videos, not reassigned ones)
      const newLastDateToDisplay = getLastDateFromVideos(currentBatchVideos, !mediaPage.hasNextPage);

      // Step 2: Get videos with assignedToDate that fall in current batch range
      // Range: from lastDateToDisplay (exclusive if exists) to newLastDateToDisplay (inclusive)
      const currentLastDateToDisplay = lastDateToDisplay;
      const assignedDateMetadata = await getVideosWithAssignedDateInRange(
        newLastDateToDisplay,
        currentLastDateToDisplay ?? startDate
      );
      // console.log("assignedDateMetadata", assignedDateMetadata);
      // console.log(
      //   `from ${currentLastDateToDisplay ?? startDate} to ${newLastDateToDisplay}, found ${
      //     Object.keys(assignedDateMetadata).length
      //   } videos with assigned date`
      // );
      const assignedDateVideoIds = Object.keys(assignedDateMetadata);

      // Step 3: Get additional videos that aren't in current batch AND aren't already loaded
      const mediaLibraryVideoIds = new Set(mediaPage.assets.map((v) => v.id));
      const existingVideoIds = new Set((videos || []).map((v) => v.id));
      const additionalVideoIds = assignedDateVideoIds.filter(
        (id) => !mediaLibraryVideoIds.has(id) && !existingVideoIds.has(id)
      );

      const additionalVideosPromises = additionalVideoIds.map(async (id) => {
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(id);
          return assetInfo;
        } catch {
          console.error(`Failed to get asset info for id ${id}`);
          return null;
        }
      });

      const additionalVideos = (await Promise.all(additionalVideosPromises)).filter((a) => a !== null);

      // Step 4: Combine videos and get metadata
      const allVideos = [...currentBatchVideos, ...additionalVideos];
      const allMetadata = {
        ...batchMetadata,
        ...assignedDateMetadata,
      };

      // Step 5: Add metadata and sort by effective date
      const videosWithMetadata = allVideos
        .map((v) => ({
          ...v,
          metadata: allMetadata[v.id],
        }))
        .sort((a, b) => getVideoDatetime(b).getTime() - getVideoDatetime(a).getTime());

      // Update videos and allVideoLoaded together
      unstable_batchedUpdates(() => {
        setVideos((oldVideos) => (oldVideos !== undefined ? oldVideos.concat(videosWithMetadata) : videosWithMetadata));
        if (!mediaPage.hasNextPage) {
          setAllVideoLoaded(true);
        }
      });

      // Release loading lock
      loadingVideoRef.current = false;
    } catch (error) {
      console.error("Error loading video batch:", error);
      loadingVideoRef.current = false;
    }
  }, [startDate, endDate, batchSize, allVideoLoaded, lastDateToDisplay]);

  const refetchMetadata = useCallback(async () => {
    if (videos && videos.length > 0) {
      console.log("Refetching metadata");
      const newMetadata = await getVideosMetadtaByIds(videos.map((v) => v.id));
      setVideos((oldVideos) => (oldVideos || []).map((v) => ({ ...v, metadata: newMetadata[v.id] })));
    }
  }, [videos]);

  const updateVideosMetadata = useCallback((updates: Record<string, VideoMetadata>) => {
    setVideos((oldVideos) => {
      const updatedVideos = (oldVideos || []).map((video) => {
        const updatedMetadata = updates[video.id];
        return updatedMetadata ? { ...video, metadata: updatedMetadata } : video;
      });
      
      // Check if any assignedToDate was updated, if so resort by effective date
      const hasAssignedDateUpdate = Object.values(updates).some(metadata => 
        metadata.assignedToDate !== undefined
      );
      
      if (hasAssignedDateUpdate) {
        return updatedVideos.sort((a, b) => getVideoDatetime(b).getTime() - getVideoDatetime(a).getTime());
      }
      
      return updatedVideos;
    });
  }, []);

  const resetVideoLoader = useCallback(() => {
    setVideos([]);
    setAllVideoLoaded(false);
    endCursorRef.current = undefined;
    loadingVideoRef.current = false;
  }, []);

  // Handle media library changes
  useMediaLibraryChanges(
    (update) => {
      if (!update.hasChanges) {
        // No changes, just refetch metadata
        refetchMetadata();
        return;
      }

      if (!update.hasIncrementalChanges) {
        console.log("Full media library reload required");
        resetVideoLoader();
        return;
      }

      console.log(
        `Media library changes detected: +${update.addedVideos.length} videos, -${update.removedIds.length} videos`
      );

      setVideos((oldVideos) => {
        // Remove deleted videos
        let filteredVideos = (oldVideos || []).filter((v) => !update.removedIds.includes(v.id));

        // Add new videos and sort by creation time (newest first)
        const updatedVideos = [...filteredVideos, ...update.addedVideos].sort(
          (a, b) => b.creationTime - a.creationTime
        );

        return updatedVideos;
      });
    },
    { createdBefore: startDate, createdAfter: lastDateToDisplay }
  );

  return {
    videos,
    allVideoLoaded,
    lastDateToDisplay,
    loadNextBatch,
    refetchMetadata,
    updateVideosMetadata,
    resetVideoLoader,
  };
}
