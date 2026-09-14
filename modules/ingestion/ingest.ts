import { randomUUID } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { uploadImage, deleteImageObjects } from "@/modules/storage/upload";
import { hammingDistance, sha256 } from "@/modules/storage/hash";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export type IngestResult =
  | { status: "ok"; imageId: string }
  | { status: "duplicate"; existingId: string }
  | { status: "error"; message: string };

// Shared by the web action and CLI; no Next request/cache dependencies.
export async function ingestImage(buffer: Buffer, filename: string): Promise<IngestResult> {
  if (!buffer.length) return { status: "error", message: "File is empty" };
  if (buffer.length > MAX_UPLOAD_BYTES) return { status: "error", message: "File exceeds 50 MB limit" };
  let uploaded: Awaited<ReturnType<typeof uploadImage>> | undefined;
  let inserted = false;
  try {
    const hash = sha256(buffer);
    const existing = await db.select({ id: schema.images.id }).from(schema.images)
      .where(eq(schema.images.hash, hash)).get();
    if (existing) return { status: "duplicate", existingId: existing.id };

    uploaded = await uploadImage(buffer);
    // ponytail: O(N) dHash scan for a personal library; bucket hashes if it outgrows ~10k images.
    const candidates = await db.select({ id: schema.images.id, phash: schema.images.phash })
      .from(schema.images).where(isNotNull(schema.images.phash)).all();
    const match = candidates.find((c) => c.phash !== null && hammingDistance(uploaded!.phash, c.phash) <= 2);
    if (match) {
      await deleteImageObjects(uploaded.key);
      return { status: "duplicate", existingId: match.id };
    }

    const id = randomUUID();
    // A concurrent exact match wins the unique hash constraint; its objects
    // have a different key, so deleting our attempt is safe.
    const rows = await db.insert(schema.images).values({
      id, r2Key: uploaded.key, width: uploaded.width, height: uploaded.height,
      hash, phash: uploaded.phash, title: filename.replace(/\.[^.]+$/, "").slice(0, 200),
    }).onConflictDoNothing({ target: schema.images.hash }).returning({ id: schema.images.id });
    if (rows.length) {
      inserted = true;
      return { status: "ok", imageId: id };
    }
    const winner = await db.select({ id: schema.images.id }).from(schema.images)
      .where(eq(schema.images.hash, hash)).get();
    await deleteImageObjects(uploaded.key);
    if (winner) return { status: "duplicate", existingId: winner.id };
    return { status: "error", message: "Image changed during upload. Please retry." };
  } catch (error) {
    console.error("Image ingestion failed", error);
    if (uploaded && !inserted) {
      // A DB response can fail after COMMIT. Check ownership before cleanup;
      // if the DB is unavailable, keep the objects rather than risk data loss.
      try {
        const committed = await db.select({ id: schema.images.id }).from(schema.images)
          .where(eq(schema.images.r2Key, uploaded.key)).get();
        if (!committed) await deleteImageObjects(uploaded.key);
      } catch (cleanupError) {
        console.error("Ingestion cleanup needs retry", uploaded.key, cleanupError);
      }
    }
    return { status: "error", message: "Image import failed. Please retry." };
  }
}
