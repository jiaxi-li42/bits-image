"use client";

import type { ReactNode } from "react";
import { useManage } from "@/modules/manage/manage-context";

/**
 * Shared classes for any "floating" icon button (the cluster on a page's
 * bottom-center, or the manage-action row above the bottom bar). Big enough
 * to be a comfortable tap target (48px) with a slightly larger icon.
 */
export const FLOATING_BUTTON_CLASS =
  "pointer-events-auto size-12 shadow-sm [&_svg:not([class*='size-'])]:size-5";

/**
 * Centered FAB cluster for the page-level Manage / Upload buttons. Visible
 * on mobile only; hidden when the manage panel is open (the panel itself
 * anchors to the same bottom strip).
 */
export function MobileFloatingActions({ children }: { children: ReactNode }) {
  const { isManaging } = useManage();
  if (isManaging) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {children}
    </div>
  );
}
