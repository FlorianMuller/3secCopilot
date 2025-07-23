import { AVPlaybackStatus, Video } from "expo-av";
import React, { useState } from "react";
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
  videoRef: Video | null;
  playbackStatus: AVPlaybackStatus | null;
}

export function VideoBar({ videoRef, playbackStatus }: VideoBarProps) {
  // Get video current time from playback status
  const currentTime = playbackStatus?.isLoaded ? (playbackStatus.positionMillis || 0) / 1000 : 0;
  const duration = playbackStatus?.isLoaded ? (playbackStatus.durationMillis || 0) / 1000 : 0;
  const [isDragging, setIsDragging] = useState(false);

  // Update bar position based on current time
  const startTrim = 0;
  const endTrim = 10000;
  
  // Update bar position when currentTime changes (but not while dragging)
  React.useEffect(() => {
    if (duration > 0 && !isDragging) {
      const position = (barLength * currentTime) / duration;
      xOffset.value = position;
    }
  }, [currentTime, duration, isDragging]);

  // Animate Bar
  const barRef = useAnimatedRef<View>();
  const isPressed = useSharedValue(false);
  const xStart = useSharedValue(0);
  const xOffset = useSharedValue(0);
  // const seekBy = player.seekBy;
  const currentTimeFromBar = useSharedValue(0);

  async function setCurrentTime(newTime: number) {
    if (videoRef) {
      await videoRef.setPositionAsync(newTime * 1000, {
        toleranceBefore: 0,
        toleranceAfter: 0,
      });
    }
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
      setIsDragging(true);
      if (videoRef) {
        videoRef.pauseAsync();
      }
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

      const newVideoPos = (duration * xOffset.value) / barLength;
      // More frequent seeking during drag for smoother scrubbing
      setCurrentTime(newVideoPos);
    })
    .onFinalize(() => {
      isPressed.value = false;
      setIsDragging(false);
      xStart.value = xOffset.value;

      const newVideoPos = (duration * xOffset.value) / barLength;
      currentTimeFromBar.value = newVideoPos;
      setCurrentTime(newVideoPos);
      if (videoRef) {
        videoRef.playAsync();
      }
    })
    .runOnJS(true)
    .minDistance(0);

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: xOffset.value }, { scale: withTiming(isPressed.value ? 1.2 : 1) }],
    backgroundColor: isPressed.value ? "yellow" : "white",
  }));

  return (
    <View>
      <MyAppText>{`${displayDurationFromSecond(currentTime)}/${displayDurationFromSecond(duration)}`}</MyAppText>
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
