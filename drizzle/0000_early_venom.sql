CREATE TABLE `attempt_answers` (
	`attempt_id` text NOT NULL,
	`profile_key` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_option` text,
	`status` text NOT NULL,
	`completed_at` integer NOT NULL,
	PRIMARY KEY(`attempt_id`, `question_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_answers_profile_question` ON `attempt_answers` (`profile_key`,`question_id`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_key` text NOT NULL,
	`completed_at` integer NOT NULL,
	`mode` text NOT NULL,
	`total` integer NOT NULL,
	`correct` integer NOT NULL,
	`incorrect` integer NOT NULL,
	`blank` integer NOT NULL,
	`direct_score` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_profile_completed` ON `attempts` (`profile_key`,`completed_at`);
--> statement-breakpoint
PRAGMA optimize;
