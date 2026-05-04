"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { deleteAllForHash } from "@/modules/storage";
import { revalidateAllViews } from "@/lib/revalidate";

export async function softDeleteImages(
  imageIds: string[],
): Promise<{ removed: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return { removed: 0 };
  await db
    .update(schema.images)
    .set({ deletedAt: new Date() })
    .where(inArray(schema.images.id, ids));
  revalidateAllViews();
  return { removed: ids.length };
}

export async function restoreImages(
  imageIds: string[],
): Promise<{ restored: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return { restored: 0 };
  await db
    .update(schema.images)
    .set({ deletedAt: null })
    .where(inArray(schema.images.id, ids));
  revalidateAllViews();
  return { restored: ids.length };
}

export async function hardDeleteImages(
  imageIds: string[],
): Promise<{ removed: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return { removed: 0 };
  const rows = await db
    .select({ id: schema.images.id, hash: schema.images.hash })
    .from(schema.images)
    .where(
      and(inArray(schema.images.id, ids), isNotNull(schema.images.deletedAt)),
    )
    .all();
  await Promise.all(
    rows.map((r) =>
      deleteAllForHash(r.hash).catch((err) => {
        console.warn(`R2 cleanup failed for ${r.hash}:`, err);
      }),
    ),
  );
  if (rows.length > 0) {
    await db.delete(schema.images).where(
      inArray(
        schema.images.id,
        rows.map((r) => r.id),
      ),
    );
  }
  revalidateAllViews();
  return { removed: rows.length };
}

export type TagStateForImages = {
  id: string;
  name: string;
  count: number; // how many of the selected images have this tag
  total: number; // = imageIds.length
};

export async function getTagStatesForImages(
  imageIds: string[],
): Promise<TagStateForImages[]> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      count: sql<number>`count(distinct ${schema.imageTags.imageId})`,
    })
    .from(schema.tags)
    .innerJoin(schema.imageTags, eq(schema.imageTags.tagId, schema.tags.id))
    .where(inArray(schema.imageTags.imageId, ids))
    .groupBy(schema.tags.id)
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
    total: ids.length,
  }));
}

export async function applyTagDiffToImages(
  imageIds: string[],
  add: string[],
  remove: string[],
): Promise<void> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return;

  if (add.length > 0) {
    const addRows = ids.flatMap((imageId) =>
      add.map((tagId) => ({ imageId, tagId })),
    );
    await db
      .insert(schema.imageTags)
      .values(addRows)
      .onConflictDoNothing()
      .run();
  }
  if (remove.length > 0) {
    await db
      .delete(schema.imageTags)
      .where(
        and(
          inArray(schema.imageTags.imageId, ids),
          inArray(schema.imageTags.tagId, remove),
        ),
      );
  }
  revalidateAllViews();
}
