CREATE TABLE `videos_metadata` (
	`videoId` text PRIMARY KEY NOT NULL,
	`videoOriginalDate` integer NOT NULL,
	`assignedToDate` integer,
	`isSelected` integer,
	`trimStartTime` integer,
	`trimEndTime` integer,
	`isHidden` integer,
	CONSTRAINT "trim_start_time_positive" CHECK("videos_metadata"."trimStartTime" >= 0),
	CONSTRAINT "trim_end_time_positive" CHECK("videos_metadata"."trimEndTime" >= 0),
	CONSTRAINT "end_time_over_start_time" CHECK("videos_metadata"."trimEndTime" > "videos_metadata"."trimStartTime")
);
