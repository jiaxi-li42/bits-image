import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getR2, getBucket } from "./client";
import { dhash, sha256 } from "./hash";
import { imageObjectKey } from "./keys";

const THUMB_WIDTHS = { grid: 400, detail: 1200 } as const;

// Raster-only allow-list. SVG is *deliberately* excluded — `sharp` will
// happily decode an SVG, but storing it with `Content-Type: image/svg+xml`
// would let an attacker upload an SVG that contains `<script>` and have
// it execute in the app's origin when served inline from R2 (stored XSS).
const ALLOWED_FORMATS = new Set([
  "jpeg",
  "jpg",
  "png",
  "webp",
  "gif",
  "avif",
]);

export type UploadedImage = {
  key: string;
  width: number;
  height: number;
  hash: string;
  /** 16-char hex dHash for perceptual-duplicate detection (re-encodes,
   * resizes, format conversions). See `hash.ts` for the algorithm. */
  phash: string;
  byteSize: number;
};

export async function uploadImage(buffer: Buffer): Promise<UploadedImage> {
  const r2 = getR2();
  const bucket = getBucket();
  const hash = sha256(buffer);
  const image = sharp(buffer, { failOn: "error" });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new Error(
      `Unsupported image format${meta.format ? `: ${meta.format}` : ""}. Allowed: JPEG, PNG, WebP, GIF, AVIF.`,
    );
  }

  const phash = await dhash(buffer);
  // Each attempt owns its objects: a losing DB insert can safely roll back
  // without deleting another request's copy of the same image.
  const key = `originals/${hash}/${randomUUID()}`;
  const thumbs = await Promise.all(
    Object.entries(THUMB_WIDTHS).map(async ([name, width]) => {
      const thumb = await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return { Key: imageObjectKey(key, name as "grid" | "detail"), Body: thumb, ContentType: "image/webp" };
    }),
  );
  // Wait for ALL writes before cleanup, so a late PUT cannot recreate an orphan.
  const writes = await Promise.allSettled(
    [{ Key: key, Body: buffer, ContentType: `image/${meta.format}` }, ...thumbs]
      .map((object) => r2.send(new PutObjectCommand({ Bucket: bucket, ...object }))),
  );
  const failed = writes.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    await deleteImageObjects(key).catch((error) => console.error("Upload cleanup failed", key, error));
    throw failed.reason;
  }

  return {
    key,
    width: meta.width,
    height: meta.height,
    hash,
    phash,
    byteSize: buffer.length,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await getR2().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

export async function deleteImageObjects(key: string): Promise<void> {
  const results = await Promise.allSettled(
    (["original", "grid", "detail"] as const).map((size) => deleteObject(imageObjectKey(key, size))),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
