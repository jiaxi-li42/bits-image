import { NextResponse } from "next/server";
import { getSignedImageUrl } from "@/modules/storage";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { imageObjectKey } from "@/modules/storage/keys";

const ALLOWED_SIZES = new Set(["grid", "detail", "original"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string; hash: string }> },
) {
  const { size, hash } = await params;

  if (!ALLOWED_SIZES.has(size)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return new NextResponse("Invalid hash", { status: 400 });
  }

  const row = await db.select({ key: schema.images.r2Key }).from(schema.images)
    .where(eq(schema.images.hash, hash)).get();
  if (!row) return new NextResponse("Not found", { status: 404 });
  const key = imageObjectKey(row.key, size as "grid" | "detail" | "original");

  const url = await getSignedImageUrl(key, 60);

  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": "private, max-age=50",
    },
  });
}
