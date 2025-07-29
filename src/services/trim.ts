import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { doesFileExists, idToFileName } from "../utils/fileSytem";

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
