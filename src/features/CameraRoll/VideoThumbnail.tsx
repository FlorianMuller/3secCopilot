import { useNavigation } from "@react-navigation/native";
import { VideoThumbnailsResult } from "expo-video-thumbnails";
import { useEffect, useState } from "react";
import { useWindowDimensions, View, Image, TouchableOpacity, GestureResponderEvent } from "react-native";
import { VideoPlayerURI } from "../../navigation";
import { PhoneMedia } from "./CameraRoll";
import { getVideoThumbnail } from "./mediaService";

export interface VidThumbnailProps {
  video: PhoneMedia;
  onPress?: (event: GestureResponderEvent) => void;
}

export function VidThumbnail({ video, onPress }: VidThumbnailProps) {
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
      {thumbnail && <Image source={{ uri: thumbnail.uri }} style={{ height: "100%", width: "100%" }} />}
      {!thumbnail && <View style={{ height: "100%", width: "100%", backgroundColor: "white" }} />}
    </TouchableOpacity>
  );
}
