"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` once on mount. Returns null — no UI.
 *
 * Production-only on purpose: a registered service worker in dev makes
 * Turbopack HMR confusing (stale cached assets, mysterious "why isn't
 * my change showing" debugging). To test the SW locally, run a
 * `next build && next start` and visit on the production-mode server.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Swallow — a failed registration shouldn't break the app. The
      // browser logs the underlying error.
    });
  }, []);
  return null;
}
