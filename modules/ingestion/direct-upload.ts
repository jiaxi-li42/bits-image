import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { getBucket, getR2 } from "@/modules/storage/client";
import { deleteObject } from "@/modules/storage/upload";
import { sha256 } from "@/modules/storage/hash";
import { ingestImage } from "./ingest";
import { MAX_UPLOAD_BYTES } from "./limits";
import { checkExistingHashes, classifyImport } from "./server";

const UPLOAD_SECONDS = 15 * 60;
const inputSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  folderId: z.string().min(1).max(128).optional(),
  tagId: z.string().min(1).max(128).optional(),
}).strict();
const ticketSchema = inputSchema.extend({
  key: z.string().regex(/^uploads\/\d{13}\/[0-9a-f-]{36}$/),
  expires: z.number().int(), owner: z.string(),
});

function signature(payload: string) {
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  if (!secret) throw new Error("Upload signing is not configured");
  return createHmac("sha256", secret).update("bits-upload-v1:" + payload).digest("base64url");
}

export async function prepareUpload(input: unknown, owner: string) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid upload details; files must be between 1 byte and 50 MiB");
  const existing = await checkExistingHashes([parsed.data.hash], parsed.data.folderId, parsed.data.tagId);
  if (existing[parsed.data.hash]) return { status: "duplicate" as const, existingId: existing[parsed.data.hash] };
  const now = Date.now();
  const data = { ...parsed.data, key: `uploads/${now}/${randomUUID()}`, expires: now + UPLOAD_SECONDS * 1000, owner: sha256(Buffer.from(owner)) };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const checksum = Buffer.from(data.hash, "hex").toString("base64");
  const url = await getSignedUrl(getR2(), new PutObjectCommand({
    Bucket: getBucket(), Key: data.key, ContentLength: data.size,
    ContentType: "application/octet-stream", ChecksumSHA256: checksum, IfNoneMatch: "*",
  }), {
    expiresIn: UPLOAD_SECONDS,
    signableHeaders: new Set(["content-type", "content-length", "if-none-match"]),
    unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
  });
  return { ticket: `${payload}.${signature(payload)}`, url,
    headers: { "Content-Type": "application/octet-stream", "x-amz-checksum-sha256": checksum, "If-None-Match": "*" } };
}

function readTicket(ticket: unknown, owner: string) {
  if (typeof ticket !== "string" || ticket.length > 4096) throw new Error("Invalid upload ticket");
  const [payload, supplied, extra] = ticket.split(".");
  const expected = signature(payload);
  if (!supplied || extra !== undefined || supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error("Invalid upload ticket");
  const data = ticketSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (data.owner !== sha256(Buffer.from(owner))) throw new Error("This upload belongs to a different session");
  if (data.expires <= Date.now()) throw new Error("Upload expired. Please upload the file again.");
  return data;
}

export async function finalizeUpload(ticket: unknown, owner: string) {
  // Verify ownership and expiry BEFORE touching storage. Passcode rotation
  // invalidates the session as well as its outstanding upload tickets.
  const data = readTicket(ticket, owner);
  try {
    const object = await getR2().send(new GetObjectCommand({ Bucket: getBucket(), Key: data.key }));
    if (!object.Body) throw new Error("Upload is missing. Please upload the file again.");
    const reader = object.Body.transformToWebStream().getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (object.ContentLength !== data.size || object.ContentLength > MAX_UPLOAD_BYTES) throw new Error("Uploaded file size does not match");
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > data.size || size > MAX_UPLOAD_BYTES) throw new Error("Uploaded file exceeds the size limit");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const buffer = Buffer.concat(chunks, size);
    if (size !== data.size || sha256(buffer) !== data.hash) throw new Error("Uploaded file checksum does not match");
    // Reuse the CLI's decoding, deduplication and per-attempt rollback. Only
    // validated originals and thumbnails move into the permanent namespaces.
    return await classifyImport(await ingestImage(buffer, data.filename), data.folderId, data.tagId);
  } finally {
    await deleteObject(data.key).catch(() => console.error("Temporary upload cleanup needs retry", data.key));
  }
}

export async function purgeExpiredUploads(now = Date.now()) {
  // Timestamp-prefixed keys keep the oldest entries first. Daily cleanup also
  // catches abandoned uploads and late/replayed PUTs after finalization.
  const listed = await getR2().send(new ListObjectsV2Command({ Bucket: getBucket(), Prefix: "uploads/", MaxKeys: 1000 }));
  const expired = (listed.Contents ?? []).filter((object) => {
    const match = /^uploads\/(\d{13})\/[0-9a-f-]{36}$/.exec(object.Key ?? "");
    return match && Number(match[1]) < now - 24 * 60 * 60 * 1000;
  }).slice(0, 50);
  const results = await Promise.allSettled(expired.map((object) => deleteObject(object.Key!)));
  return { uploadsRemoved: results.filter((r) => r.status === "fulfilled").length,
    uploadsFailed: results.filter((r) => r.status === "rejected").length };
}
