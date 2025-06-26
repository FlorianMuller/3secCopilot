import { useEvent } from "expo";
import { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MyAppText } from "../../../components/text/MyAppText";
import { displayDurationFromSecond } from "../../../utils/dateTime";
import { utilStyles } from "../../../utils/utilStyles";

const seekerWidth = 10;
const DEFAULT_BAR_LENGTH = 283;

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

  // --- Bar length (dynamic, useRef for consistency) ---
  const barLengthRef = useRef(DEFAULT_BAR_LENGTH);
  const [, forceRerender] = useState(0); // Used to force re-render on layout
  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    barLengthRef.current = width;
    forceRerender((v) => v + 1); // Force re-render so all calculations use the new width
    console.log("Bar layout:", {
      width,
      x: e.nativeEvent.layout.x,
      y: e.nativeEvent.layout.y,
      height: e.nativeEvent.layout.height,
    });
  }, []);

  // --- Scrubber position ---
  const scrubberOffset = useSharedValue(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [displayedTime, setDisplayedTime] = useState(0);
  const startOffset = useRef(0);

  // Update scrubber position when video time changes (when not scrubbing)
  useEffect(() => {
    const barLength = barLengthRef.current;
    if (!isScrubbing && player.duration > 0 && barLength > 0) {
      const maxOffset = barLength - seekerWidth;
      const pos = (maxOffset * player.currentTime) / player.duration;
      if (!isNaN(pos) && isFinite(pos)) {
        scrubberOffset.value = pos;
        console.log("Video time update:", {
          currentTime: player.currentTime,
          duration: player.duration,
          barLength,
          maxOffset,
          calculatedPos: pos,
        });
      }
    }
  }, [currentTime, player.duration, isScrubbing]);

  // --- PanResponder for gesture handling ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const barLength = barLengthRef.current;
        console.log("Pan grant:", {
          locationX: evt.nativeEvent.locationX,
          locationY: evt.nativeEvent.locationY,
          pageX: evt.nativeEvent.pageX,
          pageY: evt.nativeEvent.pageY,
          currentOffset: scrubberOffset.value,
          barLength,
        });
        setIsScrubbing(true);
        startOffset.current = scrubberOffset.value;
        player.pause();
      },
      onPanResponderMove: (evt, gestureState) => {
        const barLength = barLengthRef.current;
        if (barLength <= 0 || player.duration <= 0) {
          console.log("Skipping pan move: invalid values", { barLength, duration: player.duration });
          return;
        }

        // Calculate new offset based on gesture movement
        let newOffset = startOffset.current + gestureState.dx;

        // Clamp to bar boundaries (accounting for seeker width)
        const maxOffset = barLength - seekerWidth;
        if (newOffset < 0) newOffset = 0;
        if (newOffset > maxOffset) newOffset = maxOffset;

        scrubberOffset.value = newOffset;

        // Calculate time for preview (use the full bar length for time calculation)
        const newTime = (player.duration * newOffset) / maxOffset;
        if (!isNaN(newTime) && isFinite(newTime)) {
          setDisplayedTime(newTime);
        }

        console.log("Pan move:", {
          dx: gestureState.dx,
          startOffset: startOffset.current,
          newOffset,
          maxOffset,
          newTime,
          barLength,
          seekerWidth,
          percentage: (newOffset / maxOffset) * 100,
        });
      },
      onPanResponderRelease: () => {
        const barLength = barLengthRef.current;
        console.log("Pan release:", {
          finalOffset: scrubberOffset.value,
          maxOffset: barLength - seekerWidth,
          barLength,
        });
        setIsScrubbing(false);

        if (barLength <= 0 || player.duration <= 0) {
          console.log("Skipping pan release: invalid values", { barLength, duration: player.duration });
          return;
        }

        // Seek video to new time (use the full bar length for time calculation)
        const maxOffset = barLength - seekerWidth;
        const newTime = (player.duration * scrubberOffset.value) / maxOffset;
        if (!isNaN(newTime) && isFinite(newTime)) {
          console.log("Seeking to", newTime, "from offset", scrubberOffset.value, "maxOffset", maxOffset, "barLength", barLength);
          player.currentTime = newTime;
          player.play();
        }
      },
    })
  ).current;

  // Defensive: fallback UI if player or bar is not ready
  if (!player || player.duration <= 0 || barLengthRef.current <= 0) {
    console.log("VideoBar not ready", { player, duration: player?.duration, barLength: barLengthRef.current });
    return <MyAppText>Loading video bar...</MyAppText>;
  }

  // --- Animated styles ---
  const animatedStyles = useAnimatedStyle(() => ({
    transform: [
      { translateX: scrubberOffset.value },
      { scale: withTiming(isScrubbing ? 1.2 : 1) },
    ],
    backgroundColor: isScrubbing ? "yellow" : "white",
  }));

  return (
    <View>
      <MyAppText>
        {`${displayDurationFromSecond(
          isScrubbing ? displayedTime : currentTime
        )}/${displayDurationFromSecond(player.duration)}`}
      </MyAppText>
      <View
        onLayout={onBarLayout}
        style={[
          {
            height: 10,
            width: "90%",
            backgroundColor: "gray",
            marginHorizontal: "5%",
            marginVertical: 20,
            borderRadius: 100,
            overflow: "hidden",
          },
          utilStyles.ListRow,
        ]}
      >
        <View {...panResponder.panHandlers}>
          <Animated.View
            style={[
              {
                height: 50,
                width: seekerWidth,
                position: "absolute",
                borderRadius: 100,
                top: -20,
              },
              animatedStyles,
            ]}
          />
        </View>
      </View>
    </View>
  );
}
