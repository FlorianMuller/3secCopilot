PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_videos_metadata` (
	`video_id` text PRIMARY KEY NOT NULL,
	`video_original_date` integer NOT NULL,
	`assigned_to_date` integer,
	`is_selected` integer DEFAULT false NOT NULL,
	`trim_start_time` integer,
	`trim_end_time` integer,
	`title` text,
	`description` text,
	`is_hidden` integer DEFAULT false NOT NULL,
	`is_in_stash` integer DEFAULT false NOT NULL,
	CONSTRAINT "trim_start_time_positive" CHECK("__new_videos_metadata"."trim_start_time" >= 0),
	CONSTRAINT "trim_end_time_positive" CHECK("__new_videos_metadata"."trim_end_time" >= 0),
	CONSTRAINT "end_time_over_start_time" CHECK("__new_videos_metadata"."trim_end_time" > "__new_videos_metadata"."trim_start_time"),
	CONSTRAINT "cant_be_selected_and_hidden" CHECK("__new_videos_metadata"."is_selected" != 1 OR "__new_videos_metadata"."is_hidden" != 1),
	CONSTRAINT "cant_be_selected_and_in_stash" CHECK("__new_videos_metadata"."is_selected" != 1 OR "__new_videos_metadata"."is_in_stash" != 1)
);
--> statement-breakpoint
INSERT INTO `__new_videos_metadata`("video_id", "video_original_date", "assigned_to_date", "is_selected", "trim_start_time", "trim_end_time", "title", "description", "is_hidden") SELECT "video_id", "video_original_date", "assigned_to_date", "is_selected", "trim_start_time", "trim_end_time", "title", "description", "is_hidden" FROM `videos_metadata`;--> statement-breakpoint
DROP TABLE `videos_metadata`;--> statement-breakpoint
ALTER TABLE `__new_videos_metadata` RENAME TO `videos_metadata`;--> statement-breakpoint
PRAGMA foreign_keys=ON;