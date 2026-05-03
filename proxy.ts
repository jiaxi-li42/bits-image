import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  expectedAuthToken,
  tokenMatches,
} from "@/modules/auth/auth-token";

// Soft-gate the entire app behind a 6-digit passcode. The matcher excludes
// static assets and the unlock route itself; everything else requires a
// matching auth cookie or gets redirected to /unlock.
export function proxy(request: NextRequest) {
  const expected = expectedAuthToken();
  // If APP_PASSCODE isn't configured at all, fail-open in development
  // (so localhost doesn't get stuck) and fail-closed in production
  // (better to lock everyone out than leak the gallery).
  if (!expected) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/unlock";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie && tokenMatches(cookie, expected)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/unlock";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on every path except: Next's internals, static files, the unlock
  // page (so it can render before authentication), and favicon.
  matcher: ["/((?!_next/|unlock$|unlock/|favicon\\.ico).*)"],
};
