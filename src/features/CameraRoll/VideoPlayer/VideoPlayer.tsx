import EvilIcons from "@expo/vector-icons/EvilIcons";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ResizeMode, Video } from "expo-av";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeTabBarZone } from "../../../components/SafeTabBarZone";
import { LinkIconRoundButton } from "../../../components/ThemedButton";
import { VideoPlayerURI } from "../../../navigation";
import { CameraRollStackParamList } from "../../../navigation/CameraRollNavigation";

type VideoPlayerRouteProps = RouteProp<CameraRollStackParamList, "VideoPlayer">;

const nextPrevButtonSize = 50;

export function VideoPlayer() {
  const { params } = useRoute<VideoPlayerRouteProps>();
  const [videoInfo, setVideoInfo] = useState<MediaLibrary.AssetInfo>();

  async function getVideo() {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(params.ids[params.index]);
      setVideoInfo(info);
      console.log("new video loaded");
    } catch (e) {
      console.error("can't load video");
    }
  }
  console.log("index:", params.index);

  useEffect(() => {
    getVideo();
  }, [params.index]);

  const hasPreviousVideos = params.index > 0;
  const hasNextVideos = params.index < params.ids.length - 1;

  return (
    <View style={{ display: "flex", height: "100%" }}>
      {/* Video player, taking all the remaining space */}
      {videoInfo && videoInfo.localUri && (
        <Video
          style={styles.video}
          source={{ uri: videoInfo.localUri }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
        />
      )}

      {/* Toolbar */}
      <View style={styles.toolBar}>
        {/* Next video of the day button */}
        {hasPreviousVideos && (
          <LinkIconRoundButton
            style={{ alignSelf: "center" }}
            to={{ screen: VideoPlayerURI, params: { ...params, index: params.index - 1 } }}
            childProps={{
              Icon: ({ theme: { colors } }) => (
                <EvilIcons name="arrow-left" size={nextPrevButtonSize} color={colors.text} />
              ),
              size: nextPrevButtonSize + 5,
            }}
          />
        )}
        {!hasPreviousVideos && <View />}

        {/* Previous video of the day button */}
        {hasNextVideos && (
          <LinkIconRoundButton
            style={{ alignSelf: "center" }}
            to={{ screen: VideoPlayerURI, params: { ...params, index: params.index + 1 } }}
            childProps={{
              Icon: ({ theme: { colors } }) => (
                <EvilIcons name="arrow-right" size={nextPrevButtonSize} color={colors.text} />
              ),
              size: nextPrevButtonSize + 5,
            }}
          />
        )}
        {!hasNextVideos && <View />}
      </View>
      <SafeTabBarZone />
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    flexGrow: 1,
    borderColor: "white",
    borderWidth: 3,
    borderRadius: 10,
    margin: 20,
  },
  toolBar: {
    height: 80,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
});
