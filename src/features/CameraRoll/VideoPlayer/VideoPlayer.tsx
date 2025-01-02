import EvilIcons from "@expo/vector-icons/EvilIcons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { ResizeMode, Video } from "expo-av";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { NavigationTitle } from "../../../components/NavigationTitle";
import { SafeTabBarZone } from "../../../components/SafeTabBarZone";
import { LinkIconRoundButton, ThemedButton } from "../../../components/ThemedButton";
import { VideoMetadata } from "../../../db/schema";
import { VideoPlayerURI } from "../../../navigation";
import { CameraRollStackParamList } from "../../../navigation/CameraRollNavigation";
import { isVideoDayShifted } from "../../../services/dayShift";
import preferences from "../../../services/preferences";
import { getVideoMetadata, markVideoAsSelected, markVideoAsUnselected } from "../../../services/selection";
import { displayDate, displayShortDate, displayTime } from "../../../utils/dateTime";
import { utilStyles } from "../../../utils/utilStyles";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useVideoPlayer, VideoView } from "expo-video";
import { MyAppText } from "../../../components/text/MyAppText";

export type VideoPlayerRouteProps = RouteProp<CameraRollStackParamList, "VideoPlayer">;

const nextPrevButtonSize = 50;

export function VideoPlayer() {
  const navigation = useNavigation();
  const { params } = useRoute<VideoPlayerRouteProps>();
  const id = params.ids[params.index];
  const { dayShift } = preferences.useDayShiftPreference();

  const [videoInfo, setVideoInfo] = useState<MediaLibrary.AssetInfo>();
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>();
  const [myText, setMyText] = useState<string>("HELLOOO");

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  const videoPlayerRef = useRef(null);
  const player = useVideoPlayer({});
  const seekBy = player.seekBy;

  const isPressed = useSharedValue(false);
  const start = useSharedValue({ x: 0, y: 0 });
  const offset = useSharedValue({ x: 0, y: 0 });

  const pan = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
    })
    .onChange((e) => {
      offset.value = {
        x: e.translationX + start.value.x,
        y: e.translationY + start.value.y,
      };
    })
    .onFinalize(() => {
      console.log("start", start.value);
      console.log("offset", offset.value);
      isPressed.value = false;
      start.value = {
        x: offset.value.x,
        y: offset.value.y,
      };
      if (videoInfo) {
        const barLenght = 280;
        const newVideoPos = (videoInfo.duration * offset.value.x) / barLenght;
        console.log("duration", videoInfo.duration);
        console.log("newVideoPos", newVideoPos);
        console.log("player", player);
        runOnJS(setMyText)("WEEEEESH");
        runOnJS(seekBy)(newVideoPos);
        // player.pause();
        // player.replay();
        // player.play();
      }
    });

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value.x }, { scale: withTiming(isPressed.value ? 1.2 : 1) }],
    backgroundColor: isPressed.value ? "yellow" : "white",
  }));

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  async function getVideo() {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(id);
      setVideoInfo(info);
      console.log("uri", info.uri);
      console.log("localUri", info.localUri);
      console.log("filename", info.filename);
      // const a = require(info.localUri);
      player.replace({
        uri: info.localUri,
      });
      console.log("player", player);

      player.play();
      player.pause();
      player.seekBy(2);
      // player.replay();
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

  useEffect(() => {
    getVideo();
    getMetadata();
  }, [params.ids, params.index]);

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
      <VideoView
        // nativeControls={false}
        style={[styles.video]}
        ref={videoPlayerRef}
        player={player}
      />
      {videoInfo && videoInfo.localUri && (
        <>
          {/* <Video
            style={styles.video}
            source={{ uri: videoInfo.localUri }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            ref={videoPlayerRef}
          /> */}
        </>
      )}

      <View
        style={[
          {
            height: 10,
            width: "auto",
            backgroundColor: "gray",
            marginHorizontal: 50,
            marginVertical: 20,
            borderRadius: 100,
          },
          utilStyles.ListRow,
        ]}
      >
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                height: 50,
                width: 10,
                position: "relative",
                borderRadius: 100,
              },
              animatedStyles,
            ]}
          />
        </GestureDetector>
      </View>

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
        <View>
          <MyAppText>{myText}</MyAppText>
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
