import { NextResponse } from "next/server";
import { getSignedImageUrl } from "@/modules/storage";

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

  const key =
    size === "original" ? `originals/${hash}` : `thumbs/${size}/${hash}.webp`;

  const url = await getSignedImageUrl(key, 60);

  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": "private, max-age=50",
    },
  });
}
