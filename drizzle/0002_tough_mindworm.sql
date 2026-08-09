CREATE TABLE `profile_settings` (
	`profile_key` text PRIMARY KEY NOT NULL,
	`weekly_goal` integer DEFAULT 4 NOT NULL,
	`gamification_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "profile_settings_weekly_goal_check" CHECK("profile_settings"."weekly_goal" BETWEEN 1 AND 7),
	CONSTRAINT "profile_settings_gamification_enabled_check" CHECK("profile_settings"."gamification_enabled" IN (0, 1))
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD `study_date` text;--> statement-breakpoint
UPDATE `attempts`
SET `study_date` = date(`completed_at` / 1000, 'unixepoch')
WHERE `study_date` IS NULL;--> statement-breakpoint
ALTER TABLE `attempts` ADD `content_type` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `attempts` ADD `content_id` text;--> statement-breakpoint
ALTER TABLE `attempts` ADD `content_label` text;--> statement-breakpoint
CREATE INDEX `idx_attempts_profile_study_date` ON `attempts` (`profile_key`,`study_date`);
