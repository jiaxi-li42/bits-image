"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { purgeTrash, restoreTrashImages } from "./trash";
import { revalidateAllViews } from "@/lib/revalidate";

export async function softDeleteImages(
  imageIds: string[],
): Promise<{ removed: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return { removed: 0 };
  await db
    .update(schema.images)
    .set({ deletedAt: new Date() })
    .where(and(inArray(schema.images.id, ids), isNull(schema.images.deletedAt)));
  revalidateAllViews();
  return { removed: ids.length };
}

export async function restoreImages(
  imageIds: string[],
): Promise<{ restored: number }> {
  const result = await restoreTrashImages(imageIds.filter(Boolean));
  revalidateAllViews();
  return result;
}

export async function hardDeleteImages(
  imageIds: string[],
): Promise<{ removed: number; failed: number }> {
  const result = await purgeTrash({ ids: imageIds.filter(Boolean) });
  revalidateAllViews();
  return result;
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
