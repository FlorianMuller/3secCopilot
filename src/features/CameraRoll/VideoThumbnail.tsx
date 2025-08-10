import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { utilStyles } from "../../utils/utilStyles";
import { PhoneMedia } from "./CameraRoll";
import { getCachedThumbnailUri, getVideoThumbnail } from "./thumbnailService";
import { ThumbnailPriority } from "../../services/thumbnailQueue";
import { displayDurationFromMilis, displayDurationFromSecond } from "../../utils/dateTime";
import { isVideoTrimmed } from "../../services/trim";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { IconBadge } from "../../components/IconBadge";
import Feather from "@expo/vector-icons/Feather";

export interface VidThumbnailProps {
  video: PhoneMedia;
  displayAs?: "normal" | "unselected";
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  isVisible?: boolean;
}

export function VidThumbnail({ video, displayAs = "normal", onPress, size, style, isVisible = true }: VidThumbnailProps) {
  const [thumbnailUri, setThumbnailUri] = useState<string>(getCachedThumbnailUri(video.id));
  const [refreshCount, setRefreshCount] = useState<number>(0);
  const thumbnailUriWithRefresh = thumbnailUri + `?refresh=${refreshCount}`;
  const { width } = useWindowDimensions();
  const thumbnailSize = size ?? width / 5;
  const theme = useTheme();

  useEffect(() => {
    const abortController = new AbortController();
    
    handleThumbnail(abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [video, isVisible]);

  async function handleThumbnail(signal: AbortSignal) {
    // Determine priority based on visibility
    const priority = isVisible ? ThumbnailPriority.HIGH : ThumbnailPriority.LOW;
    
    try {
      const newThumbnailResult = await getVideoThumbnail(video, { priority, signal });

      // Check if component was unmounted or request was cancelled
      if (signal.aborted) return;

      // Thumnail was generated, we need to refresh the <Image> uri to load the image
      if (newThumbnailResult.status === "generatedAndCached") {
        setRefreshCount((oldRefresh) => oldRefresh + 1);
      }

      // Cache failed, use uri of generated thumbnail directly
      if (newThumbnailResult.status === "generatedAndCachedFailed" && newThumbnailResult.uri) {
        setThumbnailUri(newThumbnailResult.uri);
      }
    } catch (error) {
      if (signal.aborted) return;
      console.error("Thumbnail generation error:", error);
    }

    // Todo: manage generation failed status (show a 'X', a'?' ?)
  }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          height: thumbnailSize,
          width: thumbnailSize,
        },
        style,
      ]}
      onPress={onPress}
    >
      {/* Centered spinner (shown only if thumbnailUri doesn't exist) */}
      {/* todo: set color from theme */}
      <View style={[utilStyles.hw100, utilStyles.centerVertical]}>
        <ActivityIndicator size="small" color="white" />
      </View>

      {/* Gray background for unselected video */}
      {displayAs === "unselected" && (
        <Image source={{ uri: thumbnailUriWithRefresh }} style={[styles.thumbnail, { tintColor: "#2e2e2e" }]} />
      )}

      {/* Thumbnail */}
      <Image
        source={{ uri: thumbnailUriWithRefresh }}
        style={[styles.thumbnail, displayAs === "unselected" ? { opacity: 0.3 } : undefined]}
      />

      {/* Trim badge */}
      {video.metadata && isVideoTrimmed(video.metadata) && (
        <IconBadge
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              borderRadius: 0,
              borderBottomRightRadius: 9,
            },
          ]}
          Icon={({ size, theme }) => <Ionicons name="cut" size={size} color={theme.colors.textOnPrimary} />}
        />
      )}

      {/* Selected badge */}
      {video.metadata?.isSelected && (
        <IconBadge
          style={[
            {
              borderRadius: 0,
              borderBottomLeftRadius: 9,
            },
            styles.topRight,
          ]}
          backgroundColor={theme.colors.accent}
          Icon={({ size, theme }) => <Feather name="check" size={size} color={theme.colors.textOnPrimary} />}
        />
      )}

      <MyAppText style={styles.videoDuration} size={13} weight={600}>
        {video.metadata && isVideoTrimmed(video.metadata)
          ? displayDurationFromMilis(video.metadata.trimEndTime - video.metadata.trimStartTime)
          : displayDurationFromSecond(video.duration)}
      </MyAppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnail: {
    height: "100%",
    width: "100%",
    position: "absolute",
  },
  notSelected: {
    tintColor: "gray",
  },
  videoDuration: {
    position: "absolute",
    right: 5,
    bottom: 5,
  },
  topRight: {
    position: "absolute",
    right: 0,
    top: 0,
  },
});
