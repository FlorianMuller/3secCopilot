import { eq, inArray } from "drizzle-orm";
import { SelectVideoMetadata, videosMetadataTable } from "../db/schema";
import { db } from "../db/db";
import { groupByUnique } from "../utils/groupBy";

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

export async function getVideosMetadtaByIds(videoIds: string[]): Promise<Record<string, SelectVideoMetadata>> {
  const metadataList = await db
    .select()
    .from(videosMetadataTable)
    .where(inArray(videosMetadataTable.videoId, videoIds));

  return groupByUnique(metadataList, (m) => m.videoId);
}

export async function updateVideoTrimMetadata(
  videoId: string,
  trimStartTime: number,
  trimEndTime: number
): Promise<SelectVideoMetadata | null> {
  const res = await db
    .update(videosMetadataTable)
    .set({
      trimStartTime,
      trimEndTime,
    })
    .where(eq(videosMetadataTable.videoId, videoId))
    .returning();

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
