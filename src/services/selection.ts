import { eq } from "drizzle-orm";
import { SelectVideoMetadata, videosMetadataTable } from "../db/schema";
import { db } from "../db/db";

export async function markVideoAsSelected(
  videoId: string,
  videoOriginalDate: Date,
  selectedForDate?: Date,
  trimStartTime?: number,
  trimEndTime?: number
) {
  const toSet = {
    videoOriginalDate,
    assignedToDate: selectedForDate,
    isSelected: true,
    trimStartTime,
    trimEndTime,
    isHidden: false,
  };

  await db
    .insert(videosMetadataTable)
    .values({
      videoId,
      ...toSet,
    })
    .onConflictDoUpdate({
      target: videosMetadataTable.videoId,
      set: toSet,
    });
}

export async function markVideoAsUnselected(videoId: string) {
  await db
    .update(videosMetadataTable)
    .set({
      isSelected: false,
    })
    .where(eq(videosMetadataTable.videoId, videoId));
}

export async function getVideoMetadata(videoId: string): Promise<SelectVideoMetadata | null> {
  const res = await db.select().from(videosMetadataTable).where(eq(videosMetadataTable.videoId, videoId)).limit(1);
  if (res.length == 0) {
    return null;
  }
  return res[0];
}
