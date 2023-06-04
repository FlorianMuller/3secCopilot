import { VideoThumbnailsResult } from "expo-video-thumbnails";
import { useEffect, useState } from "react";
import { useWindowDimensions, View, Image } from "react-native";
import { PhoneMedia } from "./CameraRoll";
import { getVideoThumbnail } from "./mediaService";

export interface VidThumbnailProps {
  video: PhoneMedia;
}

export function VidThumbnail({ video }: VidThumbnailProps) {
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
    <View style={{ height: thumbnailSize, width: thumbnailSize, padding: 1 }}>
      {thumbnail && <Image source={{ uri: thumbnail.uri }} style={{ height: "100%", width: "100%" }} />}
      {!thumbnail && <View style={{ height: "100%", width: "100%", backgroundColor: "white" }} />}
    </View>
  );
}
