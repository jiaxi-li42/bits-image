"use server";

import { randomUUID } from "node:crypto";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { uploadImage, deleteAllForHash } from "@/modules/storage";
import { hammingDistance } from "@/modules/storage/hash";
import { addImageToFolder } from "@/modules/folders";
import { assignTag } from "@/modules/tags";
import { revalidateAllViews } from "@/lib/revalidate";

// Hamming distance threshold for treating a perceptual-hash match as a
// duplicate. ≤ 2 catches re-encodes / format conversions / resizes (which
// typically produce distance 0–2) without flagging different photos from
// the same shoot (typically distance 5+). Tightening to 0 misses minor
// JPEG quality changes; loosening past 4 starts catching unrelated images.
const PHASH_DUPE_THRESHOLD = 2;

export type IngestResult =
  | { status: "ok"; imageId: string }
  | { status: "duplicate"; existingId: string }
  | { status: "error"; message: string };

export async function ingestFile(formData: FormData): Promise<IngestResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { status: "error", message: "No file provided" };
  }
  if (file.size === 0) {
    return { status: "error", message: "File is empty" };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { status: "error", message: "File exceeds 50 MB limit" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let uploaded;
  try {
    uploaded = await uploadImage(buffer);
  } catch (err) {
    console.error("uploadImage failed:", err);
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Upload failed",
    };
  }

  // Fast path: byte-identical match via SHA-256 unique index.
  let existing = await db
    .select({ id: schema.images.id })
    .from(schema.images)
    .where(eq(schema.images.hash, uploaded.hash))
    .get();
  let isPhashOnlyMatch = false;

  // Fuzzy path: perceptual match via dHash. Only runs when SHA missed —
  // re-encodes / different formats / different resolutions of the same
  // image have different SHA but a tiny Hamming distance on phash. We
  // scan all rows with a populated phash (NULL for legacy uploads) and
  // pick the first within the threshold. O(N) is fine at personal-library
  // scale; would need bucketing/BK-tree past ~10k images.
  if (!existing) {
    const candidates = await db
      .select({ id: schema.images.id, phash: schema.images.phash })
      .from(schema.images)
      .where(isNotNull(schema.images.phash))
      .all();
    const match = candidates.find(
      (c) =>
        c.phash !== null &&
        hammingDistance(uploaded.phash, c.phash) <= PHASH_DUPE_THRESHOLD,
    );
    if (match) {
      existing = { id: match.id };
      isPhashOnlyMatch = true;
    }
  }

  const folderId = formData.get("folderId");
  const tagId = formData.get("tagId");

  if (existing) {
    // SHA match: the R2 PUT was idempotent (same hash → same key) so the
    // file already lived there; nothing to clean up. Phash-only match:
    // the new bytes have a different SHA and live at a different R2 key
    // — they're now orphans we shouldn't pay storage for. Delete them.
    if (isPhashOnlyMatch) {
      await deleteAllForHash(uploaded.hash).catch(() => {});
    }
    if (typeof folderId === "string" && folderId) {
      await addImageToFolder(existing.id, folderId).catch(() => {});
    }
    if (typeof tagId === "string" && tagId) {
      await assignTag(existing.id, tagId).catch(() => {});
    }
    return { status: "duplicate", existingId: existing.id };
  }

  const id = randomUUID();
  try {
    await db.insert(schema.images).values({
      id,
      r2Key: uploaded.key,
      width: uploaded.width,
      height: uploaded.height,
      hash: uploaded.hash,
      phash: uploaded.phash,
      title: file.name.replace(/\.[^.]+$/, ""),
    });
  } catch (err) {
    console.error("db insert failed, rolling back R2:", err);
    await deleteAllForHash(uploaded.hash).catch(() => {});
    return { status: "error", message: "Database insert failed" };
  }

  if (typeof folderId === "string" && folderId) {
    await addImageToFolder(id, folderId).catch((err) => {
      console.warn("addImageToFolder after ingest failed:", err);
    });
  }
  if (typeof tagId === "string" && tagId) {
    await assignTag(id, tagId).catch((err) => {
      console.warn("assignTag after ingest failed:", err);
    });
  }

  revalidateAllViews();
  return { status: "ok", imageId: id };
}

/**
 * Pre-flight bulk SHA-256 lookup. Lets the client skip uploading bytes
 * we already have. Returns a `hash → existingId` map for whichever input
 * hashes are already in the DB; missing hashes are simply absent.
 *
 * If `folderId` and/or `tagId` are provided, the existing matched images
 * are also attached to that folder/tag in the same round-trip — this
 * preserves the behaviour of the per-file `ingestFile` duplicate path
 * (where folder/tag would otherwise be silently dropped when the client
 * skips the upload).
 *
 * Hashes that don't look like valid SHA-256 hex are filtered out before
 * the SQL query — defense against a tampered client passing junk strings.
 * The unique index on `images.hash` is used; query is O(N) on input list
 * length (one IN clause).
 */
export async function checkExistingHashes(
  hashes: string[],
  folderId?: string,
  tagId?: string,
): Promise<Record<string, string>> {
  const filtered = hashes.filter(
    (h) => typeof h === "string" && /^[0-9a-f]{64}$/i.test(h),
  );
  if (filtered.length === 0) return {};
  const rows = await db
    .select({ id: schema.images.id, hash: schema.images.hash })
    .from(schema.images)
    .where(inArray(schema.images.hash, filtered))
    .all();
  if (folderId || tagId) {
    await Promise.all(
      rows.map(async (r) => {
        if (folderId) await addImageToFolder(r.id, folderId).catch(() => {});
        if (tagId) await assignTag(r.id, tagId).catch(() => {});
      }),
    );
  }
  return Object.fromEntries(rows.map((r) => [r.hash, r.id]));
}
