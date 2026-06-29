import * as MediaLibrary from "expo-media-library";
import { useCallback, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-native";
import { VideoMetadata } from "../db/schema";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { useMediaLibraryChanges } from "../services/mediaLibrary";
import { getVideosMetadtaByIds } from "../services/metadata";
import { getVideoDatetime } from "../services/videoDatetime";
import { assembleVideosFromAssets } from "../services/videoAssembly";

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
  upsertVideos: (videos: PhoneMedia[]) => void;
  removeVideos: (ids: string[]) => void;
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
      // Get videos from MediaLibrary based on creation time
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

      // Skip videos already loaded by previous batches.
      const existingVideoIds = new Set((videos || []).map((v) => v.id));

      const videosWithMetadata = await assembleVideosFromAssets(
        mediaPage.assets,
        // Assigned-date window for this batch: from the new last date (computed from this batch's
        // creation-time videos) up to the previously displayed last date (or startDate on first load).
        (currentBatchVideos) => ({
          createdAfter: getLastDateFromVideos(currentBatchVideos, !mediaPage.hasNextPage),
          createdBefore: lastDateToDisplay ?? startDate,
        }),
        existingVideoIds
      );

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
      const hasAssignedDateUpdate = Object.values(updates).some((metadata) => metadata.assignedToDate !== undefined);

      if (hasAssignedDateUpdate) {
        return updatedVideos.sort((a, b) => getVideoDatetime(b).getTime() - getVideoDatetime(a).getTime());
      }

      return updatedVideos;
    });
  }, []);

  // Insert or replace videos in the list (merge by id), then re-sort by effective date — used when a
  // stashed video is assigned to a day and must appear under it in the right chronological spot.
  const upsertVideos = useCallback((newVideos: PhoneMedia[]) => {
    if (newVideos.length === 0) return;
    setVideos((oldVideos) => {
      const byId = new Map((oldVideos || []).map((v) => [v.id, v]));
      for (const video of newVideos) {
        byId.set(video.id, video);
      }
      return [...byId.values()].sort((a, b) => getVideoDatetime(b).getTime() - getVideoDatetime(a).getTime());
    });
  }, []);

  // Drop videos from the list by id — symmetric to updateVideosMetadata, used when a video leaves the
  // roll (e.g. it was just stashed).
  const removeVideos = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setVideos((oldVideos) => (oldVideos || []).filter((v) => !idSet.has(v.id)));
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
    upsertVideos,
    removeVideos,
    resetVideoLoader,
  };
}
