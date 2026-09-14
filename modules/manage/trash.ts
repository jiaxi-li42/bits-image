import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { deleteImageObjects } from "@/modules/storage/upload";
import { TRASH_RETENTION_MS } from "./retention";

export async function restoreTrashImages(ids: string[], now = Date.now()) {
  if (!ids.length) return { restored: 0 };
  const rows = await db.update(schema.images).set({ deletedAt: null }).where(and(
    inArray(schema.images.id, ids), isNull(schema.images.purgingAt),
    gt(schema.images.deletedAt, new Date(now - TRASH_RETENTION_MS)),
  )).returning({ id: schema.images.id });
  return { restored: rows.length };
}

// Claim before touching R2. Restore checks the marker atomically, so partial
// deletion can never turn into a restored image with missing files.
export async function purgeTrash({ ids, expiredOnly = false, limit, now = Date.now() }: {
  ids?: string[]; expiredOnly?: boolean; limit?: number; now?: number;
} = {}) {
  if (ids?.length === 0) return { removed: 0, failed: 0 };
  const conditions: SQL[] = [isNotNull(schema.images.deletedAt)];
  if (ids) conditions.push(inArray(schema.images.id, ids));
  if (expiredOnly) conditions.push(or(
    lte(schema.images.deletedAt, new Date(now - TRASH_RETENTION_MS)),
    isNotNull(schema.images.purgingAt),
  )!);
  const predicate = and(...conditions);
  const candidates = await db.select({ id: schema.images.id }).from(schema.images)
    .where(predicate).orderBy(asc(schema.images.purgingAt), asc(schema.images.deletedAt))
    .limit(limit ?? 2147483647).all();
  let removed = 0;
  let failed = 0;
  // Sequential requests bound storage pressure; interrupted work remains retryable.
  for (const candidate of candidates) {
    try {
      const [row] = await db.update(schema.images).set({ purgingAt: new Date(now) })
        .where(and(eq(schema.images.id, candidate.id), predicate))
        .returning({ id: schema.images.id, key: schema.images.r2Key });
      if (!row) continue;
      await deleteImageObjects(row.key);
      const deleted = await db.delete(schema.images)
        .where(and(eq(schema.images.id, row.id), isNotNull(schema.images.purgingAt)))
        .returning({ id: schema.images.id });
      removed += deleted.length;
    } catch (error) {
      failed++;
      console.error("Trash cleanup needs retry", candidate.id, error);
    }
  }
  return { removed, failed };
}
