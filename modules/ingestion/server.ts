"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { uploadImage, deleteAllForHash } from "@/modules/storage";

export type IngestResult =
  | { status: "ok"; imageId: string }
  | { status: "duplicate"; existingId: string }
  | { status: "error"; message: string };

async function revalidateAllViews() {
  revalidatePath("/library");
  revalidatePath("/inbox");
  revalidatePath("/organised");
  revalidatePath("/trash");
}

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

  const existing = await db
    .select({ id: schema.images.id })
    .from(schema.images)
    .where(eq(schema.images.hash, uploaded.hash))
    .get();

  if (existing) {
    // Note: R2 put was idempotent (same key from hash). Nothing to roll back.
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
      title: file.name.replace(/\.[^.]+$/, ""),
    });
  } catch (err) {
    console.error("db insert failed, rolling back R2:", err);
    await deleteAllForHash(uploaded.hash).catch(() => {});
    return { status: "error", message: "Database insert failed" };
  }

  await revalidateAllViews();
  return { status: "ok", imageId: id };
}
