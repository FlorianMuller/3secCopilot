import PQueue from "p-queue";

export enum ThumbnailPriority {
  HIGH = 1, // Visible on screen
  NORMAL = 0, // Near visible (within render distance)
  LOW = -1, // Off screen
}

// Global thumbnail generation queue with concurrency control
export const thumbnailQueue = new PQueue({
  concurrency: 3, // Maximum 3 thumbnails generating simultaneously
  intervalCap: 30, // Maximum 6 thumbnails per interval (prevents iOS resource exhaustion)
  interval: 1000, // 1 second interval
});
