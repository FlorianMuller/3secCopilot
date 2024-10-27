import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { PhoneMedia } from "./CameraRoll";

export const thumbnailCacheDir = FileSystem.cacheDirectory + "videoThumbnailsCache/";

async function ensureDirExists(dir: string) {
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function doesFileExists(fileUri: string): Promise<boolean> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  return fileInfo.exists;
}

export function getCachedThumbnailUri(videoId: string): string {
  return thumbnailCacheDir + `${videoId.replaceAll("/", "--")}.jpg`;
}

async function cacheThumbnail(videoId: string, generatedthumbnailUri: string): Promise<string | null> {
  const cachedThumbnailUri = getCachedThumbnailUri(videoId);
  try {
    await ensureDirExists(thumbnailCacheDir);
    await FileSystem.moveAsync({
      from: generatedthumbnailUri,
      to: cachedThumbnailUri,
    });
  } catch (e) {
    console.error("error while moving thumbnail to cache dir: ", e);
    return null;
  }
  return cachedThumbnailUri;
}

export interface GetThumbnailResult {
  uri: string | null;
  status: "alreadyCached" | "generatedAndCached" | "generatedAndCachedFailed" | "generationFailed";
}

export async function getVideoThumbnail(video: PhoneMedia): Promise<GetThumbnailResult> {
  let info = video.info;
  if (info === undefined) {
    info = await MediaLibrary.getAssetInfoAsync(video.id);
  }

  const cachedUri = getCachedThumbnailUri(video.id);
  if (await doesFileExists(cachedUri)) {
    return { status: "alreadyCached", uri: cachedUri };
  }

  // Generating video thumbnail
  let thumbnailResult: VideoThumbnails.VideoThumbnailsResult;
  try {
    thumbnailResult = await VideoThumbnails.getThumbnailAsync(info.localUri || "", { quality: 0 });
  } catch (e) {
    console.error("error while generating video thumbnail", e);
    return { status: "generationFailed", uri: null };
  }

  // Moving it to cache directory
  const cachedThumbnailUri = await cacheThumbnail(video.id, thumbnailResult.uri);
  if (cachedThumbnailUri === null) {
    return { status: "generatedAndCachedFailed", uri: thumbnailResult.uri };
  }

  return { status: "generatedAndCached", uri: cachedThumbnailUri };
}
