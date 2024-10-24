import { VideoThumbnailsResult } from "expo-video-thumbnails";
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
import { getVideoThumbnail } from "./mediaService";

export interface VidThumbnailProps {
  video: PhoneMedia;
  displayHas?: "normal" | "selected" | "unselected";
  onPress?: (event: GestureResponderEvent) => void;
}

export function VidThumbnail({ video, displayHas = "normal", onPress }: VidThumbnailProps) {
  const [thumbnail, setThumbnail] = useState<VideoThumbnailsResult>();
  const { width } = useWindowDimensions();
  const thumbnailSize = width / 5;

  useEffect(() => {
    handleThumbnail();
  }, [video]);

  async function handleThumbnail() {
    const newThumbnail = await getVideoThumbnail(video);
    setThumbnail(newThumbnail);
  }

  return (
    <TouchableOpacity style={{ height: thumbnailSize, width: thumbnailSize, padding: 1 }} onPress={onPress}>
      {/* Loader */}
      {!thumbnail && (
        <View style={[{ height: "100%", width: "100%", backgroundColor: "white" }, utilStyles.center]}>
          <ActivityIndicator size="small" color="black" />
        </View>
      )}
      {thumbnail && (
        <>
          {displayHas == "unselected" && (
            <>
              <Image source={{ uri: thumbnail.uri }} style={[styles.thumbnail, { tintColor: "#2e2e2e" }]} />
              <Image
                source={{ uri: thumbnail.uri }}
                style={[styles.thumbnail, { position: "absolute", opacity: 0.3 }]}
              />
            </>
          )}
          {displayHas != "unselected" && (
            <>
              <Image
                source={{ uri: thumbnail.uri }}
                style={[styles.thumbnail, displayHas === "selected" ? styles.selected : undefined]}
              />
              {displayHas === "selected" && (
                <MyAppText style={styles.selectedIcon} size={13}>
                  ✅
                </MyAppText>
              )}
            </>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    height: "100%",
    width: "100%",
  },
  selected: {
    borderWidth: 2,
    borderColor: "green",
  },
  notSelected: {
    tintColor: "gray",
  },
  selectedIcon: {
    position: "absolute",
    right: 3,
    bottom: 5,
  },
});
