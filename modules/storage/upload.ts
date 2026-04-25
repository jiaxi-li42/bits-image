import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getR2, getBucket } from "./client";
import { sha256 } from "./hash";

const THUMB_WIDTHS = { grid: 400, detail: 1200 } as const;

export type UploadedImage = {
  key: string;
  width: number;
  height: number;
  hash: string;
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

  const key = `originals/${hash}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: meta.format ? `image/${meta.format}` : "application/octet-stream",
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
