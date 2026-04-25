"use server";

import { revalidatePath } from "next/cache";
import { eq, and, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { deleteAllForHash, getOriginalUrl } from "@/modules/storage";

function revalidateAllViews() {
  revalidatePath("/", "layout");
}

export async function softDeleteImage(id: string): Promise<void> {
  await db
    .update(schema.images)
    .set({ deletedAt: new Date() })
    .where(eq(schema.images.id, id));
  revalidateAllViews();
}

export async function restoreImage(id: string): Promise<void> {
  await db
    .update(schema.images)
    .set({ deletedAt: null })
    .where(eq(schema.images.id, id));
  revalidateAllViews();
}

export async function hardDeleteImage(id: string): Promise<void> {
  const row = await db
    .select({ hash: schema.images.hash })
    .from(schema.images)
    .where(eq(schema.images.id, id))
    .get();
  if (!row) return;

  await deleteAllForHash(row.hash).catch((err) => {
    console.warn("R2 cleanup failed:", err);
  });
  await db.delete(schema.images).where(eq(schema.images.id, id));
  revalidateAllViews();
}

export async function emptyTrash(): Promise<{ removed: number }> {
  const rows = await db
    .select({ id: schema.images.id, hash: schema.images.hash })
    .from(schema.images)
    .where(isNotNull(schema.images.deletedAt))
    .all();

  for (const r of rows) {
    await deleteAllForHash(r.hash).catch((err) => {
      console.warn(`R2 cleanup failed for ${r.hash}:`, err);
    });
    await db.delete(schema.images).where(eq(schema.images.id, r.id));
  }

  revalidateAllViews();
  return { removed: rows.length };
}

export async function getDownloadUrl(id: string): Promise<string | null> {
  const row = await db
    .select({ hash: schema.images.hash })
    .from(schema.images)
    .where(eq(schema.images.id, id))
    .get();
  if (!row) return null;
  return getOriginalUrl(row.hash, 300);
}

export async function purgeExpiredTrash(olderThanMs = 30 * 24 * 60 * 60 * 1000): Promise<{
  removed: number;
}> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db
    .select({ id: schema.images.id, hash: schema.images.hash })
    .from(schema.images)
    .where(and(isNotNull(schema.images.deletedAt), lt(schema.images.deletedAt, cutoff)))
    .all();

  for (const r of rows) {
    await deleteAllForHash(r.hash).catch(() => {});
    await db.delete(schema.images).where(eq(schema.images.id, r.id));
  }

  if (rows.length > 0) revalidateAllViews();
  return { removed: rows.length };
}
