import { useEffect, useState } from "react";
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
import { displayDurationFromSecond } from "../../utils/dateTime";

export interface VidThumbnailProps {
  video: PhoneMedia;
  displayAs?: "normal" | "selected" | "unselected";
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function VidThumbnail({ video, displayAs = "normal", onPress, size, style }: VidThumbnailProps) {
  const [thumbnailUri, setThumbnailUri] = useState<string>(getCachedThumbnailUri(video.id));
  const [refreshCount, setRefreshCount] = useState<number>(0);
  const thumbnailUriWithRefresh = thumbnailUri + `?refresh=${refreshCount}`;
  const { width } = useWindowDimensions();
  const thumbnailSize = size ?? width / 5;

  useEffect(() => {
    handleThumbnail();
  }, [video]);

  async function handleThumbnail() {
    const newThumbnailResult = await getVideoThumbnail(video);

    // Thumnail was generated, we need to refresh the <Image> uri to load the image
    if (newThumbnailResult.status === "generatedAndCached") {
      setRefreshCount((oldRefresh) => oldRefresh + 1);
    }

    // Cache failed, use uri of generated thumbnail directly
    if (newThumbnailResult.status === "generatedAndCachedFailed" && newThumbnailResult.uri) {
      setThumbnailUri(newThumbnailResult.uri);
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
      {/* Centered spinner (showd if thumbnailUri doesn't exist) */}
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
        style={[
          styles.thumbnail,
          displayAs === "selected" ? styles.selected : undefined,
          displayAs === "unselected" ? { opacity: 0.3 } : undefined,
        ]}
      />

      {/* Selected badge */}
      {displayAs === "selected" && (
        <MyAppText style={styles.selectedIcon} size={13}>
          ✅
        </MyAppText>
      )}
      <MyAppText style={styles.videoDuration} size={13} weight={600}>
        {displayDurationFromSecond(video.duration)}
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
  selected: {
    borderWidth: 2,
    borderColor: "green",
  },
  notSelected: {
    tintColor: "gray",
  },
  videoDuration: {
    position: "absolute",
    right: 5,
    bottom: 5,
  },
  selectedIcon: {
    position: "absolute",
    right: 5,
    top: 4,
  },
});
