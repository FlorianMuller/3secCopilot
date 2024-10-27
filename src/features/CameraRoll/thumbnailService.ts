import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { PhoneMedia } from "./CameraRoll";
import { doesFileExists, ensureDirExists } from "../../utils/fileSytem";

export const thumbnailCacheDir = FileSystem.cacheDirectory + "videoThumbnailsCache/";

// Return the location of a cached thumbnail based on a video id
export function getCachedThumbnailUri(videoId: string): string {
  return thumbnailCacheDir + `${videoId.replaceAll("/", "--")}.jpg`;
}

// Save a generated thumbnail in a cache directory
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

// Check if a video thumbnail has already been cached, if not generate it and cached it
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
