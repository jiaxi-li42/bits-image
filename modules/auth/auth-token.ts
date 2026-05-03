import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "bits-auth";
const TOKEN_NAMESPACE = "bits-auth-v1";

/**
 * Compute the auth-cookie value for a given passcode. The cookie stores an
 * HMAC of the passcode rather than the passcode itself so a stolen
 * (httpOnly) cookie can't be reverse-engineered into the passcode, and
 * rotating `APP_PASSCODE` invalidates every existing session.
 */
export function authTokenForPasscode(passcode: string): string {
  return createHmac("sha256", passcode).update(TOKEN_NAMESPACE).digest("hex");
}

/** Read the expected token from the env-configured passcode. */
export function expectedAuthToken(): string | null {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return null;
  return authTokenForPasscode(passcode);
}

/**
 * Constant-time check so we don't leak per-byte timing.
 *
 * Compares as UTF-8 bytes rather than parsing hex: `Buffer.from(s, "hex")`
 * silently truncates at the first non-hex character, which means two
 * strings of equal `string.length` can produce buffers of unequal
 * `Buffer.length` and crash `timingSafeEqual` with a RangeError. The
 * tokens we compare are always ASCII, so UTF-8 byte length === string
 * length, and an attacker-supplied garbage cookie just falls through
 * the early-return.
 */
export function tokenMatches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
