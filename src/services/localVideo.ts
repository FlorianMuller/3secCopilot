import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { ensureDirExists, idToFileName } from "../utils/fileSytem";

export const tempVideoDirectory = FileSystem.cacheDirectory + "tempVideos/";

export function getCleanLocalUri(videoInfo: MediaLibrary.AssetInfo): string | undefined {
  return videoInfo.localUri?.split("#")[0];
}

export function getFileExtension(videoInfo: MediaLibrary.AssetInfo): string {
  const localUri = getCleanLocalUri(videoInfo);
  return localUri?.split(".").pop() || "mov";
}

export function getTempVideoPath(videoId: string, extension: string): string {
  return tempVideoDirectory + `${idToFileName(videoId)}.${extension}`;
}

export function getTempVideoPathFromInfo(videoInfo: MediaLibrary.AssetInfo): string {
  const extension = getFileExtension(videoInfo);
  return getTempVideoPath(videoInfo.id, extension);
}

/**
 * Copies a video from photo library to a temporary location for processing
 * This solves iOS 18+ permission issues where direct access to localUri fails
 */
export async function copyVideoToTemp(videoInfo: MediaLibrary.AssetInfo): Promise<string> {
  // Get clean local URI
  const localUri = getCleanLocalUri(videoInfo);
  console.log("Original Video URI:", localUri);

  if (localUri === undefined) {
    console.error("Video local URI is undefined, cannot copy to temp");
    throw new Error("Video local URI is undefined");
  }

  // Copy video to temp directory
  await ensureDirExists(tempVideoDirectory);
  const tempPath = getTempVideoPathFromInfo(videoInfo);

  console.log("Copying video to temp location:", tempPath);
  await FileSystem.copyAsync({
    from: localUri,
    to: tempPath,
  });

  return tempPath;
}

/**
 * Cleans up temporary video file by path
 */
async function cleanupTempVideoByPath(tempPath: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
    console.log("Cleaned up temp video file:", tempPath);
  } catch (error) {
    console.warn("Failed to cleanup temp video file:", error);
  }
}

/**
 * Cleans up temporary video file
 */
export async function cleanupTempVideo(videoInfo: MediaLibrary.AssetInfo): Promise<void> {
  const tempPath = getTempVideoPathFromInfo(videoInfo);
  await cleanupTempVideoByPath(tempPath);
}

/**
 * Cleans up temporary video file by video ID
 */
export async function cleanupTempVideoById(videoId: string, extension: string = "mov"): Promise<void> {
  const tempPath = getTempVideoPath(videoId, extension);
  await cleanupTempVideoByPath(tempPath);
}