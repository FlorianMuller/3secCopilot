import EvilIcons from "@expo/vector-icons/EvilIcons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useEvent } from "expo";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { NavigationTitle } from "../../../components/NavigationTitle";
import { SafeTabBarZone } from "../../../components/SafeTabBarZone";
import { LinkIconRoundButton, ThemedButton } from "../../../components/ThemedButton";
import { VideoMetadata } from "../../../db/schema";
import { VideoPlayerURI } from "../../../navigation";
import { CameraRollStackParamList } from "../../../navigation/CameraRollNavigation";
import { isVideoDayShifted } from "../../../services/dayShift";
import { getLocalUri } from "../../../services/mediaLocalUri";
import preferences from "../../../services/preferences";
import { getVideoMetadata, markVideoAsSelected, markVideoAsUnselected } from "../../../services/selection";
import { displayDate, displayShortDate, displayTime } from "../../../utils/dateTime";
import { VideoBar } from "./VideoBar";

export type VideoPlayerRouteProps = RouteProp<CameraRollStackParamList, "VideoPlayer">;

const nextPrevButtonSize = 50;

export function VideoPlayer() {
  const navigation = useNavigation();
  const { params } = useRoute<VideoPlayerRouteProps>();
  const { width: screenWidth } = useWindowDimensions();
  const id = params.ids[params.index];
  const { dayShift } = preferences.useDayShiftPreference();

  const player = useVideoPlayer({}, (player) => {
    player.audioMixingMode = "duckOthers";
    player.timeUpdateEventInterval = 0.01;
  });

  // Listen for player status changes to know when video is loaded
  const { status, error } = useEvent(player, "statusChange", { status: player.status });
  console.log("Player status:", status, "Error:", error);

  const [videoInfo, setVideoInfo] = useState<MediaLibrary.AssetInfo>();
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>();
  const [videoContainerHeight, setVideoContainerHeight] = useState<number | null>(null);

  // Pause video before navigating out
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      player.pause();
      player.release();
    });

    return unsubscribe;
  }, [navigation, player]);

  async function getVideo() {
    try {
      console.log("Loading video for ID:", id);
      const info = await MediaLibrary.getAssetInfoAsync(id);
      console.log("Video info loaded:", info);
      setVideoInfo(info);

      const uri = getLocalUri(info);
      console.log("Using URI:", uri);

      // Use replaceAsync instead of replace
      await player.replaceAsync({
        uri: uri,
      });
      console.log("Video replaced, duration:", player.duration);

      player.play();
      console.log("Video play called");
    } catch (e) {
      console.error("can't load video", e);
    }
  }

  async function getMetadata() {
    try {
      const meta = await getVideoMetadata(id);
      setVideoMetadata(meta);
    } catch (e) {
      console.error("can't retrieve metadata", e);
    }
  }

  // Get video and metadata when selected id change
  useEffect(() => {
    getVideo();
    getMetadata();
  }, [params.ids, params.index]);

  // Set page title
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => {
        const videoDate = videoInfo && new Date(videoInfo.creationTime);
        const isShifted = videoDate && dayShift != undefined && isVideoDayShifted(videoDate, dayShift);
        const shiftedText = isShifted ? `(${displayShortDate(videoDate)})` : "";
        return (
          <NavigationTitle
            title={displayDate(new Date(params.day))}
            subTitle={videoDate === undefined ? " " : displayTime(videoDate)}
            rightSubTItle={shiftedText}
          />
        );
      },
    });
  }, [params.day, videoInfo, dayShift]);

  async function toggleSelectVideo(videoInfo: MediaLibrary.AssetInfo, videoMetadata: VideoMetadata | null) {
    if (videoMetadata?.isSelected) {
      console.log("Unselecting video");
      try {
        const newMetadata = await markVideoAsUnselected(id);
        if (newMetadata != null) {
          setVideoMetadata(newMetadata);
        }
      } catch (e) {
        console.error("error while unselecting video", e);
      }
    } else {
      console.log("Selecting video");
      try {
        const newMetadata = await markVideoAsSelected(id, new Date(videoInfo.creationTime), new Date(params.day));
        if (newMetadata != null) {
          setVideoMetadata(newMetadata);
        }
      } catch (e) {
        console.error("error while selecting video", e);
      }
    }
  }

  const hasPreviousVideos = params.index > 0;
  const hasNextVideos = params.index < params.ids.length - 1;

  return (
    <View style={{ display: "flex", height: "100%" }}>
      {/* Video player, taking all the remaining space */}
      <View
        style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
        onLayout={(e) => setVideoContainerHeight(e.nativeEvent.layout.height)}
      >
        <VideoView
          style={[
            styles.video,
            videoInfo?.width && videoInfo?.height && videoContainerHeight
              ? {
                  height: Math.min((videoInfo.height / videoInfo.width) * screenWidth, videoContainerHeight),
                }
              : {},
          ]}
          player={player}
        />
      </View>

      {/* Only render VideoBar if player.duration > 0 */}
      {player.duration > 0 && (status === "readyToPlay" || status === "loading")
        ? (() => {
            console.log("Rendering VideoBar with duration", player.duration, "status", status);
            return <VideoBar player={player} />;
          })()
        : (() => {
            console.log("Waiting for video to load, duration:", player.duration, "status:", status);
            return (
              <View style={{ alignItems: "center", margin: 20 }}>
                <ThemedButton text={`Loading video... (${status})`} />
              </View>
            );
          })()}

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

        {/* Select button */}
        <View>
          {videoInfo && videoMetadata !== undefined && (
            <Pressable onPress={() => toggleSelectVideo(videoInfo, videoMetadata)}>
              <ThemedButton text={videoMetadata?.isSelected ? "Unselect" : "Select"} />
            </Pressable>
          )}
        </View>

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
    width: "100%",
  },
  toolBar: {
    height: 80,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
});
