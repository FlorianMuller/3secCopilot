import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { doesFileExists, idToFileName } from "../utils/fileSytem";
import { trim, isValidFile } from "react-native-video-trim";
import { VideoMetadata } from "../db/schema";
import { ensureDirExists } from "../utils/fileSytem";
import { get } from "react-native/Libraries/TurboModule/TurboModuleRegistry";
export const videoToTrimDirectory = FileSystem.cacheDirectory + "videoToTrim/";
export const trimmedVideoDirectory = FileSystem.cacheDirectory + "trimmedVideos/";

export function getCleanLocalUri(videoInfo: MediaLibrary.AssetInfo): string | undefined {
  return videoInfo.localUri?.split("#")[0];
}

export function getFileExtension(videoInfo: MediaLibrary.AssetInfo): string {
  const localUri = getCleanLocalUri(videoInfo);
  return localUri?.split(".").pop() || "mov";
}

export function getVideoToTrimPath(videoId: string, extension: string): string {
  return videoToTrimDirectory + `${idToFileName(videoId)}.${extension}`;
}

export function getVideoToTrimPathFromInfo(videoInfo: MediaLibrary.AssetInfo): string {
  const extension = getFileExtension(videoInfo);
  return getVideoToTrimPath(videoInfo.id, extension);
}

export function getTrimmedVideoPath(videoId: string): string {
  // Video trimmer always uses .mp4, so we can hardcode it
  return trimmedVideoDirectory + `${idToFileName(videoId)}.mp4`;
}

export async function doesTrimmedVideoExist(videoId: string): Promise<boolean> {
  const trimmedPath = getTrimmedVideoPath(videoId);
  console.log("Checking if trimmed video exists at:", trimmedPath);
  return await doesFileExists(trimmedPath);
}

/**
 * Prepares a video for trimming by copying it to a temp location and validating it
 * Returns the temp path where the video is ready for trimming
 */
export async function prepareVideoForTrim(videoInfo: MediaLibrary.AssetInfo): Promise<string> {
  // Get clean local URI
  const localUri = getCleanLocalUri(videoInfo);
  console.log("Original Video URI:", localUri);

  if (localUri === undefined) {
    console.error("Video local URI is undefined, cannot prepare for trim");
    throw new Error("Video local URI is undefined");
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
    console.error("Temp video file is not valid, cannot use for trimming");
    throw new Error("Video file is not valid for trimming");
  }

  return tempPath;
}

/**
 * Finalizes a trimmed video by moving it from temp location to permanent cache
 * Returns the permanent path where the video is stored
 */
export async function finalizeTrimmedVideo(outputPath: string, videoId: string): Promise<string> {
  // Move trimmed video to permanent location
  await ensureDirExists(trimmedVideoDirectory);
  const permanentPath = getTrimmedVideoPath(videoId);

  await FileSystem.moveAsync({
    from: outputPath,
    to: permanentPath,
  });
  console.log("Moved trimmed video to:", permanentPath);

  return permanentPath;
}

/**
 * Cleans up temporary video file used for trimming
 */
export async function cleanupTempVideoFile(videoInfo: MediaLibrary.AssetInfo): Promise<void> {
  try {
    const tempPath = getVideoToTrimPathFromInfo(videoInfo);
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
    console.log("Cleaned up temp video file:", tempPath);
  } catch (error) {
    console.warn("Failed to cleanup temp video file:", error);
  }
}

// Retrim a video with trim metadata
export async function reTrimVideo(videoInfo: MediaLibrary.AssetInfo, metadata: VideoMetadata): Promise<string> {
  if (metadata.trimStartTime === null || metadata.trimEndTime === null) {
    console.error("Invalid trim metadata for video:", videoInfo.id);
    throw new Error("Invalid trim metadata for video");
  }

  try {
    // Prepare video for trimming
    const tempPath = await prepareVideoForTrim(videoInfo);

    console.log("Trimming video:", tempPath, "from", metadata.trimStartTime, "to", metadata.trimEndTime);
    const outputPath = await trim(tempPath, {
      startTime: metadata.trimStartTime,
      endTime: metadata.trimEndTime,
      outputExt: getFileExtension(videoInfo),
    });
    console.log("Video trimmed to:", outputPath);

    // Move trimmed video to final location
    const permanentPath = await finalizeTrimmedVideo(outputPath, videoInfo.id);

    // Clean up temp file
    await cleanupTempVideoFile(videoInfo);

    return permanentPath;
  } catch (error) {
    // Clean up temp file in case of error
    await cleanupTempVideoFile(videoInfo);
    throw error;
  }
}
