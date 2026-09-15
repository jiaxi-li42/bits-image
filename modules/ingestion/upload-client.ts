import type { IngestResult } from "./ingest";
import { MAX_UPLOAD_BYTES } from "./limits";

export async function uploadDirect(file: File, folderId: string | undefined, tagId: string | undefined,
  onStage: (stage: "hashing" | "uploading" | "processing") => void): Promise<IngestResult> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be between 1 byte and 50 MiB");
  onStage("hashing");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const post = async (body: unknown) => {
    const response = await fetch("/api/uploads", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    if (response.redirected) throw new Error("Please unlock the app again");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed. Please retry.");
    return data;
  };
  const upload = await post({ filename: file.name, size: file.size, hash, folderId, tagId });
  if (upload.status === "duplicate") return upload;
  onStage("uploading");
  const put = await fetch(upload.url, { method: "PUT", credentials: "omit", headers: upload.headers,
    body: file, signal: AbortSignal.timeout(14 * 60 * 1000),
  });
  if (!put.ok) throw new Error("File transfer failed. Please retry.");
  onStage("processing");
  return post({ ticket: upload.ticket });
}
