import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, unstable_batchedUpdates, View, ViewToken } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { VideoMetadata } from "../../db/schema";
import { useNavigationFocus } from "../../hooks/useNavigationFocus";
import { getEffectiveDate } from "../../services/dayShift";
import { useMediaLibraryChanges } from "../../services/mediaLibrary";
import { getVideosMetadtaByIds } from "../../services/metadata";
import preferences from "../../services/preferences";
import { getDaysBetween } from "../../utils/getDaysBetween";
import { groupBy } from "../../utils/groupBy";
import { utilStyles } from "../../utils/utilStyles";
import { DaySection } from "./DaySection";

export interface PhoneMedia extends MediaLibrary.Asset {
  info?: MediaLibrary.AssetInfo;
  metadata?: VideoMetadata;
}

export interface CameraRollProps {
  startDate?: Date;
  endDate?: Date;
}

export default function CameraRoll({
  startDate = new Date(new Date().setHours(23, 59, 59, 999)), // Today at 23:59:59
  endDate = new Date(new Date().getFullYear(), 0, 1), // January 1st of current year
}: CameraRollProps) {
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const { dayShift } = preferences.useDayShiftPreference();

  const [videos, setVideos] = useState<PhoneMedia[]>([]);
  const videoEndCursorRef = useRef<MediaLibrary.AssetRef | undefined>(undefined);
  const loadingVideoRef = useRef<boolean>(false);
  const [allVideoLoaded, setAllVideoLoaded] = useState<boolean>(false);
  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set());

  const gotVideo = videos.length > 0;
  const lastDateToDisplay = useMemo(
    () => (allVideoLoaded || videos.length == 0 ? endDate : new Date(videos[videos.length - 1].creationTime)),
    [allVideoLoaded, endDate, videos]
  );

  const getVideosNextBatch = async () => {
    if (loadingVideoRef.current || allVideoLoaded) {
      return;
    }
    // Set loading lock
    loadingVideoRef.current = true;

    // Check we have the right permission
    if (permissionResponse?.status !== "granted") {
      try {
        await requestPermission();
      } catch (e) {
        console.error("error while requesting media library permission", e);
        loadingVideoRef.current = false;
        return;
      }
    }

    // Get next video page
    try {
      const vidPage: MediaLibrary.PagedInfo<PhoneMedia> = await MediaLibrary.getAssetsAsync({
        mediaType: "video",
        sortBy: "creationTime",
        createdBefore: startDate.getTime(),
        createdAfter: endDate.getTime(),
        first: 100,
        after: videoEndCursorRef.current,
      });
      const newVideos = vidPage.assets;

      videoEndCursorRef.current = vidPage.endCursor;

      // Retrieve metadata
      const newMetadta = await getVideosMetadtaByIds(newVideos.map((v) => v.id));

      // Assign metadata to video
      const newVideoWithMetadata = newVideos.map((v) => ({ ...v, metadata: newMetadta[v.id] }));

      // Update videos and allVideoLoaded together
      unstable_batchedUpdates(() => {
        setVideos((oldVideos) => oldVideos.concat(newVideoWithMetadata));
        if (!vidPage.hasNextPage) {
          setAllVideoLoaded(true);
        }
      });

      // Release loading lock
      loadingVideoRef.current = false;
    } catch (e) {
      console.error("error loading video batch", e);
      loadingVideoRef.current = false;
    }
  };

  const refetchMetadata = useCallback(async () => {
    if (videos.length > 0) {
      console.log("Refetching metadata");
      const newMetadta = await getVideosMetadtaByIds(videos.map((v) => v.id));
      setVideos((oldVideos) => oldVideos.map((v) => ({ ...v, metadata: newMetadta[v.id] })));
    }
  }, [videos]);

  // Callback to updated videos on media library changes
  useMediaLibraryChanges(
    (update) => {
      if (!update.hasChanges) {
        // No changes, just refetch metadata
        refetchMetadata();
        return;
      }

      if (!update.hasIncrementalChanges) {
        console.log("Full media library reload required");
        // Reset all
        setVideos([]);
        setAllVideoLoaded(false);
        videoEndCursorRef.current = undefined;
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

  // Use navigation focus hook to detect when page comes into focus
  useNavigationFocus(() => {
    refetchMetadata();
  });

  // Fetch video when component mount
  useEffect(() => {
    if (videos.length == 0 && !allVideoLoaded) {
      getVideosNextBatch();
    }
  }, [videos.length]);

  const videosByDay = useMemo(
    () =>
      groupBy(videos, (v) =>
        getEffectiveDate(new Date(v.creationTime), dayShift || { hour: 0, minute: 0 }).toDateString()
      ),
    [videos, dayShift]
  );

  const days = useMemo(() => {
    if (!gotVideo) {
      return [];
    }
    return getDaysBetween(startDate, lastDateToDisplay);
  }, [startDate, lastDateToDisplay, gotVideo]);

  // Handle viewable items changed to track visible days for priority
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const newVisibleDays = new Set<string>();
    viewableItems.forEach((item) => {
      if (item.item && typeof item.item === "object" && "day" in item.item) {
        const dayItem = item.item as { day: Date };
        newVisibleDays.add(dayItem.day.toDateString());
      }
    });
    setVisibleDays(newVisibleDays);
  }, []);

  const viewabilityConfig = {
    viewAreaCoveragePercentThreshold: 10, // Consider item visible when 10% is shown
  };

  return (
    <>
      {/* Linear gradient between thumbnails and phone status bar (time, wifi icon...) */}
      {/* Todo: compute dynamically status bar size */}
      <LinearGradient
        colors={["rgba(0, 0, 0, 0.6)", "rgba(0, 0, 0, 0)"]}
        style={{ width: "100%", height: 80, position: "absolute", zIndex: 100 }}
      />

      {!gotVideo && (
        <View style={[utilStyles.centerVertical, utilStyles.hw100]}>
          <MyAppText>loading videos...</MyAppText>
        </View>
      )}

      {gotVideo && (
        <FlatList
          data={days.map((day) => ({
            day,
            videosOfTheDay: videosByDay[day.toDateString()] || [],
            isVisible: visibleDays.has(day.toDateString()),
          }))}
          renderItem={(props) => <DaySection {...props} />}
          keyExtractor={({ day }) => day.toDateString()}
          indicatorStyle="white"
          onEndReached={allVideoLoaded ? undefined : getVideosNextBatch}
          onEndReachedThreshold={300}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // To not render fist section under iPhone notch
          // todo: use safe zone component to detect if there's a notch
          ListHeaderComponent={<View style={{ height: 70 }} />}
        />
      )}
    </>
  );
}
