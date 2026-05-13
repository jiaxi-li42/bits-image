import { eq } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "@/db/client";
import { getR2, getBucket } from "@/modules/storage/client";

/**
 * Same-origin streaming download for the original image. We stream from R2
 * through this route (instead of redirecting to a signed R2 URL) so the
 * response can carry `Content-Disposition: attachment` from our own origin
 * — that's the bit that makes the browser treat the click as a download
 * rather than a navigation.
 *
 * The previous implementation opened the signed R2 URL in a new tab via
 * `target="_blank"`, which is what made it fail inside an installed iOS
 * PWA: standalone WebKit can't open new tabs, so the click went nowhere.
 * A same-origin attachment response works in both the browser and the PWA.
 */

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await db
    .select({ hash: schema.images.hash, title: schema.images.title })
    .from(schema.images)
    .where(eq(schema.images.id, id))
    .get();
  if (!row) return new Response("Not found", { status: 404 });

  let obj;
  try {
    obj = await getR2().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: `originals/${row.hash}`,
      }),
    );
  } catch (err) {
    console.error("R2 GetObject failed:", err);
    return new Response("Not found", { status: 404 });
  }
  if (!obj.Body) return new Response("Not found", { status: 404 });

  const contentType = obj.ContentType ?? "application/octet-stream";
  const ext = EXT_BY_TYPE[contentType] ?? "bin";
  // Strip filesystem-unfriendly characters from the title so the resulting
  // filename is safe on every common OS. Falls back to "image" when the
  // user hasn't given the image a title.
  const safeTitle = (row.title?.trim() || "image").replace(
    /[\/\\:*?"<>|\r\n]/g,
    "_",
  );
  const filename = `${safeTitle}.${ext}`;
  // RFC 5987 `filename*` carries the UTF-8 name; the ASCII `filename` is
  // the legacy fallback — together they cover non-Latin titles too.
  const encoded = encodeURIComponent(filename);

  return new Response(obj.Body.transformToWebStream(), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
      ...(obj.ContentLength
        ? { "Content-Length": obj.ContentLength.toString() }
        : {}),
      "Cache-Control": "private, no-store",
    },
  });
}
