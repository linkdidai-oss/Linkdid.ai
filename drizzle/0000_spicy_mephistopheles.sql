CREATE TABLE `bids` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`owner` text NOT NULL,
	`amount` integer NOT NULL,
	`created` integer NOT NULL,
	`mode` text DEFAULT 'sandbox' NOT NULL,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bids_profile` ON `bids` (`profile`);--> statement-breakpoint
CREATE INDEX `bids_created` ON `bids` (`created`);--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`viewer` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metrics_daily_viewer` ON `metrics` (`profile`,`viewer`,`kind`,`day`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL,
	`read` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_owner_created` ON `notifications` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`headline` text NOT NULL,
	`url` text NOT NULL,
	`category` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`photo` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_owner` ON `profiles` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_url` ON `profiles` (`url`);