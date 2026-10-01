CREATE TABLE `highscores` (
	`run_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`score` integer NOT NULL,
	`rifts` integer NOT NULL,
	`kills` integer NOT NULL,
	`level` integer NOT NULL,
	`seconds` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_highscores_ranking` ON `highscores` (`score`,`rifts`,`kills`,`created_at`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`visitor` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_runs_visitor_started` ON `runs` (`visitor`,`started_at`);