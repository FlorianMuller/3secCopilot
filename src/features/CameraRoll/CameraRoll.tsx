import * as MediaLibrary from "expo-media-library";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { VideoMetadata } from "../../db/schema";
import { getVideosMetadtaByIds } from "../../services/selection";
import { groupBy } from "../../utils/groupBy";
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
  endDate = new Date(startDate.getFullYear(), 0),
}: CameraRollProps) {
  const [status, requestPermission] = MediaLibrary.usePermissions();

  const [videos, setVideos] = useState<PhoneMedia[]>([]);
  const [videoEndCursor, setVideoEndCursor] = useState<MediaLibrary.AssetRef>();
  const [loading, setLoading] = useState<boolean>(false);

  const getVid = async () => {
    if (loading) {
      return;
    }
    // Set loading lock
    setLoading(true);

    // Check we have the right permission
    try {
      await requestPermission();
    } catch (e) {
      console.error("error while requesting media library permission", e);
      setLoading(false);
    }

    // Get next video page
    try {
      const vidPage: MediaLibrary.PagedInfo<PhoneMedia> = await MediaLibrary.getAssetsAsync({
        mediaType: "video",
        sortBy: "creationTime",
        // createdBefore: startDate.getTime(),
        createdAfter: endDate.getTime(),
        first: 500,
        after: videoEndCursor,
      });
      const newVideos = vidPage.assets;

      console.log(`loading new videos`);
      setVideoEndCursor(vidPage.endCursor);

      // Retrieve metadata
      const newMetadta = await getVideosMetadtaByIds(newVideos.map((v) => v.id));

      // Assign metadata to video
      const newVideoWithMetadata = newVideos.map((v) => ({ ...v, metadata: newMetadta[v.id] }));
      setVideos((oldVideos) => [...oldVideos, ...newVideoWithMetadata]);

      // Release loading lock
      setLoading(false);
    } catch (e) {
      console.error("error loading video batch", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    getVid();
  }, []);

  function getGroupedVideos(vids: PhoneMedia[]) {
    return groupBy(vids, (v) => new Date(v.creationTime).toDateString());
  }

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

  const videosByDay = useMemo(() => getGroupedVideos(videos), [videos]);
  const days = useMemo(
    () => (videos.length === 0 ? [] : getDaysBetween(startDate, new Date(videos[videos.length - 1].creationTime))),
    [startDate, videos]
  );

  return (
    <>
      {!gotVideo && (
        <View style={[styles.center, styles.height100]}>
          <MyAppText>loading...</MyAppText>
        </View>
      )}

      {gotVideo && (
        <View style={styles.container}>
          <FlatList
            data={days.map((day) => ({ day, videosOfTheDay: videosByDay[day.toDateString()] || [] }))}
            renderItem={(props) => <DaySection {...props} />}
            keyExtractor={({ day }) => day.toDateString()}
            indicatorStyle="white"
            onEndReached={getVid}
            onEndReachedThreshold={0.5}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  dateSection: {
    marginBottom: 40,
  },
  container: {
    marginTop: 60,
  },
  thumbnailList: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  VideoThumbnails: {
    width: 90,
    height: 90,
  },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  height100: {
    height: "100%",
  },
});
