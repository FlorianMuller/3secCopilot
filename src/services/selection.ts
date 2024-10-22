import { eq } from "drizzle-orm";
import { SelectVideoMetadata, videosMetadataTable } from "../db/schema";
import { db } from "../db/db";

export async function markVideoAsSelected(
  videoId: string,
  videoOriginalDate: Date,
  selectedForDate?: Date,
  trimStartTime?: number,
  trimEndTime?: number
): Promise<SelectVideoMetadata | null> {
  const toSet = {
    videoOriginalDate,
    assignedToDate: selectedForDate,
    isSelected: true,
    trimStartTime,
    trimEndTime,
    isHidden: false,
  };

  const res = await db
    .insert(videosMetadataTable)
    .values({
      videoId,
      ...toSet,
    })
    .onConflictDoUpdate({
      target: videosMetadataTable.videoId,
      set: toSet,
    })
    .returning();
  return returnOneMetadata(res);
}

export async function markVideoAsUnselected(videoId: string): Promise<SelectVideoMetadata | null> {
  const res = await db
    .update(videosMetadataTable)
    .set({
      isSelected: false,
    })
    .where(eq(videosMetadataTable.videoId, videoId))
    .returning();

  return returnOneMetadata(res);
}

export async function getVideoMetadata(videoId: string): Promise<SelectVideoMetadata | null> {
  const res = await db.select().from(videosMetadataTable).where(eq(videosMetadataTable.videoId, videoId)).limit(1);
  return returnOneMetadata(res);
}

// Util function to only return one videoMetadata from a list where
// they should only be at most one videoMetadata in it.
function returnOneMetadata(metaList: SelectVideoMetadata[]): SelectVideoMetadata | null {
  if (metaList.length == 0) {
    return null;
  }
  return metaList[0];
}
