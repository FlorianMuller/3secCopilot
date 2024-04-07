import { DateTime } from "luxon";
import { View, StyleSheet } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";
import { capitalize } from "../../utils/capitalize";
import { PhoneMedia } from "./CameraRoll";
import { VidThumbnail } from "./VideoThumbnail";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { VideoPlayerURI } from "../../navigation";

interface DaySectionProps {
  item: { day: Date; videosOfTheDay: PhoneMedia[] };
}

export function DaySection({ item: { day, videosOfTheDay } }: DaySectionProps) {
  const navigation = useNavigation();

  const reversedVideosOfTheDay = [...videosOfTheDay].reverse();
  const videosIds = reversedVideosOfTheDay.map((vid) => vid.id);

  return (
    <View style={styles.dateSection} key={day.getTime()}>
      <SubTitle>
        {capitalize(
          DateTime.fromJSDate(day).setLocale("fr").toLocaleString({ day: "numeric", month: "long", weekday: "long" })
        )}
      </SubTitle>

      <View style={styles.thumbnailList}>
        {/* Video list */}
        {videosOfTheDay.length > 0 &&
          reversedVideosOfTheDay.map((vid, i) => (
            <VidThumbnail
              video={vid}
              key={vid.id}
              onPress={() => {
                navigation.navigate(VideoPlayerURI, { ids: videosIds, index: i });
              }}
            />
          ))}

        {/* No video */}
        {videosOfTheDay.length === 0 && (
          <View style={[styles.center, { height: 100 }]}>
            <MyAppText>❌ No videos</MyAppText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateSection: {
    marginBottom: 40,
  },
  thumbnailList: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
});
