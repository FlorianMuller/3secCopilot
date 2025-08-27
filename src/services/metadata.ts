import { eq, inArray } from "drizzle-orm";
import { InsertVideoMetadata, SelectVideoMetadata, videosMetadataTable } from "../db/schema";
import { db } from "../db/db";
import { groupByUnique } from "../utils/groupBy";

async function upsertVideoMetadata(data: InsertVideoMetadata): Promise<SelectVideoMetadata | null> {
  const { videoId, videoOriginalDate, ...updateFields } = data;

  // Remove undefined values to avoid overwriting with null
  const cleanUpdateFields = Object.fromEntries(
    Object.entries(updateFields).filter(([_, value]) => value !== undefined)
  );

  const res = await db
    .insert(videosMetadataTable)
    .values({
      videoId,
      videoOriginalDate,
      // Provide required defaults for insert case
      isSelected: data.isSelected ?? false,
      isHidden: data.isHidden ?? false,
      ...cleanUpdateFields,
    })
    .onConflictDoUpdate({
      target: videosMetadataTable.videoId,
      set: cleanUpdateFields,
    })
    .returning();

  return returnOneMetadata(res);
}

export async function markVideoAsSelected(
  videoId: string,
  videoOriginalDate: Date
): Promise<SelectVideoMetadata | null> {
  return upsertVideoMetadata({
    videoId,
    videoOriginalDate,
    isSelected: true,
    isHidden: false,
  });
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
  videoOriginalDate: Date,
  trimStartTime: number,
  trimEndTime: number
): Promise<SelectVideoMetadata | null> {
  return upsertVideoMetadata({
    videoId,
    videoOriginalDate,
    trimStartTime,
    trimEndTime,
  });
}

export async function changeVideoDate(
  videoId: string,
  videoOriginalDate: Date,
  newAssignedDate: Date | null
): Promise<SelectVideoMetadata | null> {
  return upsertVideoMetadata({
    videoId,
    videoOriginalDate,
    assignedToDate: newAssignedDate,
  });
}

// Util function to only return one videoMetadata from a list where
// they should only be at most one videoMetadata in it.
function returnOneMetadata(metaList: SelectVideoMetadata[]): SelectVideoMetadata | null {
  if (metaList.length == 0) {
    return null;
  }
  return metaList[0];
}
