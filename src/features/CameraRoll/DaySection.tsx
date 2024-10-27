import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { StyleSheet, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";
import { VideoPlayerURI } from "../../navigation";
import { CameraRollNavigationProp } from "../../navigation/CameraRollNavigation";
import { displayDate } from "../../utils/dateTime";
import { PhoneMedia } from "./CameraRoll";
import { VidThumbnail } from "./VideoThumbnail";
interface DaySectionProps {
  item: { day: Date; videosOfTheDay: PhoneMedia[] };
}

export const DaySection = React.memo(function DaySection({ item: { day, videosOfTheDay } }: DaySectionProps) {
  const navigation = useNavigation<CameraRollNavigationProp>();

  const reversedVideosOfTheDay = [...videosOfTheDay].reverse();
  const videosIds = reversedVideosOfTheDay.map((vid) => vid.id);

  const dayHasAVideoSelected = videosOfTheDay.some((v) => v.metadata?.isSelected);

  return (
    <View style={styles.dateSection} key={day.getTime()}>
      <View style={styles.title}>
        {!dayHasAVideoSelected && <Feather name="circle" size={15} color="white" />}
        {dayHasAVideoSelected && <Feather name="check-circle" size={15} color="white" />}
        <SubTitle>{displayDate(day)}</SubTitle>
      </View>

      <View style={styles.thumbnailList}>
        {/* Video list */}
        {videosOfTheDay.length > 0 &&
          reversedVideosOfTheDay.map((vid, i) => (
            <VidThumbnail
              key={vid.id}
              video={vid}
              displayHas={dayHasAVideoSelected ? (vid.metadata?.isSelected ? "selected" : "unselected") : "normal"}
              onPress={() => {
                navigation.navigate(VideoPlayerURI, { day: day.toISOString(), ids: videosIds, index: i });
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
});

const styles = StyleSheet.create({
  dateSection: {
    marginBottom: 40,
  },
  title: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
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
