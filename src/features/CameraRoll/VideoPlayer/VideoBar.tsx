import { useEvent, useEventListener } from "expo";
import { VideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Animated, { useAnimatedRef, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MyAppText } from "../../../components/text/MyAppText";
import { displayDurationFromSecond } from "../../../utils/dateTime";
import { utilStyles } from "../../../utils/utilStyles";

const seekerWidth = 10;
const barLength = 283;

export interface VideoBarProps {
  player: VideoPlayer;
}

export function VideoBar({ player }: VideoBarProps) {
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: player.currentLiveTimestamp,
    currentOffsetFromLive: player.currentOffsetFromLive,
  });

  const barRef = useAnimatedRef<View>();
  const isPressed = useSharedValue(false);
  const [isPressedJS, setIsPressedJS] = useState(false);

  const xStart = useSharedValue(0);
  const xOffset = useSharedValue(0);
  const currentTimeFromBar = useSharedValue(0);

  const barWidthRef = useRef(barLength);
  const barWidthShared = useSharedValue(barLength);

  const safePlayer = player ?? { duration: 1, pause: () => {}, play: () => {}, currentTime: 0 };

  // Only update xOffset from JS when not scrubbing and when duration and bar width are valid
  useEffect(() => {
    if (
      !isPressedJS &&
      typeof player?.duration === "number" &&
      player.duration > 0 &&
      typeof currentTime === "number"
    ) {
      const barWidth = barWidthRef.current > 0 ? barWidthRef.current : barLength;
      const position = (barWidth * currentTime) / player.duration;
      if (isFinite(position) && !isNaN(position)) {
        xOffset.value = position;
        xStart.value = position;
      }
    }
  }, [currentTime, player?.duration, isPressedJS]);

  // Limit video to selected trim part
  const startTrim = 0;
  const endTrim = 10000;
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (typeof currentTime !== "number") return;
    if (currentTime < startTrim) {
      player.currentTime = startTrim;
    }
    if (currentTime > endTrim) {
      player.pause();
      player.currentTime = endTrim;
    }
  });

  // PanResponder for scrubbing
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsPressedJS(true);
        player.pause();
      },
      onPanResponderMove: (_, gestureState) => {
        const barWidth = barWidthRef.current > 0 ? barWidthRef.current : barLength;
        if (!barWidth || barWidth <= 0) return;

        let newOffset = xStart.value + gestureState.dx;
        if (newOffset < 0) newOffset = 0;
        const maxOffset = barWidth - seekerWidth;
        if (newOffset > maxOffset) newOffset = maxOffset;
        xOffset.value = newOffset;

        if (typeof player?.duration === "number" && player.duration > 0 && barWidth > 0) {
          const newVideoPos = (player.duration * xOffset.value) / barWidth;
          if (isFinite(newVideoPos) && !isNaN(newVideoPos)) {
            player.currentTime = newVideoPos;
          }
        }
      },
      onPanResponderRelease: () => {
        const barWidth = barWidthRef.current > 0 ? barWidthRef.current : barLength;
        setIsPressedJS(false);
        xStart.value = xOffset.value;

        if (typeof player?.duration === "number" && player.duration > 0 && barWidth > 0) {
          const newVideoPos = (player.duration * xOffset.value) / barWidth;
          if (isFinite(newVideoPos) && !isNaN(newVideoPos)) {
            currentTimeFromBar.value = newVideoPos;
            player.currentTime = newVideoPos;
            player.play();
          }
        }
      },
    })
  ).current;

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: xOffset.value }, { scale: withTiming(isPressed.value ? 1.2 : 1) }],
    backgroundColor: isPressed.value ? "yellow" : "white",
  }));

  return (
    <View>
      <MyAppText>
        {`${displayDurationFromSecond(currentTime)}/${displayDurationFromSecond(
          typeof safePlayer.duration === "number" && isFinite(safePlayer.duration) ? safePlayer.duration : 0
        )}`}
      </MyAppText>
      <View
        ref={barRef}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          if (width > 0) {
            barWidthRef.current = width;
            barWidthShared.value = width;
          }
        }}
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
        {...panResponder.panHandlers}
      >
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
