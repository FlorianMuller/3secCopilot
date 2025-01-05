import { useEvent } from "expo";
import { VideoPlayer } from "expo-video";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MyAppText } from "../../../components/text/MyAppText";
import { displayDurationFromSecond } from "../../../utils/dateTime";
import { utilStyles } from "../../../utils/utilStyles";

const seekerWidth = 10;

export interface VideoBarProps {
  player: VideoPlayer;
}

export function VideoBar({ player }: VideoBarProps) {
  // Get video current time
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: player.currentLiveTimestamp,
    currentOffsetFromLive: player.currentOffsetFromLive,
  });

  // Animate Bar
  const barRef = useAnimatedRef<View>();
  const isPressed = useSharedValue(false);
  const xStart = useSharedValue(0);
  const xOffset = useSharedValue(0);
  // const seekBy = player.seekBy;

  const pan = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
    })
    .onChange((e) => {
      const barSize = measure(barRef);
      let newOffset = xStart.value + e.translationX;
      if (newOffset < 0) {
        newOffset = 0;
      }
      if (barSize) {
        const maxOffset = barSize.width - seekerWidth;
        if (newOffset > maxOffset) {
          newOffset = maxOffset;
        }
      }

      xOffset.value = newOffset;
      // xOffset.value = writhClamp({ min: 0, max: 300 }, xStart.value + e.translationX);
    })
    .onFinalize(() => {
      isPressed.value = false;
      xStart.value = xOffset.value;

      // if (videoInfo) {
      //   const barLenght = 280;
      //   const newVideoPos = (videoInfo.duration * offset.value.x) / barLenght;
      //   console.log("duration", videoInfo.duration);
      //   console.log("newVideoPos", newVideoPos);
      //   console.log("player", player);
      //   runOnJS(setMyText)("WEEEEESH");
      //   runOnJS(seekBy)(newVideoPos);
      //   // player.pause();
      //   // player.replay();
      //   // player.play();
      // }
    });

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: xOffset.value }, { scale: withTiming(isPressed.value ? 1.2 : 1) }],
    backgroundColor: isPressed.value ? "yellow" : "white",
  }));

  // const textDerived = useDerivedValue(() => {
  //   const barSize = measure(barRef) ?? { width: 100 };
  //   const maxOffset = barSize.width - seekerWidth;

  //   return `(${Math.round(xOffset.value)}/${maxOffset})`;
  // });

  return (
    <View>
      <MyAppText>{`${displayDurationFromSecond(currentTime)}/${displayDurationFromSecond(player.duration)}`}</MyAppText>
      {/* <ReText text={textDerived} style={{ color: "white" }} /> */}
      <View
        ref={barRef}
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
                width: seekerWidth,
                position: "relative",
                borderRadius: 100,
              },
              animatedStyles,
            ]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ball: {
    width: 100,
    height: 100,
    borderRadius: 100 / 2,
    backgroundColor: "blue",
    alignSelf: "center",
  },
});
