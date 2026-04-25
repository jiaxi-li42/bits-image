import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey(),
    r2Key: text("r2_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    hash: text("hash").notNull(),
    phash: text("phash"),
    title: text("title"),
    description: text("description"),
    sourceUrl: text("source_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("images_created_at_idx").on(t.createdAt),
    uniqueIndex("images_hash_idx").on(t.hash),
    index("images_deleted_at_idx").on(t.deletedAt),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const imageTags = sqliteTable(
  "image_tags",
  {
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.imageId, t.tagId] }),
    index("image_tags_tag_idx").on(t.tagId),
  ],
);

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id").references((): AnySQLiteColumn => folders.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("folders_name_parent_idx").on(t.name, t.parentId),
    index("folders_parent_idx").on(t.parentId),
  ],
);

export const imageFolders = sqliteTable(
  "image_folders",
  {
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.imageId, t.folderId] }),
    index("image_folders_folder_idx").on(t.folderId),
  ],
);

export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
