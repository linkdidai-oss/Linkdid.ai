CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request` text NOT NULL,
	`profile` text NOT NULL,
	`started` integer NOT NULL,
	`expires` integer NOT NULL,
	`streak` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claims_request_unique` ON `claims` (`request`);--> statement-breakpoint
CREATE INDEX `claims_profile_id` ON `claims` (`profile`,`id`);--> statement-breakpoint
CREATE INDEX `claims_expires_id` ON `claims` (`expires`,`id`);