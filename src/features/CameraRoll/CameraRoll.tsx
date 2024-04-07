import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, View, FlatList } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { MyAppText } from "../../components/text/MyAppText";
import { groupBy } from "../../utils/groupBy";
import { DaySection } from "./DaySection";

export interface PhoneMedia extends MediaLibrary.Asset {
  info?: MediaLibrary.AssetInfo;
  thumbnail?: VideoThumbnails.VideoThumbnailsResult;
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

  const getVid = async () => {
    await requestPermission();

    const vidPage: MediaLibrary.PagedInfo<PhoneMedia> = await MediaLibrary.getAssetsAsync({
      mediaType: "video",
      sortBy: "creationTime",
      // createdAfter: startDate,
      // createdBefore: endDate,
      first: 200,
    });

    setVideos(vidPage.assets);
  };

  useEffect(() => {
    console.log("reset");
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

  const loading = videos.length === 0;

  const videosByDay = useMemo(() => getGroupedVideos(videos), [videos]);
  const days = useMemo(() => getDaysBetween(startDate, endDate), [startDate, endDate]);

  return (
    <>
      {loading && (
        <View style={[styles.center, styles.height100]}>
          <MyAppText>loading...</MyAppText>
        </View>
      )}

      {!loading && (
        <View style={styles.container}>
          <FlatList
            data={days.map((day) => ({ day, videosOfTheDay: videosByDay[day.toDateString()] || [] }))}
            renderItem={(props) => <DaySection {...props}/>}
            keyExtractor={({ day }) => day.toDateString()}
            indicatorStyle="white"
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
