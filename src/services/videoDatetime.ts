import { PhoneMedia } from "../features/CameraRoll/CameraRoll";

export function getVideoDatetime(video: PhoneMedia): Date {
  return video.metadata?.assignedToDate ? new Date(video.metadata.assignedToDate) : new Date(video.creationTime);
}

export function hasVideoBeenMoved(video: PhoneMedia): boolean {
  if (!video.metadata || !video.metadata.assignedToDate) {
    return false;
  }
  const originalDate = new Date(video.creationTime);
  const assignedDate = video.metadata.assignedToDate;

  // Check that datetime are the same (ignoring miliseconds)
  return !(
    originalDate.getFullYear() === assignedDate.getFullYear() &&
    originalDate.getMonth() === assignedDate.getMonth() &&
    originalDate.getDate() === assignedDate.getDate() &&
    originalDate.getHours() === assignedDate.getHours() &&
    originalDate.getMinutes() === assignedDate.getMinutes()
  );
}
