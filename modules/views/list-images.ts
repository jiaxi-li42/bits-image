import "server-only";
import { and, desc, eq, isNull, isNotNull, sql, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { searchImageIds } from "@/modules/search/server";
import { type ViewKind, type ListImagesResult, type TagFilterMode, PAGE_SIZE } from "./types";

export async function listImages({
  view,
  cursor,
  limit = PAGE_SIZE,
  tagIds,
  tagMode = "and",
  query,
  folderId,
}: {
  view: ViewKind;
  cursor?: string | null;
  limit?: number;
  tagIds?: string[];
  tagMode?: TagFilterMode;
  query?: string;
  folderId?: string;
}): Promise<ListImagesResult> {
  let searchPredicate;
  if (query && query.trim()) {
    const ids = await searchImageIds(query);
    if (ids.length === 0) return { items: [], nextCursor: null };
    searchPredicate = inArray(schema.images.id, ids);
  }

  let folderPredicate;
  if (folderId) {
    const sub = db
      .select({ imageId: schema.imageFolders.imageId })
      .from(schema.imageFolders)
      .where(eq(schema.imageFolders.folderId, folderId));
    folderPredicate = inArray(schema.images.id, sub);
  }

  const deletedPredicate =
    view === "trash" ? isNotNull(schema.images.deletedAt) : isNull(schema.images.deletedAt);

  const taggedSubquery = db
    .select({ imageId: schema.imageTags.imageId })
    .from(schema.imageTags);

  const tagPredicate =
    view === "inbox"
      ? notInArray(schema.images.id, taggedSubquery)
      : view === "organised"
        ? inArray(schema.images.id, taggedSubquery)
        : undefined;

  const cleanTagIds = (tagIds ?? []).filter(Boolean);
  let tagFilterPredicate;
  if (cleanTagIds.length > 0) {
    if (tagMode === "or") {
      const sub = db
        .select({ imageId: schema.imageTags.imageId })
        .from(schema.imageTags)
        .where(inArray(schema.imageTags.tagId, cleanTagIds));
      tagFilterPredicate = inArray(schema.images.id, sub);
    } else {
      const sub = db
        .select({ imageId: schema.imageTags.imageId })
        .from(schema.imageTags)
        .where(inArray(schema.imageTags.tagId, cleanTagIds))
        .groupBy(schema.imageTags.imageId)
        .having(sql`count(distinct ${schema.imageTags.tagId}) = ${cleanTagIds.length}`);
      tagFilterPredicate = inArray(schema.images.id, sub);
    }
  }

  // Cursor: encoded as `${createdAt_ms}_${id}`. Rows with createdAt < cursor.createdAt,
  // or equal createdAt but id < cursor.id, lexicographic on (createdAt desc, id desc).
  let cursorPredicate;
  if (cursor) {
    const [tsStr, id] = cursor.split("_");
    const ts = Number(tsStr);
    if (Number.isFinite(ts) && id) {
      cursorPredicate = sql`(${schema.images.createdAt} < ${ts} OR (${schema.images.createdAt} = ${ts} AND ${schema.images.id} < ${id}))`;
    }
  }

  const where = and(
    deletedPredicate,
    ...(tagPredicate ? [tagPredicate] : []),
    ...(tagFilterPredicate ? [tagFilterPredicate] : []),
    ...(searchPredicate ? [searchPredicate] : []),
    ...(folderPredicate ? [folderPredicate] : []),
    ...(cursorPredicate ? [cursorPredicate] : []),
  );

  const rows = await db
    .select({
      id: schema.images.id,
      hash: schema.images.hash,
      width: schema.images.width,
      height: schema.images.height,
      title: schema.images.title,
      createdAt: schema.images.createdAt,
    })
    .from(schema.images)
    .where(where)
    .orderBy(desc(schema.images.createdAt), desc(schema.images.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    hash: r.hash,
    width: r.width,
    height: r.height,
    title: r.title,
    createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : (r.createdAt as number),
  }));

  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt}_${last.id}` : null;

  return { items, nextCursor };
}
