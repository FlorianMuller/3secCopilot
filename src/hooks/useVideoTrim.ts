import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef } from "react";
import { type EventSubscription } from "react-native";
import { isValidFile, showEditor } from "react-native-video-trim";
import videoTrim from "react-native-video-trim";
import {
  getCleanLocalUri,
  getVideoToTrimPathFromInfo,
  getTrimmedVideoPath,
  trimmedVideoDirectory,
  videoToTrimDirectory,
} from "../services/trim";
import { ensureDirExists } from "../utils/fileSytem";

export interface TrimResult {
  outputPath: string;
  startTime: number;
  endTime: number;
  duration: number;
  videoId: string;
}

export interface UseVideoTrimOptions {
  maxDuration?: number;
  onTrimStart?: () => void;
  onTrimComplete?: (result: TrimResult) => void;
  onTrimCancel?: () => void;
  onError?: (error: { message: string; errorCode?: string }) => void;
}

export function useVideoTrim(options: UseVideoTrimOptions = {}) {
  const { maxDuration = 20, onTrimStart, onTrimComplete, onTrimCancel, onError } = options;

  const listenerSubscription = useRef<Record<string, EventSubscription>>({});
  const currentVideoInfo = useRef<MediaLibrary.AssetInfo | null>(null);

  async function cleanupTempFile() {
    if (currentVideoInfo.current) {
      try {
        const tempPath = getVideoToTrimPathFromInfo(currentVideoInfo.current);
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
        console.log("Cleaned up temp video file:", tempPath);
      } catch (error) {
        console.warn("Failed to cleanup temp video file:", error);
      }
    }
  }

  // Setup event listeners
  useEffect(() => {
    listenerSubscription.current.onLoad = videoTrim.onLoad(({ duration }) =>
      console.log("Video trim onLoad", duration)
    );

    listenerSubscription.current.onStartTrimming = videoTrim.onStartTrimming(() => {
      console.log("Video trim onStartTrimming");
      onTrimStart?.();
    });

    listenerSubscription.current.onCancelTrimming = videoTrim.onCancelTrimming(async () => {
      console.log("Video trim onCancelTrimming");
      await cleanupTempFile();
      onTrimCancel?.();
    });

    listenerSubscription.current.onCancel = videoTrim.onCancel(async () => {
      console.log("Video trim onCancel");
      await cleanupTempFile();
      onTrimCancel?.();
    });

    listenerSubscription.current.onHide = videoTrim.onHide(() => console.log("Video trim onHide"));

    listenerSubscription.current.onShow = videoTrim.onShow(() => console.log("Video trim onShow"));

    listenerSubscription.current.onFinishTrimming = videoTrim.onFinishTrimming(
      async ({ outputPath, startTime, endTime, duration }) => {
        console.log(
          "Video trim onFinishTrimming",
          `outputPath: ${outputPath}, startTime: ${startTime}, endTime: ${endTime}, duration: ${duration}`
        );

        if (currentVideoInfo.current) {
          try {
            // Move trimmed video to permanent location
            await ensureDirExists(trimmedVideoDirectory);
            const permanentPath = getTrimmedVideoPath(currentVideoInfo.current.id);

            await FileSystem.moveAsync({
              from: outputPath,
              to: permanentPath,
            });
            console.log("Moved trimmed video to:", permanentPath);

            onTrimComplete?.({
              outputPath: permanentPath,
              startTime,
              endTime,
              duration,
              videoId: currentVideoInfo.current.id,
            });
          } catch (error) {
            console.error("Failed to move trimmed video:", error);
            onError?.({ message: `Failed to save trimmed video: ${error}` });
          }
        }

        await cleanupTempFile();
      }
    );

    listenerSubscription.current.onError = videoTrim.onError(async ({ message, errorCode }) => {
      console.log("Video trim onError", `message: ${message}, errorCode: ${errorCode}`);
      await cleanupTempFile();
      onError?.({ message, errorCode });
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

      // Get clean local URI
      const localUri = getCleanLocalUri(videoInfo);
      console.log("Original Video URI:", localUri);

      if (localUri === undefined) {
        console.error("Video local URI is undefined, cannot launch editor");
        onError?.({ message: "Video local URI is undefined" });
        return false;
      }

      // Copy video to temp directory for trim library access
      await ensureDirExists(videoToTrimDirectory);
      const tempPath = getVideoToTrimPathFromInfo(videoInfo);

      console.log("Copying video to temp location:", tempPath);
      await FileSystem.copyAsync({
        from: localUri,
        to: tempPath,
      });

      // Check if file is valid
      const validResult = await isValidFile(tempPath);
      console.log("Temp video file valid:", validResult);

      if (!validResult.isValid) {
        console.error("Temp video file is not valid, cannot launch editor");
        onError?.({ message: "Video file is not valid for trimming" });
        return false;
      }

      // Launch the trim editor
      console.log("Launching trim editor with temp file");
      showEditor(tempPath, {
        maxDuration,
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
