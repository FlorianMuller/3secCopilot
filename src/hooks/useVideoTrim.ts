import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef } from "react";
import { type EventSubscription } from "react-native";
import { isValidFile, showEditor } from "react-native-video-trim";
import videoTrim from "react-native-video-trim";
import { ensureDirExists, idToFileName } from "../utils/fileSytem";

const videoToTrimDirectory = FileSystem.cacheDirectory + "videoToTrim/";
const trimmedVideoDirectory = FileSystem.cacheDirectory + "trimmedVideos/";

export interface TrimResult {
  outputPath: string;
  startTime: number;
  endTime: number;
  duration: number;
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

  // Setup event listeners
  useEffect(() => {
    listenerSubscription.current.onLoad = videoTrim.onLoad(({ duration }) =>
      console.log("Video trim onLoad", duration)
    );

    listenerSubscription.current.onStartTrimming = videoTrim.onStartTrimming(() => {
      console.log("Video trim onStartTrimming");
      onTrimStart?.();
    });

    listenerSubscription.current.onCancelTrimming = videoTrim.onCancelTrimming(() => {
      console.log("Video trim onCancelTrimming");
      onTrimCancel?.();
    });

    listenerSubscription.current.onCancel = videoTrim.onCancel(() => {
      console.log("Video trim onCancel");
      onTrimCancel?.();
    });

    listenerSubscription.current.onHide = videoTrim.onHide(() => console.log("Video trim onHide"));

    listenerSubscription.current.onShow = videoTrim.onShow(() => console.log("Video trim onShow"));

    listenerSubscription.current.onFinishTrimming = videoTrim.onFinishTrimming(
      ({ outputPath, startTime, endTime, duration }) => {
        console.log(
          "Video trim onFinishTrimming",
          `outputPath: ${outputPath}, startTime: ${startTime}, endTime: ${endTime}, duration: ${duration}`
        );
        onTrimComplete?.({ outputPath, startTime, endTime, duration });
      }
    );

    listenerSubscription.current.onError = videoTrim.onError(({ message, errorCode }) => {
      console.log("Video trim onError", `message: ${message}, errorCode: ${errorCode}`);
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
      // Use localUri and clean it by removing metadata after #
      const rawLocalUri = videoInfo.localUri;
      const localUri = rawLocalUri?.split("#")[0];
      console.log("Original Video URI:", localUri);

      if (localUri === undefined) {
        console.error("Video local URI is undefined, cannot launch editor");
        onError?.({ message: "Video local URI is undefined" });
        return false;
      }

      // Copy video to temp directory for trim library access
      await ensureDirExists(videoToTrimDirectory);
      const fileExtension = localUri.split(".").pop() || "mov";
      const tempVideoPath = videoToTrimDirectory + `${idToFileName(videoInfo.id)}.${fileExtension}`;

      console.log("Copying video to temp location:", tempVideoPath);
      await FileSystem.copyAsync({
        from: localUri,
        to: tempVideoPath,
      });

      // Check if file is valid
      const validResult = await isValidFile(tempVideoPath);
      console.log("Temp video file valid:", validResult);

      if (!validResult.isValid) {
        console.error("Temp video file is not valid, cannot launch editor");
        onError?.({ message: "Video file is not valid for trimming" });
        return false;
      }

      // Launch the trim editor
      console.log("Launching trim editor with temp file");
      showEditor(tempVideoPath, {
        maxDuration,
      });
      console.log("Trim editor launched for video:", tempVideoPath);

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
