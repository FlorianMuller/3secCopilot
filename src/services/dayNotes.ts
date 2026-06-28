import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/db";
import { dayNotesTable } from "../db/schema";

/**
 * Loads all day notes whose day falls within [after, before], keyed by
 * `day.toDateString()` so callers can look them up the same way the camera
 * roll groups videos by day.
 */
export async function getDayNotesInRange(after: Date, before: Date): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(dayNotesTable)
    .where(and(gte(dayNotesTable.day, after), lte(dayNotesTable.day, before)));

  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.day.toDateString()] = row.note;
    return acc;
  }, {});
}

export async function saveDayNote(day: Date, note: string): Promise<void> {
  await db
    .insert(dayNotesTable)
    .values({ day, note, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: dayNotesTable.day,
      set: { note, updatedAt: new Date() },
    });
}

export async function deleteDayNote(day: Date): Promise<void> {
  await db.delete(dayNotesTable).where(eq(dayNotesTable.day, day));
}
