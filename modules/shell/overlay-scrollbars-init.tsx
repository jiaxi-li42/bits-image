"use client";

import { useEffect } from "react";
import { OverlayScrollbars } from "overlayscrollbars";
import "overlayscrollbars/overlayscrollbars.css";
import { OS_OPTIONS } from "@/components/ui/overlay-scrollbars";

/**
 * Wires OverlayScrollbars to the document body, which is the app's
 * top-level scroll container (html is `h-full`, body is `min-h-full`).
 * OS treats body init specially: it uses `<html>` as the viewport and
 * `<body>` as the scroll content, so it inherits the body/html
 * overflow propagation HTML/CSS does naturally.
 *
 * Theme + auto-hide config is shared via `OS_OPTIONS` so the body
 * scrollbar and the per-component `OverlayScrollbarsComponent`
 * wrappers (upload queue, dropdown menu, etc.) all behave identically.
 *
 * Note: because `<html>` is now the scroll viewport, modals that want
 * to lock background scroll must set `documentElement.style.overflow`
 * — `body.style.overflow` no longer cascades (see
 * `modules/viewer/viewer.tsx`).
 */
export function OverlayScrollbarsInit() {
  useEffect(() => {
    const osInstance = OverlayScrollbars(document.body, OS_OPTIONS);
    return () => osInstance.destroy();
  }, []);
  return null;
}
