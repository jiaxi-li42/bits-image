import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2, getBucket } from "./client";

export type ThumbSize = "grid" | "detail";

export async function getSignedImageUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return getSignedUrl(
    getR2(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function getOriginalUrl(
  hash: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return getSignedImageUrl(`originals/${hash}`, expiresInSeconds);
}
