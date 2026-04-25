DROP INDEX `folders_name_idx`;--> statement-breakpoint
ALTER TABLE `folders` ADD `parent_id` text REFERENCES folders(id);--> statement-breakpoint
CREATE UNIQUE INDEX `folders_name_parent_idx` ON `folders` (`name`,`parent_id`);--> statement-breakpoint
CREATE INDEX `folders_parent_idx` ON `folders` (`parent_id`);