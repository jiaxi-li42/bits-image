"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Pixels the user has to pull past before release triggers a refresh.
const TRIGGER_PX = 70;
// Hard cap on the visible pull so a long flick doesn't shoot the spinner
// halfway down the screen.
const MAX_PULL_PX = 110;
// Resistance applied to finger movement. The indicator should feel like
// it's pulling against rubber, not tracking 1:1.
const FRICTION = 0.5;
// Threshold for the spinner to fade in. Below this we treat the pull as
// noise (incidental finger jitter at the top of the page).
const VISIBLE_MIN_PX = 4;

// Selector matching anything that owns its own touch behaviour: the image
// viewer (`role="dialog"` + `data-viewer`), shadcn dialogs / popovers /
// menus, etc. Pulls that start inside any of these should pass through to
// the owner instead of activating pull-to-refresh.
const DIALOG_SELECTOR =
  '[role="dialog"],[role="menu"],[data-slot="popover-content"],[data-slot="dialog-content"],[data-slot="alert-dialog-content"]';

/**
 * Pull-to-refresh, only active inside an installed iOS PWA.
 *
 * iOS Safari has a native pull-to-refresh, but it's tied to the browser
 * chrome — in standalone (home-screen-installed) PWA mode there is no
 * chrome, so the gesture is gone. This component reinstates it: when the
 * page is scrolled to the top, dragging down past `TRIGGER_PX` and
 * releasing calls `router.refresh()` (App Router server re-fetch).
 *
 * Scoped to iOS standalone because:
 *   - desktop / non-PWA Safari still has its own pull
 *   - Android Chrome PWA could use this too, but we haven't validated the
 *     UX there yet; broaden the gate when we have
 *
 * Touch listener notes:
 *   - `touchmove` is `{ passive: false }` so we can `preventDefault()` to
 *     suppress iOS rubber-banding while actively pulling. We only consume
 *     events when `tracking` is true to avoid pessimising scroll perf.
 *   - The gesture is cancelled the moment it starts inside a dialog /
 *     menu / popover, so the viewer's pinch/pan/swipe handlers aren't
 *     stolen from.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Gesture state lives in refs because the listeners are bound once and
  // we don't want every move to schedule a React re-render of the
  // tracking flag. Only `pull` (the visible distance) is React state.
  const tracking = useRef(false);
  const startY = useRef(0);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isIos && isStandalone) setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      const target = e.target as Element | null;
      // Pulls that begin inside a dialog / menu / viewer belong to that
      // surface — never hijack them for refresh.
      if (target?.closest(DIALOG_SELECTOR)) return;
      // Only arm when the page itself is already at the top; otherwise
      // the user's intent is to scroll, not to refresh.
      if (window.scrollY > 0) return;
      tracking.current = true;
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        // Reversed direction — collapse and stop tracking until the next
        // touch sequence so we don't fight an upward scroll.
        if (pullRef.current !== 0) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      // Killing the default suppresses iOS' rubber-band so our indicator
      // is the only thing visually responding to the gesture.
      if (e.cancelable) e.preventDefault();
      const eased = Math.min(MAX_PULL_PX, delta * FRICTION);
      pullRef.current = eased;
      setPull(eased);
    };

    const finish = () => {
      if (!tracking.current) return;
      tracking.current = false;
      if (pullRef.current >= TRIGGER_PX) {
        refreshingRef.current = true;
        setRefreshing(true);
        // Hold the indicator at the trigger height while the refresh is
        // in flight so the user sees a stable spinner rather than the
        // bar snapping back the instant they release.
        pullRef.current = TRIGGER_PX;
        setPull(TRIGGER_PX);
        router.refresh();
        // `router.refresh()` is fire-and-forget with no completion hook,
        // so we pin the spinner for a fixed beat. Long enough to feel
        // intentional, short enough that the data is realistically back.
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          pullRef.current = 0;
          setPull(0);
        }, 700);
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", finish, { passive: true });
    document.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", finish);
    };
  }, [enabled, router]);

  if (!enabled) return null;

  const visible = pull > VISIBLE_MIN_PX || refreshing;
  const progress = Math.min(1, pull / TRIGGER_PX);

  return (
    <div
      aria-hidden="true"
      // Anchor at the very top; transform pushes the indicator into view
      // proportional to the pull. `safe-area-inset-top` keeps it clear of
      // the iOS status bar / notch in standalone mode.
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translateY(calc(env(safe-area-inset-top) + ${Math.max(0, pull - 28)}px))`,
        opacity: visible ? 1 : 0,
        transition: tracking.current
          ? "none"
          : "transform 220ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms",
      }}
    >
      <div className="mt-1 rounded-full border bg-background p-2 shadow-sm">
        <RefreshCw
          className={cn(
            "size-4 text-muted-foreground",
            refreshing && "animate-spin",
          )}
          style={
            refreshing
              ? undefined
              : {
                  transform: `rotate(${progress * 270}deg)`,
                  transition: tracking.current ? "none" : "transform 220ms",
                }
          }
        />
      </div>
    </div>
  );
}
