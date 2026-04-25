CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_name_idx` ON `folders` (`name`);--> statement-breakpoint
CREATE TABLE `image_folders` (
	`image_id` text NOT NULL,
	`folder_id` text NOT NULL,
	PRIMARY KEY(`image_id`, `folder_id`),
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_folders_folder_idx` ON `image_folders` (`folder_id`);