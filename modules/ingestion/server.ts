"use server";

import { inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { addImageToFolder } from "@/modules/folders";
import { assignTag } from "@/modules/tags";
import { revalidateAllViews } from "@/lib/revalidate";
import { ingestImage, MAX_UPLOAD_BYTES, type IngestResult } from "./ingest";

export type { IngestResult } from "./ingest";

export async function ingestFile(formData: FormData): Promise<IngestResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { status: "error", message: "No file provided" };
  if (file.size > MAX_UPLOAD_BYTES) return { status: "error", message: "File exceeds 50 MB limit" };
  const result = await ingestImage(Buffer.from(await file.arrayBuffer()), file.name);
  if (result.status === "error") return result;
  const id = result.status === "ok" ? result.imageId : result.existingId;
  const folderId = formData.get("folderId");
  const tagId = formData.get("tagId");
  try {
    if (typeof folderId === "string" && folderId) await addImageToFolder(id, folderId);
    if (typeof tagId === "string" && tagId) await assignTag(id, tagId);
  } catch (error) {
    console.error("Image classification failed", error);
    revalidateAllViews();
    return { status: "error", message: "Image saved, but classification failed. Please retry." };
  }
  revalidateAllViews();
  return result;
}

// Preflight exact matches also retain the upload destination associations.
export async function checkExistingHashes(
  hashes: string[],
  folderId?: string,
  tagId?: string,
): Promise<Record<string, string>> {
  const filtered = hashes.filter((h) => typeof h === "string" && /^[0-9a-f]{64}$/i.test(h));
  if (!filtered.length) return {};
  const rows = await db.select({ id: schema.images.id, hash: schema.images.hash })
    .from(schema.images).where(inArray(schema.images.hash, filtered)).all();
  for (const row of rows) {
    if (folderId) await addImageToFolder(row.id, folderId);
    if (tagId) await assignTag(row.id, tagId);
  }
  return Object.fromEntries(rows.map((r) => [r.hash, r.id]));
}
