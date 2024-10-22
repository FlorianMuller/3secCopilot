import { InferSelectModel, sql } from "drizzle-orm";
import { check, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const videosMetadataTable = sqliteTable(
  "videos_metadata",
  {
    // Original video info
    videoId: text().primaryKey(),
    videoOriginalDate: int({ mode: "timestamp" }).notNull(),
    assignedToDate: int({ mode: "timestamp" }),

    // Selection
    isSelected: int({ mode: "boolean" }).default(false).notNull(),
    trimStartTime: int(),
    trimEndTime: int(),

    // Other
    isHidden: int({ mode: "boolean" }).default(false).notNull(),
  },
  (table) => ({
    // Ensure trim times are valid
    trimStartTimePositive: check("trim_start_time_positive", sql`${table.trimStartTime} >= 0`),
    trimEndTimePositive: check("trim_end_time_positive", sql`${table.trimEndTime} >= 0`),
    endTimeOverStartTime: check("end_time_over_start_time", sql`${table.trimEndTime} > ${table.trimStartTime}`),

    // Ensure video can't be both selected and hidden
    cantBeSelectedAndHidden: check(
      "cant_be_selected_and_hidden",
      sql`${table.isSelected} != 1 OR ${table.isHidden} != 1`
    ),
  })
);

export type SelectVideoMetadata = typeof videosMetadataTable.$inferSelect;
export type InsertVideoMetadata = typeof videosMetadataTable.$inferInsert;

export type VideoMetadata = SelectVideoMetadata;
