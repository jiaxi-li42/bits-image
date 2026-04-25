CREATE VIRTUAL TABLE `images_fts` USING fts5(
	title,
	description,
	source_url,
	content='images',
	content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `images_fts` (rowid, title, description, source_url)
SELECT rowid, COALESCE(title, ''), COALESCE(description, ''), COALESCE(source_url, '') FROM `images`;
--> statement-breakpoint
CREATE TRIGGER `images_fts_ai` AFTER INSERT ON `images` BEGIN
	INSERT INTO `images_fts` (rowid, title, description, source_url)
	VALUES (new.rowid, COALESCE(new.title, ''), COALESCE(new.description, ''), COALESCE(new.source_url, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `images_fts_ad` AFTER DELETE ON `images` BEGIN
	INSERT INTO `images_fts` (`images_fts`, rowid, title, description, source_url)
	VALUES ('delete', old.rowid, COALESCE(old.title, ''), COALESCE(old.description, ''), COALESCE(old.source_url, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `images_fts_au` AFTER UPDATE ON `images` BEGIN
	INSERT INTO `images_fts` (`images_fts`, rowid, title, description, source_url)
	VALUES ('delete', old.rowid, COALESCE(old.title, ''), COALESCE(old.description, ''), COALESCE(old.source_url, ''));
	INSERT INTO `images_fts` (rowid, title, description, source_url)
	VALUES (new.rowid, COALESCE(new.title, ''), COALESCE(new.description, ''), COALESCE(new.source_url, ''));
END;
