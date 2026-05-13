"use server";

import { inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { deleteAllForHash } from "@/modules/storage";
import { revalidateAllViews } from "@/lib/revalidate";

export async function emptyTrash(): Promise<{ removed: number }> {
  const rows = await db
    .select({ id: schema.images.id, hash: schema.images.hash })
    .from(schema.images)
    .where(isNotNull(schema.images.deletedAt))
    .all();

  if (rows.length === 0) return { removed: 0 };

  // R2 deletes in parallel; one bulk DB DELETE — mirrors hardDeleteImages.
  await Promise.all(
    rows.map((r) =>
      deleteAllForHash(r.hash).catch((err) => {
        console.warn(`R2 cleanup failed for ${r.hash}:`, err);
      }),
    ),
  );
  await db.delete(schema.images).where(
    inArray(
      schema.images.id,
      rows.map((r) => r.id),
    ),
  );

  revalidateAllViews();
  return { removed: rows.length };
}
