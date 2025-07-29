import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, unstable_batchedUpdates, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { VideoMetadata } from "../../db/schema";
import { getEffectiveDate } from "../../services/dayShift";
import preferences from "../../services/preferences";
import { getVideosMetadtaByIds } from "../../services/metadata";
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
  startDate = new Date(),
  endDate = new Date(startDate.getFullYear() - 1, 0), // todo: add a year selector
}: CameraRollProps) {
  const navigation = useNavigation();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const { dayShift } = preferences.useDayShiftPreference();

  const [videos, setVideos] = useState<PhoneMedia[]>([]);
  const videoEndCursorRef = useRef<MediaLibrary.AssetRef>();
  const loadingVideoRef = useRef<boolean>(false);
  const [allVideoLoaded, setAllVideoLoaded] = useState<boolean>(false);

  const getVid = async () => {
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
        // createdBefore: startDate.getTime(),
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

  // Fetch video when component mount
  useEffect(() => {
    getVid();
  }, []);

  // Refetch metadata when the page is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      refetchMetadata();
    });

    return unsubscribe;
  }, [navigation, refetchMetadata]);

  function getDaysBetween(start: Date, end: Date) {
    const dates: Date[] = [];
    let lastDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (lastDate.getTime() >= end.getTime()) {
      dates.push(lastDate);
      // new date
      lastDate = new Date(lastDate);
      // minus 1 day
      lastDate.setDate(lastDate.getDate() - 1);
    }

    return dates;
  }

  const gotVideo = videos.length > 0;

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
    const lastDateToDisplay = allVideoLoaded ? endDate : new Date(videos[videos.length - 1].creationTime);
    return getDaysBetween(startDate, lastDateToDisplay);
  }, [startDate, endDate, videos, allVideoLoaded, gotVideo]);

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
          data={days.map((day) => ({ day, videosOfTheDay: videosByDay[day.toDateString()] || [] }))}
          renderItem={(props) => <DaySection {...props} />}
          keyExtractor={({ day }) => day.toDateString()}
          indicatorStyle="white"
          onEndReached={allVideoLoaded ? undefined : getVid}
          onEndReachedThreshold={300}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          // To not render fist section under iPhone notch
          // todo: use safe zone component to detect if there's a notch
          ListHeaderComponent={<View style={{ height: 70 }} />}
        />
      )}
    </>
  );
}
