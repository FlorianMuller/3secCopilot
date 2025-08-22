import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef } from "react";
import { type EventSubscription } from "react-native";
import videoTrim, { showEditor } from "react-native-video-trim";
import { VideoMetadata } from "../db/schema";
import { cleanupTempVideo } from "../services/localVideo";
import { updateVideoTrimMetadata } from "../services/metadata";
import { finalizeTrimmedVideo, prepareVideoForTrim } from "../services/trim";

export interface TrimResult {
  outputPath: string;
  metadata: VideoMetadata;
}

export interface UseVideoTrimOptions {
  maxDuration?: number;
  onTrimStart?: () => void;
  onTrimComplete?: (result: TrimResult) => void;
  onTrimCancel?: () => void;
  onError?: (error: { message: string; errorCode?: string }) => void;
}

export function useVideoTrim(options: UseVideoTrimOptions = {}) {
  const { maxDuration, onTrimStart, onTrimComplete, onTrimCancel, onError } = options;

  const listenerSubscription = useRef<Record<string, EventSubscription>>({});
  const currentVideoInfo = useRef<MediaLibrary.AssetInfo | null>(null);
  const isActive = useRef(false);

  async function cleanupTempFile() {
    if (currentVideoInfo.current) {
      await cleanupTempVideo(currentVideoInfo.current);
    }
  }

  async function cleanUp() {
    await cleanupTempFile();
    currentVideoInfo.current = null;
    isActive.current = false;
  }

  // Setup event listeners
  useEffect(() => {
    listenerSubscription.current.onLoad = videoTrim.onLoad(({ duration }) => {
      if (!isActive.current) return;
      console.log("Video trim onLoad", duration);
    });

    listenerSubscription.current.onStartTrimming = videoTrim.onStartTrimming(() => {
      if (!isActive.current) return;
      console.log("Video trim onStartTrimming");
      onTrimStart?.();
    });

    listenerSubscription.current.onCancelTrimming = videoTrim.onCancelTrimming(async () => {
      if (!isActive.current) return;
      console.log("Video trim onCancelTrimming");
      onTrimCancel?.();
      await cleanUp();
    });

    listenerSubscription.current.onCancel = videoTrim.onCancel(async () => {
      if (!isActive.current) return;
      console.log("Video trim onCancel");
      onTrimCancel?.();
      await cleanUp();
    });

    listenerSubscription.current.onHide = videoTrim.onHide(() => {
      if (!isActive.current) return;
      console.log("Video trim onHide");
    });

    listenerSubscription.current.onShow = videoTrim.onShow(() => {
      if (!isActive.current) return;
      console.log("Video trim onShow");
    });

    listenerSubscription.current.onFinishTrimming = videoTrim.onFinishTrimming(
      async ({ outputPath, startTime, endTime, duration }) => {
        if (!isActive.current) return;
        console.log(
          "Video trim onFinishTrimming",
          `outputPath: ${outputPath}, startTime: ${startTime}, endTime: ${endTime}, duration: ${duration}`
        );

        if (currentVideoInfo.current) {
          try {
            // Move trimmed video to permanent location
            const permanentPath = await finalizeTrimmedVideo(outputPath, currentVideoInfo.current.id);

            // Save trim metadata to database
            const updatedMetadata = await updateVideoTrimMetadata(
              currentVideoInfo.current.id,
              new Date(currentVideoInfo.current.creationTime),
              startTime,
              endTime
            );

            if (updatedMetadata) {
              onTrimComplete?.({
                outputPath: permanentPath,
                metadata: updatedMetadata,
              });
            }
          } catch (error) {
            console.error("Failed to move trimmed video:", error);
            onError?.({ message: `Failed to save trimmed video: ${error}` });
          }
        }

        await cleanUp();
      }
    );

    listenerSubscription.current.onError = videoTrim.onError(async ({ message, errorCode }) => {
      if (!isActive.current) return;
      console.log("Video trim onError", `message: ${message}, errorCode: ${errorCode}`);
      onError?.({ message, errorCode });
      await cleanUp();
    });

    return () => {
      listenerSubscription.current.onLoad?.remove();
      listenerSubscription.current.onStartTrimming?.remove();
      listenerSubscription.current.onCancelTrimming?.remove();
      listenerSubscription.current.onCancel?.remove();
      listenerSubscription.current.onHide?.remove();
      listenerSubscription.current.onShow?.remove();
      listenerSubscription.current.onFinishTrimming?.remove();
      listenerSubscription.current.onError?.remove();
      listenerSubscription.current = {};
    };
  }, [onTrimStart, onTrimComplete, onTrimCancel, onError]);

  async function openTrimEditor(videoInfo: MediaLibrary.AssetInfo): Promise<boolean> {
    try {
      // Store current video info for later use
      currentVideoInfo.current = videoInfo;
      isActive.current = true;

      // Prepare video for trimming
      const tempPath = await prepareVideoForTrim(videoInfo);

      // Launch the trim editor
      console.log("Launching trim editor with temp file");
      showEditor(tempPath, {
        maxDuration,
        minDuration: 0.1,
      });
      console.log("Trim editor launched for video:", tempPath);

      return true;
    } catch (error) {
      console.error("Error preparing video for trim editor:", error);
      onError?.({ message: `Error preparing video: ${error}` });
      return false;
    }
  }

  return {
    openTrimEditor,
  };
}
