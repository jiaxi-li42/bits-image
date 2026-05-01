"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { GridImage, ViewKind } from "@/modules/views";
import { DetailEditor } from "@/modules/details";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.4;
// Horizontal travel that commits a swipe-to-navigate, in CSS pixels.
const SWIPE_THRESHOLD = 50;
// Animation duration for the swipe commit / cancel slide.
const SWIPE_ANIM_MS = 180;

export type ViewerProps = {
  images: GridImage[];
  startIndex: number;
  onClose: (lastShownId: string) => void;
  view: ViewKind;
  onRemoved: (id: string) => void;
};

export function Viewer({
  images,
  startIndex,
  onClose,
  view,
  onRemoved,
}: ViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // Live horizontal offset during a swipe-to-navigate gesture (mobile).
  const [swipeDx, setSwipeDx] = useState(0);
  // Tracks whether a swipe-related transform should animate (CSS transition
  // on or off). Off during finger-drag (instant follow), on during the
  // commit/cancel snap.
  const [swipeAnimating, setSwipeAnimating] = useState(false);

  // Mirror the latest zoom/pan in refs so the wheel/touch handlers can read
  // fresh values across rapid events without depending on React's batching.
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const total = images.length;

  // Clamp index when the underlying array shrinks (e.g. an image is moved to
  // trash from the side panel). Without this, prev/next buttons can be left
  // pointing at a stale index whose `current` is undefined.
  useEffect(() => {
    if (total === 0) {
      onClose("");
      return;
    }
    if (index > total - 1) {
      setIndex(total - 1);
    }
  }, [total, index, onClose]);

  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = images[safeIndex];

  const closeWithCurrent = useCallback(() => {
    if (current) onClose(current.id);
    else onClose("");
  }, [current, onClose]);

  // Reset zoom + pan when image changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [safeIndex]);

  // Warm the browser's image cache for the neighbours on desktop so
  // arrow-nav shows their bytes instantly. Mobile already renders the
  // prev/next <img>s as off-screen swipe slots, so the bytes are
  // requested anyway — skip the redundant <link rel="preload"> there.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;
    const neighbours = [
      safeIndex > 0 ? images[safeIndex - 1] : null,
      safeIndex < total - 1 ? images[safeIndex + 1] : null,
    ];
    const links: HTMLLinkElement[] = [];
    for (const img of neighbours) {
      if (!img) continue;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = `/api/img/detail/${img.hash}`;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      for (const link of links) link.remove();
    };
  }, [safeIndex, total, images]);

  // Lock background scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Compute the max pan that still keeps the (scaled) image overlapping the
  // stage on both axes. Past this, you'd be staring at empty backdrop.
  const clampPan = useCallback(
    (raw: { x: number; y: number }, atZoom: number) => {
      const stage = stageRef.current;
      const img = stage?.querySelector("img");
      if (!stage || !img) return raw;
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      const iw = img.offsetWidth * atZoom;
      const ih = img.offsetHeight * atZoom;
      const maxX = Math.max(0, (iw - sw) / 2);
      const maxY = Math.max(0, (ih - sh) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, raw.x)),
        y: Math.max(-maxY, Math.min(maxY, raw.y)),
      };
    },
    [],
  );

  // Re-clamp pan when zoom changes so wheel/button zoom doesn't strand the
  // image off-screen, and snap to origin at 1×.
  useEffect(() => {
    if (zoom === 1) {
      setPan({ x: 0, y: 0 });
      return;
    }
    setPan((p) => clampPan(p, zoom));
  }, [zoom, clampPan]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < total - 1 ? i + 1 : i));
  }, [total]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, +(z * ZOOM_STEP).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, +(z / ZOOM_STEP).toFixed(2)));
  }, []);

  // Keyboard: Esc closes, arrows navigate, +/- zoom, 0 resets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeWithCurrent();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, closeWithCurrent, zoomIn, zoomOut]);

  // Lock body scroll while open.
  useEffect(() => {
    document.body.classList.add("viewer-open");
    return () => document.body.classList.remove("viewer-open");
  }, []);

  // Wheel adjusts zoom; up = in, down = out. Non-passive listener so we can
  // preventDefault — React's JSX onWheel is passive in React 17+.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY / 300);
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + rect.width / 2);
      const offsetY = e.clientY - (rect.top + rect.height / 2);
      const z0 = zoomRef.current;
      const p0 = panRef.current;
      const next = +(z0 * factor).toFixed(3);
      const z1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      if (z1 === z0) return;
      const ratio = z1 / z0;
      const newPan = clampPan(
        {
          x: offsetX + ratio * (p0.x - offsetX),
          y: offsetY + ratio * (p0.y - offsetY),
        },
        z1,
      );
      zoomRef.current = z1;
      panRef.current = newPan;
      setZoom(z1);
      setPan(newPan);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [clampPan]);

  // Multi-touch gestures (pinch / two-finger pan / single-finger pan when
  // zoomed). Only attached to the image stage — single-finger swipe-to-nav
  // is handled by a separate listener on the root so it works from the form
  // area too (see below).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    type Pinch = {
      type: "pinch";
      dist0: number;
      midX0: number;
      midY0: number;
      panX: number;
      panY: number;
      zoom0: number;
    };
    type SingleZoomed = {
      type: "single-zoomed";
      startX: number;
      startY: number;
      panX: number;
      panY: number;
    };
    let g: Pinch | SingleZoomed | null = null;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const mid = (a: Touch, b: Touch) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && zoomRef.current > 1) {
        const t = e.touches[0];
        g = {
          type: "single-zoomed",
          startX: t.clientX,
          startY: t.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        const m = mid(a, b);
        g = {
          type: "pinch",
          dist0: dist(a, b),
          midX0: m.x,
          midY0: m.y,
          panX: panRef.current.x,
          panY: panRef.current.y,
          zoom0: zoomRef.current,
        };
      } else {
        g = null;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!g) return;
      if (e.touches.length === 2 && g.type === "pinch") {
        e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const m = mid(a, b);
        const ratio = dist(a, b) / g.dist0;
        const z1 = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, +(g.zoom0 * ratio).toFixed(3)),
        );
        const r = z1 / g.zoom0;
        const rect = el.getBoundingClientRect();
        const offsetX = g.midX0 - (rect.left + rect.width / 2);
        const offsetY = g.midY0 - (rect.top + rect.height / 2);
        const moveX = m.x - g.midX0;
        const moveY = m.y - g.midY0;
        const newPan = clampPan(
          {
            x: offsetX + r * (g.panX - offsetX) + moveX,
            y: offsetY + r * (g.panY - offsetY) + moveY,
          },
          z1,
        );
        zoomRef.current = z1;
        panRef.current = newPan;
        setZoom(z1);
        setPan(newPan);
      } else if (e.touches.length === 1 && g.type === "single-zoomed") {
        e.preventDefault();
        const t = e.touches[0];
        const newPan = clampPan(
          {
            x: g.panX + (t.clientX - g.startX),
            y: g.panY + (t.clientY - g.startY),
          },
          zoomRef.current,
        );
        panRef.current = newPan;
        setPan(newPan);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        g = null;
      } else if (e.touches.length === 1 && g?.type === "pinch") {
        const t = e.touches[0];
        g = zoomRef.current > 1
          ? {
              type: "single-zoomed",
              startX: t.clientX,
              startY: t.clientY,
              panX: panRef.current.x,
              panY: panRef.current.y,
            }
          : null;
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [clampPan]);

  // Single-finger swipe-to-navigate. Attached to the root so swipes on the
  // form scroll area below the image trigger navigation too. Only active
  // when zoom === 1 (otherwise single-finger drag on the image pans).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let startX = 0;
    let startY = 0;
    let captured = false; // becomes true once we know the swipe is horizontal
    let abandoned = false; // becomes true if vertical scroll wins

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (zoomRef.current !== 1) return;
      // Skip if a pinch/zoomed-pan gesture is starting on the image stage.
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      captured = false;
      abandoned = false;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (zoomRef.current !== 1) return;
      if (abandoned) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!captured) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          captured = true;
        } else if (Math.abs(dy) > 10) {
          abandoned = true; // user is scrolling vertically; let the page scroll
          return;
        } else {
          return;
        }
      }
      // Horizontal swipe in progress — track for live drag visual.
      setSwipeAnimating(false);
      setSwipeDx(dx);
    };

    const onEnd = (e: TouchEvent) => {
      if (!captured || abandoned) {
        captured = false;
        abandoned = false;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const passed = Math.abs(dx) > SWIPE_THRESHOLD;
      const nextAvailable = dx < 0 && safeIndex < total - 1;
      const prevAvailable = dx > 0 && safeIndex > 0;
      const commit = horizontal && passed && (nextAvailable || prevAvailable);

      setSwipeAnimating(true);
      if (commit) {
        // Slide the image fully off-screen in the swipe direction, then
        // change the index. The new image renders at swipeDx=0 (we reset
        // after the index change) so it appears centered.
        const offscreen =
          (root.clientWidth || window.innerWidth) * (dx < 0 ? -1 : 1);
        setSwipeDx(offscreen);
        window.setTimeout(() => {
          if (dx < 0) goNext();
          else goPrev();
          setSwipeAnimating(false);
          setSwipeDx(0);
        }, SWIPE_ANIM_MS);
      } else {
        // Spring back to centre.
        setSwipeDx(0);
        window.setTimeout(
          () => setSwipeAnimating(false),
          SWIPE_ANIM_MS,
        );
      }
      captured = false;
      abandoned = false;
    };

    // Passive: false for touchmove so future preventDefault calls work if
    // needed. (We don't currently call it — `touch-action: pan-y` already
    // tells the browser to allow only vertical scroll, so horizontal moves
    // come to us with no need to fight the browser.)
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: true });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [goPrev, goNext, safeIndex, total]);

  // Pan: drag the image when zoomed > 1. Mouse only — touch is handled
  // above (browsers emit pointer events for touches too).
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startPanX: number;
    startPanY: number;
    pointerId: number;
  } | null>(null);

  const onImagePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    if (zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      pointerId: e.pointerId,
    };
    setIsDragging(true);
  };

  const onImagePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPan(
      clampPan(
        {
          x: drag.startPanX + (e.clientX - drag.startMouseX),
          y: drag.startPanY + (e.clientY - drag.startMouseY),
        },
        zoom,
      ),
    );
  };

  const onImagePointerEnd = (e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  const onImageDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleRemoved = () => {
    if (!current) return;
    const id = current.id;
    onRemoved(id);
    if (total <= 1) {
      onClose("");
    } else if (safeIndex >= total - 1) {
      setIndex(total - 2);
    }
  };

  if (!current) return null;

  const prevImage = safeIndex > 0 ? images[safeIndex - 1] : null;
  const nextImage = safeIndex < total - 1 ? images[safeIndex + 1] : null;

  const cursor =
    zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default";

  // Stop propagation on toolbar/arrow clicks so an outer listener cannot
  // accidentally intercept them.
  const stopAnd = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const imageTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  // Always animate border-radius (mobile: rounded-xl → 0 when entering
  // fullscreen). Transform stays instant during a drag, soft otherwise.
  const imageTransition = isDragging
    ? "border-radius 300ms ease-out"
    : "transform 120ms ease-out, border-radius 300ms ease-out";

  // Swipe transform applies to the whole image-stage + form wrapper so the
  // form slides along with the image.
  const swipeTransform = `translateX(${swipeDx}px)`;
  const swipeTransition = swipeAnimating
    ? `transform ${SWIPE_ANIM_MS}ms ease-out`
    : "none";

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Image Viewer"
      data-viewer="true"
    >
      {/* Backdrop layer. Mobile uses a solid white so the image's gutter
          (the padding around the rounded photo) reads cleanly; desktop keeps
          the dim+blur over the page behind. Pulled out of the scroll
          container so its backdrop-filter doesn't promote that container
          to a containing block for fixed/absolute descendants. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background md:bg-background/40 md:backdrop-blur-xl md:backdrop-saturate-150"
      />

      {/* Mobile fullscreen-zoom backdrop. Always mounted with opacity 0 so
          the fade-in transitions when zoom crosses 1. Same blur style as the
          desktop dim+blur. Sits below the image (z-54 vs image z-55) so the
          letterbox shows the blurred form behind. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[54] bg-background/40 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-300 ease-out md:hidden"
        style={{ opacity: zoom > 1 ? 1 : 0 }}
      />

      {/* Mobile-only close (X) — pinned to the viewport, sibling of the
          scroll container so it stays put as the user scrolls. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={stopAnd(closeWithCurrent)}
        aria-label="Close"
        className="absolute top-3 left-3 z-[60] size-9 rounded-md bg-foreground/70 text-background shadow-sm hover:bg-foreground/80 hover:text-background md:hidden"
      >
        <X className="size-4" />
      </Button>

      <div
        ref={rootRef}
        // overflow-x-hidden clips prev/next slots positioned ±100% outside
        // the page when no swipe is active, and clips the page itself when
        // the swipe transform pushes content past the viewport edge.
        className="absolute inset-0 overflow-y-auto overflow-x-hidden md:overflow-hidden"
        // Browser handles vertical scroll; we own horizontal for swipe-nav.
        style={{ touchAction: zoom > 1 ? "none" : "pan-y" }}
      >
      <div
        className="md:flex md:h-full md:flex-row max-md:relative"
        // Swipe-to-navigate translates the entire page (image + form) as a
        // unit. Transform is only applied during an active swipe so that an
        // identity transform doesn't create a containing block at rest
        // (which would trap the zoomed image's `position: fixed`).
        style={
          swipeDx !== 0 || swipeAnimating
            ? { transform: swipeTransform, transition: swipeTransition }
            : undefined
        }
      >

      {/* Prev column — mobile only. Image at top + Skeleton placeholder
          where the form will land. The real DetailEditor only mounts for
          `current.id`; once the swipe commits and `current` updates, the
          new editor's own loading skeleton takes over seamlessly. */}
      {prevImage ? (
        <div
          aria-hidden
          className="hidden max-md:flex max-md:flex-col max-md:absolute max-md:right-full max-md:top-0 max-md:w-full"
        >
          <div
            className="w-full p-1"
            style={{
              aspectRatio: `${prevImage.width} / ${prevImage.height}`,
            }}
          >
            <img
              src={`/api/img/detail/${prevImage.hash}`}
              alt=""
              className="block h-full w-full select-none rounded-xl object-contain"
            />
          </div>
          <DetailEditorSkeleton />
        </div>
      ) : null}

      <div
        ref={stageRef}
        className="relative flex w-full md:flex-1 md:min-w-0 items-start md:items-center justify-center md:overflow-hidden"
      >
        {/* Counter pill — desktop only */}
        {total > 1 ? (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1 text-xs text-background shadow md:block">
            {safeIndex + 1} / {total}
          </div>
        ) : null}

        {/* Toolbar (top-right): zoom in / zoom out — desktop only */}
        <div
          data-slot="button-group"
          data-orientation="vertical"
          className="absolute top-3 right-3 z-20 hidden flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm md:flex"
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-none border-0 hover:bg-muted disabled:opacity-30"
            onClick={stopAnd(zoomIn)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom In"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-none border-0 border-t border-border hover:bg-muted disabled:opacity-30"
            onClick={stopAnd(zoomOut)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom Out"
          >
            <Minus className="size-4" />
          </Button>
        </div>

        {/* Prev arrow — desktop only */}
        {total > 1 ? (
          <div className="absolute top-1/2 left-3 z-20 -translate-y-1/2 hidden md:block">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted hover:text-foreground disabled:opacity-30"
              onClick={stopAnd(goPrev)}
              disabled={safeIndex === 0}
              aria-label="Previous"
            >
              <ChevronLeft className="size-5" />
            </Button>
          </div>
        ) : null}

        {/* Image. Wrapper carries an inline `aspect-ratio` matching the
            current image on mobile so its height is held by CSS regardless
            of whether the image is in flow, escaped to fullscreen-zoom, or
            translated by an active swipe. The form below never reflows. */}
        <div
          className="pointer-events-none flex w-full p-1 md:h-full items-start md:items-center justify-center md:p-8 max-md:relative max-md:aspect-(--image-ar) max-md:p-0"
          style={
            { "--image-ar": `${current.width} / ${current.height}` } as React.CSSProperties
          }
        >
          {/* Layout container for the current image. Prev/next image+editor
              columns live as siblings of the swipe wrapper (above) so the
              form slides along with the image during a swipe. */}
          <div className="md:contents max-md:absolute max-md:inset-0">
            <img
              src={`/api/img/detail/${current.hash}`}
              alt={current.title ?? ""}
              draggable={false}
              onPointerDown={onImagePointerDown}
              onPointerMove={onImagePointerMove}
              onPointerUp={onImagePointerEnd}
              onPointerCancel={onImagePointerEnd}
              onPointerLeave={onImagePointerEnd}
              onDoubleClick={onImageDoubleClick}
              style={{
                transform: imageTransform,
                transformOrigin: "center center",
                transition: imageTransition,
                cursor,
                pointerEvents: "auto",
              }}
              className={`block select-none md:w-auto md:h-auto md:max-h-full md:max-w-full md:rounded-none md:object-contain${
                zoom > 1
                  ? " max-md:fixed max-md:inset-0 max-md:z-[55] max-md:w-full max-md:h-full max-md:object-contain max-md:rounded-none max-md:p-0"
                  : " w-full h-full object-contain rounded-xl max-md:p-1"
              }`}
            />

          </div>
        </div>

        {/* Next arrow — desktop only */}
        {total > 1 ? (
          <div className="absolute top-1/2 right-3 z-20 -translate-y-1/2 hidden md:block">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted hover:text-foreground disabled:opacity-30"
              onClick={stopAnd(goNext)}
              disabled={safeIndex >= total - 1}
              aria-label="Next"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
        ) : null}
      </div>

      {/* Editor panel — flows below the image on mobile (single page scroll);
          fixed-height side panel with internal scroll on desktop. */}
      <aside className="bg-background/95 backdrop-blur-md md:flex md:w-96 md:flex-none md:flex-col md:border-l md:border-border/50">
        <DetailEditor
          key={current.id}
          imageId={current.id}
          view={view}
          onRemoved={handleRemoved}
          onClose={closeWithCurrent}
        />
      </aside>

      {/* Next column — mobile only. Mirror of the prev column above. */}
      {nextImage ? (
        <div
          aria-hidden
          className="hidden max-md:flex max-md:flex-col max-md:absolute max-md:left-full max-md:top-0 max-md:w-full"
        >
          <div
            className="w-full p-1"
            style={{
              aspectRatio: `${nextImage.width} / ${nextImage.height}`,
            }}
          >
            <img
              src={`/api/img/detail/${nextImage.hash}`}
              alt=""
              className="block h-full w-full select-none rounded-xl object-contain"
            />
          </div>
          <DetailEditorSkeleton />
        </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}

// Mirrors the loading state inside DetailEditor itself. Shown in the
// off-screen prev/next columns during a swipe so the form area slides
// in alongside the image; once the swipe commits, the real editor
// remounts with its own loading skeleton and replaces this seamlessly.
function DetailEditorSkeleton() {
  return (
    <div className="space-y-8 px-4 pt-4 pb-4">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
