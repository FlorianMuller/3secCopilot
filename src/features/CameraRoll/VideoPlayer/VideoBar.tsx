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

  // --- Bar length (dynamic) ---
  const [barLength, setBarLength] = useState(DEFAULT_BAR_LENGTH);
  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    setBarLength(e.nativeEvent.layout.width);
    console.log("Bar layout width:", e.nativeEvent.layout.width);
  }, []);

  // --- Scrubber position ---
  const scrubberOffset = useSharedValue(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [displayedTime, setDisplayedTime] = useState(0);
  const startOffset = useRef(0);

  // Update scrubber position when video time changes (when not scrubbing)
  useEffect(() => {
    if (!isScrubbing && player.duration > 0 && barLength > 0) {
      const pos = (barLength * player.currentTime) / player.duration;
      if (!isNaN(pos) && isFinite(pos)) {
        scrubberOffset.value = pos;
      }
    }
  }, [currentTime, player.duration, barLength, isScrubbing]);

  // --- PanResponder for gesture handling ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        console.log("Pan grant");
        setIsScrubbing(true);
        startOffset.current = scrubberOffset.value;
        player.pause();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (barLength <= 0 || player.duration <= 0) {
          console.log("Skipping pan move: invalid values", { barLength, duration: player.duration });
          return;
        }

        let newOffset = startOffset.current + gestureState.dx;
        if (newOffset < 0) newOffset = 0;
        if (newOffset > barLength - seekerWidth) newOffset = barLength - seekerWidth;

        scrubberOffset.value = newOffset;

        // Calculate time for preview
        const newTime = (player.duration * newOffset) / barLength;
        if (!isNaN(newTime) && isFinite(newTime)) {
          setDisplayedTime(newTime);
        }
      },
      onPanResponderRelease: () => {
        console.log("Pan release");
        setIsScrubbing(false);

        if (barLength <= 0 || player.duration <= 0) {
          console.log("Skipping pan release: invalid values", { barLength, duration: player.duration });
          return;
        }

        // Seek video to new time
        const newTime = (player.duration * scrubberOffset.value) / barLength;
        if (!isNaN(newTime) && isFinite(newTime)) {
          console.log("Seeking to", newTime);
          player.currentTime = newTime;
          player.play();
        }
      },
    })
  ).current;

  // --- Animated styles ---
  const animatedStyles = useAnimatedStyle(() => ({
    transform: [
      { translateX: scrubberOffset.value },
      { scale: withTiming(isScrubbing ? 1.2 : 1) },
    ],
    backgroundColor: isScrubbing ? "yellow" : "white",
  }));

  // Defensive: fallback UI if player or bar is not ready
  if (!player || player.duration <= 0 || barLength <= 0) {
    console.log("VideoBar not ready", { player, duration: player?.duration, barLength });
    return <MyAppText>Loading video bar...</MyAppText>;
  }

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
