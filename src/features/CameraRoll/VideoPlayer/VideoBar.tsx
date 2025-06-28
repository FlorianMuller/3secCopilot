import { useEvent } from "expo";
import { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, useDerivedValue, withTiming } from "react-native-reanimated";
import { MyAppText } from "../../../components/text/MyAppText";
import { ThemedButton } from "../../../components/ThemedButton";
import { displayDurationWithMilliseconds } from "../../../utils/dateTime";
import { utilStyles } from "../../../utils/utilStyles";

const seekerWidth = 10;
const trimHandleWidth = 18;
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
  }, []);

  // --- Trim state ---
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(player.duration);

  // --- Scrubber position (read-only, synced with video) ---
  const scrubberOffset = useSharedValue(0);

  // --- Trim handles positions ---
  const trimStartOffset = useSharedValue(0);
  const trimEndOffset = useSharedValue(0);

  // --- Update trim handles on duration or bar length change ---
  useEffect(() => {
    const barLength = barLengthRef.current;
    const maxOffset = barLength - trimHandleWidth;
    trimStartOffset.value = 0;
    trimEndOffset.value = maxOffset;
    setTrimStart(0);
    setTrimEnd(player.duration);
  }, [player.duration]);

  // --- Update trim handles when trimStart/trimEnd change ---
  useEffect(() => {
    const barLength = barLengthRef.current;
    const maxOffset = barLength - trimHandleWidth;
    trimStartOffset.value = (maxOffset * trimStart) / player.duration;
    trimEndOffset.value = (maxOffset * trimEnd) / player.duration;
  }, [trimStart, trimEnd, player.duration]);

  // --- Update scrubber position when video time changes (read-only) ---
  useEffect(() => {
    const barLength = barLengthRef.current;
    const maxOffset = barLength - seekerWidth;
    if (player.duration > 0 && barLength > 0) {
      // Clamp currentTime to trim bounds
      let clampedTime = Math.max(trimStart, Math.min(currentTime, trimEnd));
      const pos = (maxOffset * clampedTime) / player.duration;
      if (!isNaN(pos) && isFinite(pos)) {
        scrubberOffset.value = pos;
      }
    }
  }, [currentTime, player.duration, trimStart, trimEnd]);

  // --- Enforce trim bounds during playback (even with native controls) ---
  useEffect(() => {
    if (player.currentTime < trimStart) {
      player.currentTime = trimStart;
      player.pause();
    } else if (player.currentTime > trimEnd) {
      player.currentTime = trimEnd;
      player.pause();
    }
  }, [player.currentTime, trimStart, trimEnd]);

  // --- Button handlers ---
  const handleSetStart = () => {
    setTrimStart(currentTime);
  };

  const handleSetEnd = () => {
    setTrimEnd(currentTime);
  };

  if (!player || player.duration <= 0 || barLengthRef.current <= 0) {
    return <MyAppText>Loading video bar...</MyAppText>;
  }

  // --- Animated styles ---
  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateX: scrubberOffset.value }],
    backgroundColor: "white",
  }));

  // Animated styles for trim handles
  const trimStartHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: trimStartOffset.value }],
  }));
  const trimEndHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: trimEndOffset.value }],
  }));

  // Calculate trim region position using derived values
  const trimRegionLeft = useDerivedValue(() => {
    return trimStartOffset.value + trimHandleWidth / 2;
  });

  const trimRegionWidth = useDerivedValue(() => {
    const right = trimEndOffset.value + trimHandleWidth / 2;
    const left = trimStartOffset.value + trimHandleWidth / 2;
    return right - left;
  });

  // Highlighted region between trim handles
  const trimRegionStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      left: trimRegionLeft.value,
      width: trimRegionWidth.value,
      height: 10,
      backgroundColor: "#ffb34755",
      borderRadius: 100,
      zIndex: 1,
    };
  });

  return (
    <View>
      <MyAppText>
        {`${displayDurationWithMilliseconds(currentTime)}/${displayDurationWithMilliseconds(player.duration)}`}
      </MyAppText>

      {/* Trim control buttons */}
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginVertical: 10 }}>
        <Pressable onPress={handleSetStart}>
          <ThemedButton text="Set Start" />
        </Pressable>
        <Pressable onPress={handleSetEnd}>
          <ThemedButton text="Set End" />
        </Pressable>
      </View>

      <View
        onLayout={onBarLayout}
        style={[
          {
            height: 30,
            width: "90%",
            backgroundColor: "gray",
            marginHorizontal: "5%",
            marginVertical: 20,
            borderRadius: 100,
            overflow: "visible",
            position: "relative",
            justifyContent: "center",
          },
          utilStyles.ListRow,
        ]}
      >
        {/* Highlighted trim region */}
        <Animated.View style={trimRegionStyle} pointerEvents="none" />

        {/* Trim start marker (visual only) */}
        <Animated.View
          style={[
            {
              position: "absolute",
              width: trimHandleWidth,
              height: 30,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: "#ffb347",
              top: 0,
              left: 0,
              justifyContent: "center",
              alignItems: "center",
              zIndex: 2,
              backgroundColor: "#fff",
            },
            trimStartHandleStyle,
          ]}
        >
          <View style={{ width: 6, height: 20, backgroundColor: "#ffb347", borderRadius: 3 }} />
        </Animated.View>

        {/* Trim end marker (visual only) */}
        <Animated.View
          style={[
            {
              position: "absolute",
              width: trimHandleWidth,
              height: 30,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: "#ffb347",
              top: 0,
              left: 0,
              justifyContent: "center",
              alignItems: "center",
              zIndex: 2,
              backgroundColor: "#fff",
            },
            trimEndHandleStyle,
          ]}
        >
          <View style={{ width: 6, height: 20, backgroundColor: "#ffb347", borderRadius: 3 }} />
        </Animated.View>

        {/* Main scrubber (read-only, visual only) */}
        <Animated.View
          style={[
            {
              height: 50,
              width: seekerWidth,
              position: "absolute",
              borderRadius: 100,
              top: -10,
              backgroundColor: "white",
              borderWidth: 2,
              borderColor: "#888",
              zIndex: 3,
            },
            animatedStyles,
          ]}
        />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginHorizontal: "5%" }}>
        <MyAppText size={12}>Trim Start: {displayDurationWithMilliseconds(trimStart)}</MyAppText>
        <MyAppText size={12}>Trim End: {displayDurationWithMilliseconds(trimEnd)}</MyAppText>
      </View>
    </View>
  );
}
