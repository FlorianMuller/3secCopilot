import * as MediaLibrary from "expo-media-library";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { getStashVideosMetadata } from "./metadata";

// Load every stashed video as a renderable PhoneMedia, newest-filmed first. Assets that can no longer
// be resolved from the media library (deleted from the phone) are skipped, same null-tolerant pattern
// as the assigned-video pull-in in videoAssembly.
export async function getStashVideos(): Promise<PhoneMedia[]> {
  // Already ordered newest-filmed first; Promise.all preserves that order.
  const stashMetadata = await getStashVideosMetadata();

  const videos = await Promise.all(
    stashMetadata.map(async (metadata) => {
      try {
        const asset = await MediaLibrary.getAssetInfoAsync(metadata.videoId);
        return { ...asset, metadata } as PhoneMedia;
      } catch {
        console.error(`Failed to get asset info for stashed video ${metadata.videoId}`);
        return null;
      }
    })
  );

  return videos.filter((v): v is PhoneMedia => v !== null);
}
