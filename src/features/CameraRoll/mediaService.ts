import { PhoneMedia } from "./CameraRoll";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";

export async function getVideoThumbnail(video: PhoneMedia) {
  let info = video.info;
  if (info === undefined) {
    info = await MediaLibrary.getAssetInfoAsync(video.id);
  }

  const thumbnail = await VideoThumbnails.getThumbnailAsync(info.localUri || "");
  return thumbnail;
}
