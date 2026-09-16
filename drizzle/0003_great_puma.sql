CREATE TABLE `gas_tanks` (
	`profile` text PRIMARY KEY NOT NULL,
	`free` integer DEFAULT 0 NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`pulse` integer DEFAULT 0 NOT NULL,
	`session` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `gas_litres` integer DEFAULT 0 NOT NULL;