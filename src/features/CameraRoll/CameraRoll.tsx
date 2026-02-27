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
import { getVideoDatetime } from "../../services/videoDatetime";
import { getDaysBetween } from "../../utils/getDaysBetween";
import { groupBy } from "../../utils/groupBy";
import { utilStyles } from "../../utils/utilStyles";
import { DaySection } from "./DaySection";

export interface PhoneMedia extends MediaLibrary.Asset {
  info?: MediaLibrary.AssetInfo;
  metadata?: VideoMetadata;
}

export interface CameraRollProps {
  startDate: Date;
  endDate: Date;
}

export default function CameraRoll({ startDate, endDate }: CameraRollProps) {
  const { dayShift } = preferences.useDayShiftPreference();
  const { ensurePermission } = useMediaLibraryPermissions();
  const { videos, allVideoLoaded, lastDateToDisplay, loadNextBatch, refetchMetadata, updateVideosMetadata } =
    useVideoLoader({
      startDate,
      endDate,
    });

  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set());

  const videoLoading = videos === undefined;

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
    handleLoadNextBatch();
  }, []);

  const videosByDay = useMemo(
    () =>
      groupBy(videos || [], (v) =>
        getEffectiveDate(getVideoDatetime(v), dayShift || { hour: 0, minute: 0 }).toDateString()
      ),
    [videos, dayShift]
  );

  const days = useMemo(() => {
    if (lastDateToDisplay === undefined) {
      return [];
    }
    return getDaysBetween(startDate, lastDateToDisplay);
  }, [startDate, lastDateToDisplay]);

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

  if (videoLoading) {
    return (
      <View style={[utilStyles.centerVertical, utilStyles.hw100]}>
        <MyAppText>loading videos...</MyAppText>
      </View>
    );
  }

  return (
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
  );
}
