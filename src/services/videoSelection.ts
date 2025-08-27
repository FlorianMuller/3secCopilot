import * as MediaLibrary from "expo-media-library";
import { VideoMetadata } from "../db/schema";
import { markVideoAsSelected, markVideoAsUnselected } from "./metadata";

export async function toggleVideoSelection(
  video: MediaLibrary.Asset,
  videoMetadata: VideoMetadata | null
): Promise<VideoMetadata | null> {
  if (videoMetadata?.isSelected) {
    console.log("Unselecting video");
    const newMetadata = await markVideoAsUnselected(video.id);
    if (!newMetadata) {
      console.error("Failed to unselect video: service returned null");
    }
    return newMetadata;
  }

  console.log("Selecting video");
  const newMetadata = await markVideoAsSelected(video.id, new Date(video.creationTime));
  if (!newMetadata) {
    console.error("Failed to select video: service returned null");
  }
  return newMetadata;
}
