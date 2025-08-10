import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { isValidFile, trim } from "react-native-video-trim";
import { VideoMetadata } from "../db/schema";
import { doesFileExists, ensureDirExists, idToFileName } from "../utils/fileSytem";
import { cleanupTempVideo, copyVideoToTemp, getFileExtension } from "./localVideo";

export const videoToTrimDirectory = FileSystem.cacheDirectory + "videoToTrim/";

// todo: as reTrim is not working for now, we will use the document directory.
// In the future we should switch back to cache directory
export const trimmedVideoDirectory = FileSystem.documentDirectory + "trimmedVideos/";
// export const trimmedVideoDirectory = FileSystem.cacheDirectory + "trimmedVideos/";

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

// Refined type with non-null trims
type TrimmedVideoMetadata = VideoMetadata & {
  trimStartTime: number;
  trimEndTime: number;
};

// Type guard to check if trim metadata are set
export function isVideoTrimmed(metadata: VideoMetadata): metadata is TrimmedVideoMetadata {
  return metadata.trimStartTime !== null && metadata.trimEndTime !== null;
}

/**
 * Prepares a video for trimming by copying it to a temp location and validating it
 * Returns the temp path where the video is ready for trimming
 */
export async function prepareVideoForTrim(videoInfo: MediaLibrary.AssetInfo): Promise<string> {
  // Use the shared localVideo service to copy to temp
  const tempPath = await copyVideoToTemp(videoInfo);

  // Check if file is valid for trimming
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

// Retrim a video with trim metadata
export async function reTrimVideo(videoInfo: MediaLibrary.AssetInfo, metadata: TrimmedVideoMetadata): Promise<string> {
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
    await cleanupTempVideo(videoInfo);

    return permanentPath;
  } catch (error) {
    // Clean up temp file in case of error
    await cleanupTempVideo(videoInfo);
    throw error;
  }
}
