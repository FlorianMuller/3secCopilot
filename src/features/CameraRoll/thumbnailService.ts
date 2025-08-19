import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { PhoneMedia } from "./CameraRoll";
import { doesFileExists, ensureDirExists, idToFileName } from "../../utils/fileSytem";
import { getLocalUri } from "../../services/mediaLocalUri";
import { thumbnailQueue, ThumbnailPriority } from "../../services/thumbnailQueue";
import { copyVideoToTemp, cleanupTempVideo } from "../../services/localVideo";

export const thumbnailCacheDir = FileSystem.cacheDirectory + "videoThumbnailsCache/";

// Return the location of a cached thumbnail based on a video id
export function getCachedThumbnailUri(videoId: string): string {
  return thumbnailCacheDir + `${idToFileName(videoId)}.jpg`;
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

export interface ThumbnailOptions {
  priority?: ThumbnailPriority;
  signal?: AbortSignal;
}

// Internal function to generate thumbnail (runs in queue)
async function generateThumbnailTask(
  video: PhoneMedia,
  { signal }: { signal?: AbortSignal }
): Promise<GetThumbnailResult> {
  // Check if already aborted
  if (signal?.aborted) {
    return { status: "generationFailed", uri: null };
  }

  let info = video.info;
  try {
    if (info === undefined) {
      info = await MediaLibrary.getAssetInfoAsync(video.id);
    }
  } catch (e) {
    console.error("error while getting video info (to get local uri)", e);
    return { status: "generationFailed", uri: null };
  }

  // Check abort again before proceeding
  if (signal?.aborted) {
    return { status: "generationFailed", uri: null };
  }

  let thumbnailResult: VideoThumbnails.VideoThumbnailsResult | null = null;

  try {
    // First try direct URI methods for iOS 18 compatibility
    const uriOptions = [info.localUri?.split("#")[0], getLocalUri(info), info?.localUri, video.uri].filter(Boolean);

    for (const uri of uriOptions) {
      // Check abort before each URI attempt
      if (signal?.aborted) {
        return { status: "generationFailed", uri: null };
      }

      try {
        thumbnailResult = await VideoThumbnails.getThumbnailAsync(uri || "", {
          quality: 0.3,
          time: Math.round(Math.min(1000, (video.duration * 1000) / 2)), // Round to integer
        });
        break; // Success, exit loop
      } catch (e) {
        // Failed generating thumbnail with direct URI, trying next
        continue;
      }
    }

    // If direct methods failed, try copying to temp and generate from temp file
    if (!thumbnailResult) {
      console.log("Direct URI methods failed, trying temp file approach...");

      if (signal?.aborted) {
        return { status: "generationFailed", uri: null };
      }

      const tempPath = await copyVideoToTemp(info);

      try {
        thumbnailResult = await VideoThumbnails.getThumbnailAsync(tempPath, {
          quality: 0.3,
          time: Math.round(Math.min(1000, (video.duration * 1000) / 2)), // Round to integer
        });
      } finally {
        // Always cleanup temp file
        await cleanupTempVideo(info);
      }
    }

    if (!thumbnailResult) {
      console.error("error while generating video thumbnail - all methods failed", video);
      return { status: "generationFailed", uri: null };
    }
  } catch (tempError) {
    console.error("error during temp file thumbnail generation", tempError);
    return { status: "generationFailed", uri: null };
  }

  // Moving it to cache directory
  const cachedThumbnailUri = await cacheThumbnail(video.id, thumbnailResult.uri);
  if (cachedThumbnailUri === null) {
    return { status: "generatedAndCachedFailed", uri: thumbnailResult.uri };
  }

  return { status: "generatedAndCached", uri: cachedThumbnailUri };
}

// Check if a video thumbnail has already been cached, if not queue it for generation
export async function getVideoThumbnail(
  video: PhoneMedia,
  options: ThumbnailOptions = {}
): Promise<GetThumbnailResult> {
  const cachedUri = getCachedThumbnailUri(video.id);
  if (await doesFileExists(cachedUri)) {
    return { status: "alreadyCached", uri: cachedUri };
  }

  // Queue the thumbnail generation with priority
  try {
    const result = await thumbnailQueue.add(({ signal }) => generateThumbnailTask(video, { signal }), {
      priority: options.priority ?? ThumbnailPriority.NORMAL,
      signal: options.signal,
    });
    return result ?? { status: "generationFailed", uri: null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { status: "generationFailed", uri: null };
    }
    console.error("error in thumbnail queue", e, "for video:", video?.id);
    return { status: "generationFailed", uri: null };
  }
}
