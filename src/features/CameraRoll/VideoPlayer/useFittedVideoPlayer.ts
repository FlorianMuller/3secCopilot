import { useEventListener } from "expo";
import { useVideoPlayer } from "expo-video";
import { useCallback, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent } from "react-native";

type Dimensions = { width: number; height: number };

// Shared expo-video wiring used by both the full-screen VideoPlayer and the stash preview: creates the
// player, autoplays each source once it loads, and fits the VideoView to its container while keeping the
// previous size until the new source loads (avoids an aspect-ratio flash when switching videos).
//
// `sourceDimensions` is the current asset's intrinsic width/height; pass null while unknown. The caller
// owns loading the actual source (player.replaceAsync) — URI/trim resolution differs per screen.
export function useFittedVideoPlayer(sourceDimensions: Dimensions | null | undefined) {
  const player = useVideoPlayer({}, (player) => {
    player.audioMixingMode = "duckOthers";
  });

  const [containerSize, setContainerSize] = useState<Dimensions>({ width: 0, height: 0 });
  const [loadedVideoDimensions, setLoadedVideoDimensions] = useState<Dimensions | null>(null);

  // Read the latest source dimensions from the sourceLoad listener without re-subscribing on each change.
  const sourceDimensionsRef = useRef(sourceDimensions);
  sourceDimensionsRef.current = sourceDimensions;

  // Commit the newly loaded video's dimensions and start playback once the source is ready.
  useEventListener(player, "sourceLoad", () => {
    const dimensions = sourceDimensionsRef.current;
    if (dimensions?.width && dimensions?.height) {
      setLoadedVideoDimensions({ width: dimensions.width, height: dimensions.height });
    }
    player.play();
  });

  const videoSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) return null;
    if (!loadedVideoDimensions) {
      return { width: containerSize.width, height: containerSize.height };
    }
    const videoAspect = loadedVideoDimensions.width / loadedVideoDimensions.height;
    const containerAspect = containerSize.width / containerSize.height;
    if (videoAspect > containerAspect) {
      return { width: containerSize.width, height: containerSize.width / videoAspect };
    } else {
      return { width: containerSize.height * videoAspect, height: containerSize.height };
    }
  }, [loadedVideoDimensions, containerSize]);

  const onContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  return { player, videoSize, onContainerLayout };
}
