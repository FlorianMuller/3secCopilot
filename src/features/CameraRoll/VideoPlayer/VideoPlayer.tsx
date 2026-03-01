import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { NavigationTitle } from "../../../components/NavigationTitle";
import { SafeTabBarZone } from "../../../components/SafeTabBarZone";
import { MyAppText } from "../../../components/text/MyAppText";
import { ThemedButton } from "../../../components/ThemedButton";
import { VideoMetadata } from "../../../db/schema";
import { useVideoTrim } from "../../../hooks/useVideoTrim";
import { CameraRollStackParamList } from "../../../navigation/CameraRollNavigation";
import { isVideoDayShifted } from "../../../services/dayShift";
import { cleanupTempVideo, copyVideoToTemp } from "../../../services/localVideo";
import { getLocalUri } from "../../../services/mediaLocalUri";
import { getVideosMetadtaByIds } from "../../../services/metadata";
import preferences from "../../../services/preferences";
import { doesTrimmedVideoExist, getTrimmedVideoPath, isVideoTrimmed, reTrimVideo } from "../../../services/trim";
import { toggleVideoSelection } from "../../../services/videoSelection";
import { displayDate, displayShortDate, displayTime } from "../../../utils/dateTime";
import { PhoneMedia } from "../CameraRoll";
import { VideoThumbnailBar } from "./VideoThumbnailBar";
import BottomSheet from "@gorhom/bottom-sheet";
import { VideoMetadataEditor } from "./VideoMetadataEditor";

export type VideoPlayerRouteProps = RouteProp<CameraRollStackParamList, "VideoPlayer">;

export function VideoPlayer() {
  const navigation = useNavigation();
  const { params } = useRoute<VideoPlayerRouteProps>();
  const id = params.ids[params.index];
  const { dayShift } = preferences.useDayShiftPreference();

  const player = useVideoPlayer({}, (player) => {
    player.audioMixingMode = "duckOthers";
  });

  // All videos data (info + metadata)
  const [allVideos, setAllVideos] = useState<PhoneMedia[]>([]);

  // Currently playing video info and metadata (derived from allVideos using index)
  const videoAsset = allVideos[params.index];
  const videoInfo = allVideos[params.index]?.info;
  const videoMetadata = allVideos[params.index]?.metadata || null;

  // Todo: use to show loading state when trimming video
  const [isLoadingTrimmedVideo, setIsLoadingTrimmedVideo] = useState(false);

  // Bottom sheet ref for metadata editor
  const metadataEditorRef = useRef<BottomSheet>(null);

  // Container size for video dimension calculation
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track the video dimensions actually loaded in the player via the sourceLoad event.
  // This ensures the VideoView keeps the previous video's size until the new source
  // has fully loaded — preventing a flash when switching between different aspect ratios.
  const [loadedVideoDimensions, setLoadedVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  useEventListener(player, "sourceLoad", () => {
    if (videoInfo?.width && videoInfo?.height) {
      setLoadedVideoDimensions({ width: videoInfo.width, height: videoInfo.height });
    }
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

  // Helper function to update metadata for a specific video
  const updateVideoMetadataInState = (videoId: string, newMetadata: VideoMetadata) => {
    setAllVideos((prevVideos) =>
      prevVideos.map((video) => (video.id === videoId ? { ...video, metadata: newMetadata } : video))
    );
  };

  // Pause video before navigating out
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      player.pause();
      player.release();
    });

    return unsubscribe;
  }, [navigation, player]);

  // Play video automatically after it loads
  useEffect(() => {
    const unsubscribe = player.addListener("sourceLoad", () => {
      player.play();
    });

    return () => {
      unsubscribe.remove();
    };
  }, [player]);

  // Video trim functionality
  const { openTrimEditor } = useVideoTrim({
    onTrimComplete: async (result) => {
      try {
        // Update local state with the metadata from the hook
        updateVideoMetadataInState(result.metadata.videoId, result.metadata);

        // Reload video source to show the trimmed video
        if (result.metadata.videoId === id && videoInfo) {
          await loadVideoSource(videoInfo, result.metadata);
        }
      } catch (error) {
        // todo: Show user-friendly error message
        console.error("Failed to update video after trim:", error);
      }
    },
    onError: (error) => {
      console.error("Trim error:", error);
      // TODO: Show user-friendly error message
    },
  });

  async function getAllVideosWithMetadata() {
    try {
      const [videosInfo, videosMetadata] = await Promise.all([
        Promise.all(params.ids.map((videoId) => MediaLibrary.getAssetInfoAsync(videoId))),
        getVideosMetadtaByIds(params.ids),
      ]);

      const videos: PhoneMedia[] = videosInfo.map((info) => ({
        ...info,
        info,
        metadata: videosMetadata[info.id],
      }));

      setAllVideos(videos);

      // Load video source for current video
      const currentVideo = videos[params.index];
      if (currentVideo?.info) {
        console.log("metadata", currentVideo.metadata);
        await loadVideoSource(currentVideo.info, currentVideo.metadata || null);
      }
    } catch (e) {
      console.error("can't load videos with metadata", e);
    }
  }

  async function loadVideoSource(info: MediaLibrary.AssetInfo, metadata: VideoMetadata | null) {
    try {
      if (metadata === null || !isVideoTrimmed(metadata)) {
        // No trim metadata - load original video (or live photo paired video)
        const tempPath = await copyVideoToTemp(info);
        await player.replaceAsync({
          uri: tempPath,
        });
        return;
      }

      const hasCachedTrimmedVideo = await doesTrimmedVideoExist(info.id);
      if (hasCachedTrimmedVideo) {
        // Trinned video exist - Load it
        const trimmedVideoPath = getTrimmedVideoPath(info.id);
        console.log("Loading cached trimmed video:", trimmedVideoPath);
        await player.replaceAsync({
          uri: trimmedVideoPath,
        });
        return;
      }

      setIsLoadingTrimmedVideo(true);
      try {
        // Re-trim the original video using react-native-video-trim
        const trimmedPath = await reTrimVideo(info, metadata);
        console.log("Re-trimmed video successfully, loading:", trimmedPath);
        await player.replaceAsync({
          uri: trimmedPath,
        });
      } catch (error) {
        console.error("Failed to re-trim video, loading original:", error);
        await player.replaceAsync({
          uri: getLocalUri(info),
        });
      }
      setIsLoadingTrimmedVideo(false);
    } catch (e) {
      // todo: Show user-friendly error message
      console.error("Error loading video source:", e);
      setIsLoadingTrimmedVideo(false);
      // Fallback to original video
      await player.replaceAsync({
        uri: getLocalUri(info),
      });
    }
  }

  useEffect(() => {
    console.log("VideoPlayer mounted");
    return () => {
      console.log("VideoPlayer unmounted");
    };
  }, []);

  // Get all videos with metadata
  useEffect(() => {
    getAllVideosWithMetadata();
  }, [params.ids]);

  // Load video source when index changes (switching between videos of the same day)
  useEffect(() => {
    const currentVideo = allVideos[params.index];
    if (currentVideo?.info) {
      loadVideoSource(currentVideo.info, currentVideo.metadata || null);
    }
    return () => {
      // Clean up temporary video file when switching videos
      if (currentVideo?.info) {
        cleanupTempVideo(currentVideo.info);
      }
    };
  }, [params.index, allVideos]);

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

  async function handleToggleSelectVideo() {
    try {
      const newMetadata = await toggleVideoSelection(videoAsset, videoMetadata);
      if (newMetadata) {
        updateVideoMetadataInState(id, newMetadata);
      }
    } catch (e) {
      console.error("error while toggling video selection", e);
    }
  }

  async function launchTrimEditor() {
    if (!videoInfo) {
      console.error("Video info is not available, cannot launch editor");
      return;
    }

    player.pause();
    await openTrimEditor(videoInfo);
  }

  function openMetadataEditor() {
    player.pause();
    metadataEditorRef.current?.expand();
  }

  return (
    <View style={{ display: "flex", height: "100%" }}>
      {/* Video player, taking all the remaining space */}
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center", overflow: "hidden" }}
        onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {videoSize && (
          // <></>
          <View style={{ position: "relative", width: videoSize.width, height: videoSize.height }}>
            <VideoView
              // nativeControls={false}
              style={styles.video}
              player={player}
            />

            {/* Video metadata overlay */}
            {(videoMetadata?.title || videoMetadata?.description) && (
              <View style={styles.metadataOverlay}>
                {videoMetadata.title && (
                  <MyAppText style={styles.metadataTitle} size={15}>
                    {videoMetadata.title}
                  </MyAppText>
                )}
                {videoMetadata.description && (
                  <MyAppText style={styles.metadataDescription} size={8}>
                    {videoMetadata.description}
                  </MyAppText>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* <VideoBar player={player} /> */}

      {/* Video thumbnails bar */}
      <VideoThumbnailBar videos={allVideos} currentIndex={params.index} routeParams={params} />

      {/* Toolbar */}
      <View style={styles.toolBar}>
        {/* Select and Trim buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, justifyContent: "center" }}>
          {/* Select button */}
          {videoInfo && (
            <Pressable onPress={handleToggleSelectVideo}>
              <ThemedButton
                text="Select"
                Icon={({ iconProps }) => (
                  <Feather name={videoMetadata?.isSelected ? "check-circle" : "circle"} {...iconProps} />
                )}
                size={20}
                variant={videoMetadata?.isSelected ? "filled" : "outline"}
                style={{ width: 100 }}
              />
            </Pressable>
          )}

          {/* Trim button */}
          {videoInfo && (
            <Pressable onPress={launchTrimEditor}>
              <ThemedButton
                text="Trim"
                Icon={({ iconProps }) => <Ionicons name="cut" {...iconProps} />}
                size={20}
                variant="outline"
                style={{ width: 100 }}
              />
            </Pressable>
          )}

          {/* Edit metadata button */}
          {videoInfo && (
            <Pressable onPress={openMetadataEditor}>
              <ThemedButton
                text="Info"
                Icon={({ iconProps }) => <MaterialCommunityIcons name="information-outline" {...iconProps} />}
                size={20}
                variant="outline"
                style={{ width: 100 }}
              />
            </Pressable>
          )}
        </View>
      </View>
      <SafeTabBarZone />

      {/* Video metadata editor bottom sheet */}
      {videoInfo && (
        <VideoMetadataEditor
          ref={metadataEditorRef}
          videoId={id}
          videoOriginalDate={new Date(videoInfo.creationTime)}
          metadata={videoMetadata}
          onMetadataUpdate={(newMetadata) => updateVideoMetadataInState(id, newMetadata)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    flex: 1,
    borderRadius: 10,
  },
  metadataOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 5,
    gap: 2,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  metadataTitle: {
    fontWeight: "bold",
    color: "white",
  },
  metadataDescription: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  toolBar: {
    height: 80,
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
});
