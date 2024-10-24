import { useNavigation } from "@react-navigation/native";
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
import { VideoPlayerURI } from "../../navigation";
import { PhoneMedia } from "./CameraRoll";
import { getVideoThumbnail } from "./mediaService";
import { utilStyles } from "../../utils/utilStyles";

export interface VidThumbnailProps {
  video: PhoneMedia;
  selected?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
}

export function VidThumbnail({ video, selected = false, onPress }: VidThumbnailProps) {
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
      {thumbnail && (
        <Image source={{ uri: thumbnail.uri }} style={[styles.thumbnail, selected ? styles.selected : undefined]} />
      )}
      {!thumbnail && (
        <View style={[{ height: "100%", width: "100%", backgroundColor: "white" }, utilStyles.center]}>
          <ActivityIndicator size="small" color="black" />
        </View>
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
    borderWidth: 1,
    borderColor: "green",
  },
});
