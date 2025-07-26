import EvilIcons from "@expo/vector-icons/EvilIcons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useEvent } from "expo";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type EventSubscription } from "react-native";
import * as FileSystem from "expo-file-system";
import { isValidFile, showEditor } from "react-native-video-trim";
import videoTrim from "react-native-video-trim";
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
  const id = params.ids[params.index];
  const { dayShift } = preferences.useDayShiftPreference();

  const player = useVideoPlayer({}, (player) => {
    player.audioMixingMode = "duckOthers";
    player.timeUpdateEventInterval = 0.01;
  });
  // todo: show video player error
  // const { status, error } = useEvent(player, "statusChange", { status: player.status });

  const [videoInfo, setVideoInfo] = useState<MediaLibrary.AssetInfo>();
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>();

  // Pause video before navigating out
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      player.pause();
      player.release();
    });

    return unsubscribe;
  }, [navigation, player]);

  // Video trim event listeners
  const listenerSubscription = useRef<Record<string, EventSubscription>>({});
  useEffect(() => {
    listenerSubscription.current.onLoad = videoTrim.onLoad(({ duration }) => console.log("onLoad", duration));

    listenerSubscription.current.onStartTrimming = videoTrim.onStartTrimming(() => console.log("onStartTrimming"));

    listenerSubscription.current.onCancelTrimming = videoTrim.onCancelTrimming(() => console.log("onCancelTrimming"));
    listenerSubscription.current.onCancel = videoTrim.onCancel(() => console.log("onCancel"));
    listenerSubscription.current.onHide = videoTrim.onHide(() => console.log("onHide"));
    listenerSubscription.current.onShow = videoTrim.onShow(() => console.log("onShow"));
    listenerSubscription.current.onFinishTrimming = videoTrim.onFinishTrimming(
      ({ outputPath, startTime, endTime, duration }) =>
        console.log(
          "onFinishTrimming",
          `outputPath: ${outputPath}, startTime: ${startTime}, endTime: ${endTime}, duration: ${duration}`
        )
    );
    // listenerSubscription.current.onLog = videoTrim.onLog(({ level, message, sessionId }) =>
    //   console.log("onLog", `level: ${level}, message: ${message}, sessionId: ${sessionId}`)
    // );
    // listenerSubscription.current.onStatistics = videoTrim.onStatistics(
    //   ({ sessionId, videoFrameNumber, videoFps, videoQuality, size, time, bitrate, speed }) =>
    //     console.log(
    //       "onStatistics",
    //       `sessionId: ${sessionId}, videoFrameNumber: ${videoFrameNumber}, videoFps: ${videoFps}, videoQuality: ${videoQuality}, size: ${size}, time: ${time}, bitrate: ${bitrate}, speed: ${speed}`
    //     )
    // );
    listenerSubscription.current.onError = videoTrim.onError(({ message, errorCode }) =>
      console.log("onError", `message: ${message}, errorCode: ${errorCode}`)
    );

    return () => {
      listenerSubscription.current.onLoad?.remove();
      listenerSubscription.current.onStartTrimming?.remove();
      listenerSubscription.current.onCancelTrimming?.remove();
      listenerSubscription.current.onCancel?.remove();
      listenerSubscription.current.onHide?.remove();
      listenerSubscription.current.onShow?.remove();
      listenerSubscription.current.onFinishTrimming?.remove();
      // listenerSubscription.current.onLog?.remove();
      // listenerSubscription.current.onStatistics?.remove();
      listenerSubscription.current.onError?.remove();
      listenerSubscription.current = {};
    };
  });

  async function getVideo() {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(id);
      setVideoInfo(info);
      await player.replaceAsync({
        // uri: info.localUri,
        uri: getLocalUri(info),
      });
      player.play();
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

  async function launchTrimEditor() {
    if (!videoInfo) {
      console.error("Video info is not available, cannot launch editor");
      return;
    }

    try {
      // Use localUri and clean it by removing metadata after #
      const rawLocalUri = videoInfo.localUri;
      const localUri = rawLocalUri?.split("#")[0];
      console.log("Original Video URI:", localUri);

      if (localUri === undefined) {
        console.error("Video local URI is undefined, cannot launch editor");
        return;
      }

      // Copy video to temp directory for trim library access
      const tempDir = FileSystem.documentDirectory + "temp/";
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

      const fileExtension = localUri.split(".").pop() || "mov";
      const tempVideoPath = tempDir + `video_${Date.now()}.${fileExtension}`;

      console.log("Copying video to temp location:", tempVideoPath);
      await FileSystem.copyAsync({
        from: localUri,
        to: tempVideoPath,
      });

      const validResult = await isValidFile(tempVideoPath);
      console.log("Temp video file valid:", validResult);

      if (!validResult.isValid) {
        console.error("Temp video file is not valid, cannot launch editor");
        return;
      }

      console.log("will launch editor with temp file");
      showEditor(tempVideoPath, {
        maxDuration: 20,
      });
      console.log("Trim editor launched for video:", tempVideoPath);
    } catch (error) {
      console.error("Error preparing video for trim editor:", error);
    }
  }

  const hasPreviousVideos = params.index > 0;
  const hasNextVideos = params.index < params.ids.length - 1;

  return (
    <View style={{ display: "flex", height: "100%" }}>
      {/* Video player, taking all the remaining space */}
      <VideoView
        // nativeControls={false}
        style={[styles.video]}
        player={player}
      />

      {/* <VideoBar player={player} /> */}

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

        {/* Select and Trim buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {videoInfo && videoMetadata !== undefined && (
            <Pressable onPress={() => toggleSelectVideo(videoInfo, videoMetadata)}>
              <ThemedButton text={videoMetadata?.isSelected ? "Unselect" : "Select"} />
            </Pressable>
          )}
          {videoInfo && (
            <Pressable onPress={launchTrimEditor}>
              <ThemedButton text="Trim" />
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
