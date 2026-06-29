import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
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

export async function getVideosWithAssignedDateInRange(
  createdAfter: Date,
  createdBefore: Date
): Promise<Record<string, SelectVideoMetadata>> {
  const metadataList = await db
    .select()
    .from(videosMetadataTable)
    .where(
      and(
        isNotNull(videosMetadataTable.assignedToDate),
        gte(videosMetadataTable.assignedToDate, createdAfter),
        lte(videosMetadataTable.assignedToDate, createdBefore)
      )
    );

  return groupByUnique(metadataList, (m) => m.videoId);
}

// Returns all selected videos whose effective date (assignedToDate, falling back to videoOriginalDate)
// falls within the given chronological range [rangeStart, rangeEnd].
// Bounds are passed as epoch seconds because the COALESCE is a raw `sql` expression and Drizzle only
// auto-encodes Date values for typed columns. Callers should pass a buffered range and do the exact
// in-period (and day-shift) filtering themselves.
export async function getSelectedVideosMetadataInRange(
  rangeStart: Date,
  rangeEnd: Date
): Promise<SelectVideoMetadata[]> {
  const startSec = Math.floor(rangeStart.getTime() / 1000);
  const endSec = Math.floor(rangeEnd.getTime() / 1000);
  const effectiveDate = sql`COALESCE(${videosMetadataTable.assignedToDate}, ${videosMetadataTable.videoOriginalDate})`;

  return db
    .select()
    .from(videosMetadataTable)
    .where(and(eq(videosMetadataTable.isSelected, true), gte(effectiveDate, startSec), lte(effectiveDate, endSec)));
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

// Cheat stash --------------------------------------------------------------------------------------

// Mark a video as a "filler" kept aside in the cheat stash. A stashed video has no day yet, so we
// also clear any prior day assignment — otherwise the assigned-date pull-in in videoAssembly would
// drag it back into the roll on its old day (and it would still show the "moved" badge). Clearing
// selection keeps the cant_be_selected_and_in_stash constraint satisfied.
export async function addVideoToStash(videoId: string, videoOriginalDate: Date): Promise<SelectVideoMetadata | null> {
  return upsertVideoMetadata({
    videoId,
    videoOriginalDate,
    isInStash: true,
    isSelected: false,
    assignedToDate: null,
  });
}

// All videos currently in the cheat stash, newest-filmed first.
export async function getStashVideosMetadata(): Promise<SelectVideoMetadata[]> {
  return db
    .select()
    .from(videosMetadataTable)
    .where(eq(videosMetadataTable.isInStash, true))
    .orderBy(desc(videosMetadataTable.videoOriginalDate));
}

export async function removeVideoFromStash(videoId: string): Promise<SelectVideoMetadata | null> {
  const res = await db
    .update(videosMetadataTable)
    .set({
      isInStash: false,
    })
    .where(eq(videosMetadataTable.videoId, videoId))
    .returning();

  return returnOneMetadata(res);
}

// Use a stashed video to fill a forgotten day: assign it to that day, select it, and take it out of the
// stash — all in one upsert. `assignedToDate` must already sit inside the target day's effective window
// (computed at the day-shift cutoff time by the caller).
export async function chooseStashVideoForDay(
  videoId: string,
  videoOriginalDate: Date,
  assignedToDate: Date
): Promise<SelectVideoMetadata | null> {
  return upsertVideoMetadata({
    videoId,
    videoOriginalDate,
    assignedToDate,
    isSelected: true,
    isInStash: false,
  });
}

export async function updateVideoTitleAndDescription(
  videoId: string,
  videoOriginalDate: Date,
  title: string | null,
  description: string | null
): Promise<SelectVideoMetadata | null> {
  return upsertVideoMetadata({
    videoId,
    videoOriginalDate,
    title: title,
    description: description,
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
