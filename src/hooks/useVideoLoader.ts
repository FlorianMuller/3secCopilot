import * as MediaLibrary from "expo-media-library";
import { useCallback, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-native";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { extractLivePhotoVideos, useMediaLibraryChanges } from "../services/mediaLibrary";
import { getVideosMetadtaByIds } from "../services/metadata";

export interface UseVideoLoaderProps {
  startDate: Date;
  endDate: Date;
  batchSize?: number;
}

export interface UseVideoLoaderReturn {
  videos: PhoneMedia[];
  allVideoLoaded: boolean;
  loadNextBatch: () => Promise<void>;
  refetchMetadata: () => Promise<void>;
  resetVideoLoader: () => void;
}

export function useVideoLoader({ startDate, endDate, batchSize = 300 }: UseVideoLoaderProps): UseVideoLoaderReturn {
  const [videos, setVideos] = useState<PhoneMedia[]>([]);
  const endCursorRef = useRef<MediaLibrary.AssetRef | undefined>(undefined);
  const loadingVideoRef = useRef<boolean>(false);
  const [allVideoLoaded, setAllVideoLoaded] = useState<boolean>(false);

  // Calculate last date to display for media library changes monitoring
  const lastDateToDisplay =
    allVideoLoaded || videos.length === 0 ? endDate : new Date(videos[videos.length - 1].creationTime);

  const loadNextBatch = useCallback(async () => {
    if (loadingVideoRef.current || allVideoLoaded) {
      return;
    }

    // Set loading lock
    loadingVideoRef.current = true;

    try {
      // Query both videos and photos in one call to maintain proper chronological order
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

      // Separate videos and photos
      const regularVideos = mediaPage.assets.filter((asset) => asset.mediaType === "video");
      const photos = mediaPage.assets.filter((asset) => asset.mediaType === "photo");

      // Extract live photo videos
      const livePhotoVideos = await extractLivePhotoVideos(photos);

      // Combine regular videos with live photo videos and sort by creation time
      const allNewVideos = [...regularVideos, ...livePhotoVideos].sort((a, b) => b.creationTime - a.creationTime);

      // Retrieve metadata for all videos
      const newMetadata = await getVideosMetadtaByIds(allNewVideos.map((v) => v.id));

      // Assign metadata to videos
      const newVideosWithMetadata = allNewVideos.map((v) => ({
        ...v,
        metadata: newMetadata[v.id],
      }));

      // Update videos and allVideoLoaded together
      unstable_batchedUpdates(() => {
        setVideos((oldVideos) => oldVideos.concat(newVideosWithMetadata));
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
  }, [startDate, endDate, batchSize, allVideoLoaded]);

  const refetchMetadata = useCallback(async () => {
    if (videos.length > 0) {
      console.log("Refetching metadata");
      const newMetadata = await getVideosMetadtaByIds(videos.map((v) => v.id));
      setVideos((oldVideos) => oldVideos.map((v) => ({ ...v, metadata: newMetadata[v.id] })));
    }
  }, [videos]);

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
        let filteredVideos = oldVideos.filter((v) => !update.removedIds.includes(v.id));

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
    loadNextBatch,
    refetchMetadata,
    resetVideoLoader,
  };
}
