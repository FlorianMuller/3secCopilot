import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, View, ViewToken } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { VideoMetadata } from "../../db/schema";
import { useMediaLibraryPermissions } from "../../hooks/useMediaLibraryPermissions";
import { useNavigationFocus } from "../../hooks/useNavigationFocus";
import { useVideoLoader } from "../../hooks/useVideoLoader";
import { getEffectiveDate } from "../../services/dayShift";
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
  const { dayShift } = preferences.useDayShiftPreference();
  const { ensurePermission } = useMediaLibraryPermissions();
  const { videos, allVideoLoaded, loadNextBatch, refetchMetadata, updateVideosMetadata } = useVideoLoader({
    startDate,
    endDate,
  });

  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set());

  const gotVideo = videos.length > 0;
  const lastDateToDisplay = useMemo(
    () => (allVideoLoaded || videos.length == 0 ? endDate : new Date(videos[videos.length - 1].creationTime)),
    [allVideoLoaded, endDate, videos]
  );

  const handleLoadNextBatch = async () => {
    // Check we have the right permission first
    const hasPermission = await ensurePermission();
    if (!hasPermission) {
      console.error("Media library permission not granted");
      return;
    }

    // Load next batch using the hook
    await loadNextBatch();
  };

  // Use navigation focus hook to detect when page comes into focus
  useNavigationFocus(() => {
    refetchMetadata();
  });

  // Fetch video when component mount
  useEffect(() => {
    if (videos.length == 0 && !allVideoLoaded) {
      handleLoadNextBatch();
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

  const handleSingleMetadataUpdate = (videoId: string, metadata: VideoMetadata) => {
    updateVideosMetadata({ [videoId]: metadata });
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
          renderItem={(props) => <DaySection {...props} onMetadataUpdate={handleSingleMetadataUpdate} />}
          keyExtractor={({ day }) => day.toDateString()}
          indicatorStyle="white"
          onEndReached={allVideoLoaded ? undefined : handleLoadNextBatch}
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
