"use server";

import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import {
  AUTH_COOKIE_NAME,
  authTokenForPasscode,
} from "./auth-token";

export type VerifyResult =
  | { status: "ok" }
  | { status: "error"; message: string };

const PASSCODE_RE = /^\d{6}$/;
// 1 year — the gate is a soft lock, not a real session.
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/**
 * Validate a 6-digit passcode and, on success, set the auth cookie. Uses
 * timing-safe equality so a precise per-byte timing attack can't probe
 * the passcode digit-by-digit.
 */
export async function verifyPasscode(code: string): Promise<VerifyResult> {
  if (!PASSCODE_RE.test(code)) {
    return { status: "error", message: "Enter a 6-digit code" };
  }
  const expected = process.env.APP_PASSCODE;
  if (!expected || !PASSCODE_RE.test(expected)) {
    return {
      status: "error",
      message: "Server is not configured (APP_PASSCODE missing)",
    };
  }
  const a = Buffer.from(code, "utf8");
  const b = Buffer.from(expected, "utf8");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return { status: "error", message: "Incorrect code" };
  }

  const store = await cookies();
  store.set(AUTH_COOKIE_NAME, authTokenForPasscode(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return { status: "ok" };
}
