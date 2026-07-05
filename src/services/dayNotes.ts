import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/db";
import { dayNotesTable } from "../db/schema";

/**
 * Loads all day notes whose day falls between the two bounds (inclusive),
 * keyed by `day.toDateString()` so callers can look them up the same way the
 * camera roll groups videos by day.
 *
 * The bounds are accepted in either order: the camera roll passes its period as
 * (startDate, endDate) where `startDate` is the more recent day, so we normalize
 * to [lower, upper] here instead of assuming a fixed ordering.
 */
export async function getDayNotesInRange(bound1: Date, bound2: Date): Promise<Record<string, string>> {
  const [lower, upper] = bound1.getTime() <= bound2.getTime() ? [bound1, bound2] : [bound2, bound1];

  const rows = await db
    .select()
    .from(dayNotesTable)
    .where(and(gte(dayNotesTable.day, lower), lte(dayNotesTable.day, upper)));

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
