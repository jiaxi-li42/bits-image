import "server-only";
import { and, desc, isNull, isNotNull, lt, sql, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { type ViewKind, type ListImagesResult, PAGE_SIZE } from "./types";

export async function listImages({
  view,
  cursor,
  limit = PAGE_SIZE,
}: {
  view: ViewKind;
  cursor?: string | null;
  limit?: number;
}): Promise<ListImagesResult> {
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
