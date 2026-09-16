CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`profile` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`provider` text,
	`status` text DEFAULT 'creating' NOT NULL,
	`details` text,
	`created` integer NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_provider_unique` ON `orders` (`provider`);--> statement-breakpoint
CREATE INDEX `orders_owner_created` ON `orders` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `paid_bids` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`amount` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `paid_bids_profile` ON `paid_bids` (`profile`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tickets_owner_created` ON `tickets` (`owner`,`created`);