import { useEvent, useEventListener } from "expo";
import { VideoPlayer } from "expo-video";
import { useState } from "react";
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
const barLength = 283;

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

  // Limit video to selected trim part
  const startTrim = 0;
  const endTrim = 10000;
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime < startTrim) {
      console.log("Before", startTrim);
      player.currentTime = startTrim;
    }
    if (currentTime > endTrim) {
      console.log("after", endTrim);
      player.pause();
      player.currentTime = endTrim;
    }

    const barLength = 283;
    const position = (barLength * currentTime) / player.duration;
    xOffset.value = position;
  });

  // Animate Bar
  const barRef = useAnimatedRef<View>();
  const isPressed = useSharedValue(false);
  const xStart = useSharedValue(0);
  const xOffset = useSharedValue(0);
  // const seekBy = player.seekBy;
  const currentTimeFromBar = useSharedValue(0);

  function setCurrentTime(newTime: number) {
    player.currentTime = newTime;
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;

      // todo: run on js
      player.pause();
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

      // todo: run on js
      const newVideoPos = (player.duration * xOffset.value) / barLength;
      setCurrentTime(newVideoPos);
    })
    .onFinalize(() => {
      isPressed.value = false;
      xStart.value = xOffset.value;
      barLength;

      // todo: run on js
      const newVideoPos = (player.duration * xOffset.value) / barLength;
      currentTimeFromBar.value = newVideoPos;
      setCurrentTime(newVideoPos);
      player.play();

      // runOnJS(setCurrentTime)(newVideoPos);
      // runOnJS(setMyText)("Changed from UI Lezgo");
    })
    .runOnJS(true);

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: xOffset.value }, { scale: withTiming(isPressed.value ? 1.2 : 1) }],
    backgroundColor: isPressed.value ? "yellow" : "white",
  }));

  return (
    <View>
      <MyAppText>{`${displayDurationFromSecond(currentTime)}/${displayDurationFromSecond(player.duration)}`}</MyAppText>
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
