"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { deleteAllForHash } from "@/modules/storage";

function revalidateAllViews() {
  revalidatePath("/", "layout");
}

async function ancestorIds(folderId: string): Promise<string[]> {
  // Walk up the parent chain. Bounded; matches modules/folders/server.ts.
  const ids: string[] = [];
  let current: string | null = folderId;
  for (let i = 0; i < 32 && current; i++) {
    const row = await db
      .select({ parentId: schema.folders.parentId })
      .from(schema.folders)
      .where(eq(schema.folders.id, current))
      .get();
    if (!row || !row.parentId) break;
    ids.push(row.parentId);
    current = row.parentId;
  }
  return ids;
}

export async function addImagesToFolder(
  imageIds: string[],
  folderId: string,
): Promise<{ added: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return { added: 0 };
  const folderIds = [folderId, ...(await ancestorIds(folderId))];
  // Cartesian: every selected image × (target folder + ancestors). One bulk
  // insert with onConflictDoNothing keeps existing memberships untouched.
  const rows = ids.flatMap((imageId) =>
    folderIds.map((fid) => ({ imageId, folderId: fid })),
  );
  await db
    .insert(schema.imageFolders)
    .values(rows)
    .onConflictDoNothing()
    .run();
  revalidateAllViews();
  return { added: ids.length };
}

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
  for (const r of rows) {
    await deleteAllForHash(r.hash).catch((err) => {
      console.warn(`R2 cleanup failed for ${r.hash}:`, err);
    });
  }
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
