import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation, useTheme } from "@react-navigation/native";
import React, { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";
import { ThemedButton } from "../../components/ThemedButton";
import { VideoMetadata } from "../../db/schema";
import { VideoPlayerURI } from "../../navigation";
import { CameraRollNavigationProp } from "../../navigation/CameraRollNavigation";
import { isLivePhoto } from "../../services/mediaLibrary";
import { displayDate } from "../../utils/dateTime";
import { PhoneMedia } from "./CameraRoll";
import { VideoActionMenu } from "./VideoActionMenu";
import { VidThumbnail } from "./VideoThumbnail";

interface DaySectionProps {
  item: {
    day: Date;
    videosOfTheDay: PhoneMedia[];
    isVisible: boolean;
  };
  onMetadataUpdate?: () => void;
}

function showVideoByDefault(video: PhoneMedia) {
  return !isLivePhoto(video) || video.metadata?.isSelected;
}

export const DaySection = React.memo(function DaySection({
  item: { day, videosOfTheDay, isVisible },
  onMetadataUpdate,
}: DaySectionProps) {
  const theme = useTheme();
  const navigation = useNavigation<CameraRollNavigationProp>();
  const [showLivePhotos, setShowLivePhotos] = useState(false);

  const { width } = useWindowDimensions();
  const thumbnailSize = width / 5;

  const defaultVideos = videosOfTheDay.filter(showVideoByDefault);
  const hasDefaultVideos = defaultVideos.length > 0;
  const hasLivePhotos = videosOfTheDay.some((v) => !showVideoByDefault(v));

  // Filter videos: show live photos by default if no regular videos, otherwise respect toggle
  const displayedVideos = showLivePhotos || !hasDefaultVideos ? videosOfTheDay : defaultVideos;

  // Reorder videos
  const reversedVideosOfTheDay = [...displayedVideos].reverse();
  const videosIds = reversedVideosOfTheDay.map((vid) => vid.id);

  const dayHasAVideoSelected = videosOfTheDay.some((v) => v.metadata?.isSelected);
  const showToggleButton = hasDefaultVideos && hasLivePhotos;

  return (
    <View style={styles.dateSection} key={day.getTime()}>
      <View style={styles.title}>
        {!dayHasAVideoSelected && <Feather name="circle" size={15} color="white" />}
        {dayHasAVideoSelected && <Feather name="check-circle" size={15} color="white" />}
        <SubTitle>{displayDate(day)}</SubTitle>

        {/* Live Photos Toggle Button */}
        {showToggleButton && (
          <Pressable onPress={() => setShowLivePhotos(!showLivePhotos)} style={styles.livePhotosToggle}>
            <ThemedButton
              Icon={({ iconProps }) => (
                <MaterialCommunityIcons name={showLivePhotos ? "image-outline" : "image-off-outline"} {...iconProps} />
              )}
              text="Live"
              size={14}
              variant={showLivePhotos ? "filled" : "outline"}
              themeColor={showLivePhotos ? "primary" : "secondary"}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.thumbnailList}>
        {/* Video list */}
        {videosOfTheDay.length > 0 &&
          reversedVideosOfTheDay.map((vid, i) => (
            <View key={vid.id} style={{ padding: 1, width: thumbnailSize, height: thumbnailSize }}>
              <VideoActionMenu video={vid} dayContext={day} onMetadataUpdate={() => onMetadataUpdate?.()}>
                <VidThumbnail
                  video={vid}
                  displayAs={dayHasAVideoSelected ? (vid.metadata?.isSelected ? "normal" : "unselected") : "normal"}
                  onPress={() => {
                    navigation.navigate(VideoPlayerURI, { day: day.toISOString(), ids: videosIds, index: i });
                  }}
                  style={vid.metadata?.isSelected && { borderWidth: 2, borderColor: theme.colors.accent }}
                  isVisible={isVisible}
                />
              </VideoActionMenu>
            </View>
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
    marginBottom: 10,
  },
  livePhotosToggle: {
    marginLeft: "auto",
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
