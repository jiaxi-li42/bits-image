"use client";

import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentProps,
  type OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import type { PartialOptions } from "overlayscrollbars";

/**
 * Shared OverlayScrollbars config. Used by the body init (imperative
 * `OverlayScrollbars(document.body, OS_OPTIONS)`) and by every
 * `<OverlayScrollArea>` wrapper below so every scroll surface gets the
 * same iOS-like theme and auto-hide timing.
 */
export const OS_OPTIONS: PartialOptions = {
  scrollbars: {
    theme: "os-theme-app",
    autoHide: "scroll",
    autoHideDelay: 800,
  },
};

export type OverlayScrollAreaRef = OverlayScrollbarsComponentRef;

/**
 * Thin wrapper that applies `OS_OPTIONS` so call sites don't have to
 * pass it (and aren't tempted to drift). Same prop API as
 * `OverlayScrollbarsComponent`; `options` can still be overridden by
 * the caller if needed.
 */
export function OverlayScrollArea({
  options,
  ...props
}: OverlayScrollbarsComponentProps<"div">) {
  return (
    <OverlayScrollbarsComponent options={options ?? OS_OPTIONS} {...props} />
  );
}
