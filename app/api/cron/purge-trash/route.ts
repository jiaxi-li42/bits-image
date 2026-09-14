import { timingSafeEqual } from "node:crypto";
import { purgeTrash } from "@/modules/manage/trash";
import { revalidateAllViews } from "@/lib/revalidate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const headers = { "Cache-Control": "no-store" };
  if (!secret) return Response.json({ error: "Cleanup is not configured" }, { status: 503, headers });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    // ponytail: at most 50 images per invocation; schedule more often if a backlog builds up.
    const result = await purgeTrash({ expiredOnly: true, limit: 50 });
    revalidateAllViews();
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch (error) {
    console.error("Scheduled trash cleanup failed", error);
    return Response.json({ error: "Cleanup failed; retry later" }, { status: 503, headers });
  }
}
