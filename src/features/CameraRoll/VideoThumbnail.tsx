import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { utilStyles } from "../../utils/utilStyles";
import { PhoneMedia } from "./CameraRoll";
import { getCachedThumbnailUri, getVideoThumbnail } from "./thumbnailService";
import { displayDurationFromSecond } from "../../utils/dateTime";

export interface VidThumbnailProps {
  video: PhoneMedia;
  displayHas?: "normal" | "selected" | "unselected";
  onPress?: (event: GestureResponderEvent) => void;
}

export function VidThumbnail({ video, displayHas = "normal", onPress }: VidThumbnailProps) {
  const [thumbnailUri, setThumbnailUri] = useState<string>(getCachedThumbnailUri(video.id));
  const [refreshCount, setRefreshCount] = useState<number>(0);
  const thumbnailUriWithRefresh = thumbnailUri + `?refresh=${refreshCount}`;
  const { width } = useWindowDimensions();
  const thumbnailSize = width / 5;

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
    <TouchableOpacity style={{ height: thumbnailSize, width: thumbnailSize, padding: 1 }} onPress={onPress}>
      {/* Centered spinner (showd if thumbnailUri doesn't exist) */}
      {/* todo: set color from theme */}
      <View style={[utilStyles.hw100, utilStyles.centerVertical]}>
        <ActivityIndicator size="small" color="white" />
      </View>

      {/* Gray background for unselected video */}
      {displayHas === "unselected" && (
        <Image source={{ uri: thumbnailUriWithRefresh }} style={[styles.thumbnail, { tintColor: "#2e2e2e" }]} />
      )}

      {/* Thumbnail */}
      <Image
        source={{ uri: thumbnailUriWithRefresh }}
        style={[
          styles.thumbnail,
          displayHas === "selected" ? styles.selected : undefined,
          displayHas === "unselected" ? { opacity: 0.3 } : undefined,
        ]}
      />

      {/* Selected badge */}
      {displayHas === "selected" && (
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
