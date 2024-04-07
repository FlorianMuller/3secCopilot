import { RouteProp, useRoute } from "@react-navigation/native";
import { CameraRollStackParamList } from "../../../navigation/CameraRollNavigation";
import { View, StyleSheet } from "react-native";
import { ResizeMode, Video } from "expo-av";
import { useEffect, useState } from "react";
import * as MediaLibrary from "expo-media-library";

type VideoPlayerRouteProps = RouteProp<CameraRollStackParamList, "VideoPlayer">;

export function VideoPlayer() {
  const { params } = useRoute<VideoPlayerRouteProps>();
  const [videoInfo, setVideoInfo] = useState<MediaLibrary.AssetInfo>();

  async function getVideo() {
    const info = await MediaLibrary.getAssetInfoAsync(params.ids[params.index]);
    setVideoInfo(info);
  }

  useEffect(() => {
    getVideo();
  }, []);

  return (
    <View>
      {videoInfo && videoInfo.localUri && (
        <Video
          style={styles.video}
          source={{ uri: videoInfo.localUri }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    width: "100%",
    height: "100%",
  },
});
