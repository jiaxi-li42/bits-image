import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, expectedAuthToken, tokenMatches } from "@/modules/auth/auth-token";
import { finalizeUpload, prepareUpload } from "@/modules/ingestion/direct-upload";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const expected = expectedAuthToken();
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!expected || !cookie || !tokenMatches(cookie, expected)) {
    return Response.json({ error: "Please unlock the app again" }, { status: 401, headers });
  }
  // Next normalizes loopback hostnames in nextUrl; retain the actual HTTP Host.
  if (request.headers.get("origin") !== `${request.nextUrl.protocol}//${request.headers.get("host")}`) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers });
  }
  // These requests contain metadata only; never buffer a client file here.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing upload details" }, { status: 400, headers });
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) return Response.json({ error: "Upload metadata is too large" }, { status: 413, headers });
      chunks.push(part.value);
    }
    const input = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
    const result = input?.ticket !== undefined
      ? await finalizeUpload(input.ticket, cookie)
      : await prepareUpload(input, cookie);
    return Response.json(result, { headers });
  } catch (error) {
    console.error("Direct upload failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Upload could not be completed. Check the file and try again." }, { status: 400, headers });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
