import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { NavigationTitle } from "../../../components/NavigationTitle";
import { SafeTabBarZone } from "../../../components/SafeTabBarZone";
import { ThemedButton } from "../../../components/ThemedButton";
import { VideoMetadata } from "../../../db/schema";
import { useVideoTrim } from "../../../hooks/useVideoTrim";
import { CameraRollStackParamList } from "../../../navigation/CameraRollNavigation";
import { isVideoDayShifted } from "../../../services/dayShift";
import { getLocalUri } from "../../../services/mediaLocalUri";
import preferences from "../../../services/preferences";
import {
  getVideosMetadtaByIds,
  markVideoAsSelected,
  markVideoAsUnselected,
  updateVideoTrimMetadata,
} from "../../../services/metadata";
import { doesTrimmedVideoExist, getTrimmedVideoPath, isVideoTrimmed, reTrimVideo } from "../../../services/trim";
import { displayDate, displayShortDate, displayTime } from "../../../utils/dateTime";
import { PhoneMedia } from "../CameraRoll";
import { VideoThumbnailBar } from "./VideoThumbnailBar";

export type VideoPlayerRouteProps = RouteProp<CameraRollStackParamList, "VideoPlayer">;

export function VideoPlayer() {
  const navigation = useNavigation();
  const { params } = useRoute<VideoPlayerRouteProps>();
  const id = params.ids[params.index];
  const { dayShift } = preferences.useDayShiftPreference();

  const player = useVideoPlayer({}, (player) => {
    player.audioMixingMode = "duckOthers";
    player.timeUpdateEventInterval = 0.01;
  });
  // todo: show video player error
  // const { status, error } = useEvent(player, "statusChange", { status: player.status });

  // All videos data (info + metadata)
  const [allVideos, setAllVideos] = useState<PhoneMedia[]>([]);

  // Currently playing video info and metadata (derived from allVideos using index)
  const videoInfo = allVideos[params.index]?.info;
  const videoMetadata = allVideos[params.index]?.metadata || null;

  // Todo: use to show loading state when trimming video
  const [isLoadingTrimmedVideo, setIsLoadingTrimmedVideo] = useState(false);

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

  // Video trim functionality
  const { openTrimEditor } = useVideoTrim({
    onTrimComplete: async (result) => {
      console.log("Trim completed:", result);
      try {
        if (!videoInfo) {
          console.error("Video info not available for trim metadata save");
          return;
        }

        const updatedMetadata = await updateVideoTrimMetadata(
          result.videoId,
          new Date(videoInfo.creationTime),
          result.startTime,
          result.endTime
        );
        if (updatedMetadata) {
          updateVideoMetadataInState(result.videoId, updatedMetadata);
          console.log("Trim metadata saved to database");

          // Reload video source to show the trimmed video
          if (result.videoId === id) {
            await loadVideoSource(videoInfo, updatedMetadata);
            player.play();
          }
        }
      } catch (error) {
        // todo: Show user-friendly error message
        console.error("Failed to save trim metadata:", error);
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
        player.play();
      }
    } catch (e) {
      console.error("can't load videos with metadata", e);
    }
  }

  async function loadVideoSource(info: MediaLibrary.AssetInfo, metadata: VideoMetadata | null) {
    try {
      if (metadata === null || !isVideoTrimmed(metadata)) {
        // No trim metadata - load original video
        await player.replaceAsync({
          uri: getLocalUri(info),
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

  // Get all videos with metadata when video IDs change
  useEffect(() => {
    getAllVideosWithMetadata();
  }, [params.ids]);

  // Load video source when index changes (switching between videos of the same day)
  useEffect(() => {
    const currentVideo = allVideos[params.index];
    if (currentVideo?.info) {
      loadVideoSource(currentVideo.info, currentVideo.metadata || null);
      player.play();
    }
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

  async function toggleSelectVideo(videoInfo: MediaLibrary.AssetInfo, videoMetadata: VideoMetadata | null) {
    if (videoMetadata?.isSelected) {
      console.log("Unselecting video");
      try {
        const newMetadata = await markVideoAsUnselected(id);
        if (newMetadata != null) {
          updateVideoMetadataInState(id, newMetadata);
        }
      } catch (e) {
        console.error("error while unselecting video", e);
      }
    } else {
      console.log("Selecting video");
      try {
        const newMetadata = await markVideoAsSelected(id, new Date(videoInfo.creationTime), new Date(params.day));
        if (newMetadata != null) {
          updateVideoMetadataInState(id, newMetadata);
        }
      } catch (e) {
        console.error("error while selecting video", e);
      }
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

  return (
    <View style={{ display: "flex", height: "100%" }}>
      {/* Video player, taking all the remaining space */}
      <VideoView
        // nativeControls={false}
        style={[styles.video]}
        player={player}
      />

      {/* <VideoBar player={player} /> */}

      {/* Video thumbnails bar */}
      <VideoThumbnailBar videos={allVideos} currentIndex={params.index} routeParams={params} />

      {/* Toolbar */}
      <View style={styles.toolBar}>
        {/* Select and Trim buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, justifyContent: "center" }}>
          {videoInfo && videoMetadata !== undefined && (
            <Pressable onPress={() => toggleSelectVideo(videoInfo, videoMetadata)}>
              <ThemedButton text={videoMetadata?.isSelected ? "Unselect" : "Select"} />
            </Pressable>
          )}
          {videoInfo && (
            <Pressable onPress={launchTrimEditor}>
              <ThemedButton text="Trim" />
            </Pressable>
          )}
        </View>
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
    justifyContent: "center",
    paddingHorizontal: 10,
  },
});
