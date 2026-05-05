import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getR2, getBucket } from "./client";
import { dhash, sha256 } from "./hash";

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
  // Compute the perceptual hash from the original bytes (sharp will
  // greyscale + downscale internally). Done in parallel with format
  // validation below isn't needed — sharp.metadata() and dhash both have
  // to decode anyway, but dhash runs in its own sharp pipeline so we
  // start it now and await before the DB lookup.
  const phashPromise = dhash(buffer);
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new Error(
      `Unsupported image format${meta.format ? `: ${meta.format}` : ""}. Allowed: JPEG, PNG, WebP, GIF, AVIF.`,
    );
  }

  const key = `originals/${hash}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: `image/${meta.format}`,
    }),
  );

  await Promise.all(
    Object.entries(THUMB_WIDTHS).map(async ([name, width]) => {
      const thumb = await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `thumbs/${name}/${hash}.webp`,
          Body: thumb,
          ContentType: "image/webp",
        }),
      );
    }),
  );

  return {
    key,
    width: meta.width,
    height: meta.height,
    hash,
    phash: await phashPromise,
    byteSize: buffer.length,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await getR2().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

export async function deleteAllForHash(hash: string): Promise<void> {
  await Promise.all([
    deleteObject(`originals/${hash}`),
    deleteObject(`thumbs/grid/${hash}.webp`),
    deleteObject(`thumbs/detail/${hash}.webp`),
  ]);
}
