ALTER TABLE `images` ADD `purging_at` integer;
--> statement-breakpoint
-- libSQL's migrate() disables foreign keys before its transaction. Rebuild
-- without renaming the old table, preserving image_folders references/data.
CREATE TABLE `__new_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `parent_id` text REFERENCES `folders`(`id`) ON DELETE CASCADE,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_folders` (`id`, `name`, `parent_id`, `created_at`)
SELECT `id`, `name`, `parent_id`, `created_at` FROM `folders`;
--> statement-breakpoint
DROP TABLE `folders`;
--> statement-breakpoint
ALTER TABLE `__new_folders` RENAME TO `folders`;
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_name_parent_idx` ON `folders` (`name`, `parent_id`);
--> statement-breakpoint
CREATE INDEX `folders_parent_idx` ON `folders` (`parent_id`);
--> statement-breakpoint
-- Fail and roll back the migration if pre-existing broken references exist.
CREATE TABLE `__migration_fk_check` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `__migration_fk_check` SELECT count(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE `__migration_fk_check`;
