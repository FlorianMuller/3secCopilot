import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import * as MediaLibrary from "expo-media-library";
import { VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";
import { copyVideoToTemp } from "../../services/localVideo";
import { getLocalUri } from "../../services/mediaLocalUri";
import { displayDate } from "../../utils/dateTime";
import { utilStyles } from "../../utils/utilStyles";
import { PhoneMedia } from "./CameraRoll";
import { useFittedVideoPlayer } from "./VideoPlayer/useFittedVideoPlayer";
import { VideoThumbnailBar } from "./VideoPlayer/VideoThumbnailBar";

interface StashVideoPreviewProps {
  videos: PhoneMedia[];
  initialIndex: number;
  day: Date;
  // Confirm using the currently shown video to fill `day`.
  onUse: (video: PhoneMedia) => void;
  // Return to the stash grid without picking.
  onBack: () => void;
}

// Second step of the stash picker: plays the tapped stash video (autoplay, fitted to the sheet) with a
// confirm button, so the user can watch a clip before committing it to a day. A thumbnail bar lets the
// user switch between stash videos without leaving the preview. Shares the player wiring and the bar
// with the full-screen VideoPlayer.
export function StashVideoPreview({ videos, initialIndex, day, onUse, onBack }: StashVideoPreviewProps) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const video = videos[index];
  const { player, videoSize, onContainerLayout } = useFittedVideoPlayer({ width: video.width, height: video.height });
  const [isLoading, setIsLoading] = useState(true);

  // The sheet is pinned to 70% of the screen (see useStashPicker) and BottomSheetView content-sizes to
  // its children, so flex alone collapses to zero height here. Give the preview an explicit height to
  // fill the sheet — minus the drag handle and the wrapper's bottom padding — and let the video area
  // flex within it.
  const contentHeight = windowHeight * 0.7 - 100;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    async function loadSource() {
      try {
        // PhoneMedia from the grid has no localUri; fetch the full asset to get a playable path.
        const info = await MediaLibrary.getAssetInfoAsync(video.id);
        if (cancelled) return;
        try {
          const uri = await copyVideoToTemp(info);
          if (!cancelled) await player.replaceAsync({ uri });
        } catch (copyError) {
          // iOS 18 can reject the copy; fall back to the direct local URI like VideoPlayer does.
          console.error("Failed to copy stash preview to temp, using local uri", copyError);
          if (!cancelled) await player.replaceAsync({ uri: getLocalUri(info) });
        }
      } catch (error) {
        console.error("Failed to load stash preview video", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadSource();
    return () => {
      cancelled = true;
    };
  }, [video.id, player]);

  return (
    <View style={[styles.container, { height: contentHeight }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          <MyAppText size={16} color={theme.colors.text}>
            Stash
          </MyAppText>
        </Pressable>
      </View>

      <View style={styles.videoArea} onLayout={onContainerLayout}>
        {videoSize && <VideoView style={{ width: videoSize.width, height: videoSize.height, borderRadius: 10 }} player={player} />}
        {isLoading && (
          <View style={[StyleSheet.absoluteFill, utilStyles.centerVertical]} pointerEvents="none">
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}
      </View>

      {videos.length > 1 && <VideoThumbnailBar videos={videos} currentIndex={index} onSelect={setIndex} />}

      <Pressable onPress={() => onUse(video)}>
        <ThemedButton
          text={`Use for ${displayDate(day)}`}
          Icon={({ iconProps }) => <Ionicons name="checkmark" {...iconProps} />}
          size={18}
          variant="filled"
          style={styles.useButton}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  videoArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  useButton: {
    alignSelf: "center",
    minWidth: 220,
  },
});
