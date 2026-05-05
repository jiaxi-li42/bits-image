"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { GridImage, ViewKind } from "@/modules/views";
import { DetailEditor } from "@/modules/details";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.4;
// Multiplier on finger / mouse delta when panning a zoomed-in image. >1
// means a smaller gesture covers more of the (scaled) image — feels
// snappier on small screens where reach is limited.
const PAN_SENSITIVITY = 1.5;
// Maximum movement (CSS px) for a touchend to still be classified as a tap.
const TAP_MAX_PX = 10;

// In-progress touch gesture state. Stored in a ref so values survive when
// the listener-binding effect re-runs (e.g. when the mobile overlay mounts
// mid-pinch as zoom crosses 1).
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

const touchDist = (a: Touch, b: Touch) =>
  Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
const touchMid = (a: Touch, b: Touch) => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});

export type ViewerProps = {
  images: GridImage[];
  startIndex: number;
  onClose: (lastShownId: string) => void;
  view: ViewKind;
  onRemoved: (id: string) => void;
};

/**
 * Image viewer built on Embla (shadcn Carousel) for horizontal swipe
 * navigation. Pinch / pan / wheel zoom and tap-fullscreen are layered on top
 * of the active slide; when zoom > 1 (or fullscreen on mobile), the active
 * image is rendered into a sibling overlay so its `transform: scale()` and
 * `position: fixed` aren't trapped by Embla's translate3d on the slide track.
 */
export function Viewer({
  images,
  startIndex,
  onClose,
  view,
  onRemoved,
}: ViewerProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // Mobile-only "fill the viewport" view, decoupled from zoom so a tap
  // can enter fullscreen at the natural fit (no upscaling). Pinch /
  // double-tap still operate on `zoom`; both states are cleared together
  // when the user taps out.
  const [fullscreen, setFullscreen] = useState(false);

  // Mirror live values in refs so wheel/touch handlers can read fresh
  // values across rapid events without depending on React batching.
  // Synchronous gesture-handler updates also write through these refs,
  // so reads inside handlers see the latest values without waiting for
  // a re-render to commit.
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const fullscreenRef = useRef(fullscreen);
  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
    fullscreenRef.current = fullscreen;
  }, [zoom, pan, fullscreen]);

  const total = images.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = images[safeIndex];

  // Clamp index when the underlying array shrinks (image moved to trash, etc).
  useEffect(() => {
    if (total === 0) {
      onClose("");
      return;
    }
    if (index > total - 1) {
      setIndex(total - 1);
    }
  }, [total, index, onClose]);

  const closeWithCurrent = useCallback(() => {
    if (current) onClose(current.id);
    else onClose("");
  }, [current, onClose]);

  // Reset zoom/pan/fullscreen whenever the active image changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFullscreen(false);
  }, [safeIndex]);

  // The mobile slide is `overflow-y-auto` so the editor below the image
  // can be reached on tall images. When the user enters fullscreen the
  // editor is hidden and the image grows to h-full, but iOS preserves
  // the slide's scrollTop — leaving the image visually offset (appears
  // pushed toward the bottom). Reset scroll to 0 on fullscreen entry.
  useEffect(() => {
    if (!fullscreen) return;
    const stage = inflowStageRef.current;
    const slide = stage?.closest('[data-slot="carousel-item"]');
    if (slide instanceof HTMLElement) slide.scrollTop = 0;
  }, [fullscreen]);

  // Wire Embla -> React index sync, and jump to the requested startIndex
  // without animation when the carousel first mounts.
  useEffect(() => {
    if (!api) return;
    api.scrollTo(startIndex, true);
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
    // startIndex is captured at mount; subsequent changes shouldn't re-jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Re-init Embla when images change so it picks up new snap points.
  useEffect(() => {
    api?.reInit();
  }, [api, total]);

  // Lock body scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // The in-flow stage is the active slide's image area inside the carousel
  // (always present for the active slide). The overlay is the mobile-only
  // sibling that mounts when zoom > 1 to escape Embla's transformed track.
  // Both can host gesture listeners; clampPan picks whichever is currently
  // the visible stage so its dimensions bound the pan correctly.
  const inflowStageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // FLIP animation for fullscreen enter/exit (mobile). Caller measures the
  // in-flow img's rect BEFORE flipping fullscreen state; the layout-effect
  // below measures the new rect after React commits the new layout, then
  // animates the inverse transform back to identity over FULLSCREEN_MS.
  // Runs only when `flipFromRectRef` is populated, so other indirect
  // setFullscreen(false) call sites (e.g. slide change) snap instantly.
  const FULLSCREEN_MS = 200;
  // Spring-out curve — fast initial settle, gentle finish. Same shape used
  // by Vercel/Linear for sheet/dialog transitions.
  const FULLSCREEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  const flipFromRectRef = useRef<DOMRect | null>(null);
  const captureFlip = useCallback(() => {
    const img = inflowStageRef.current?.querySelector("img");
    if (img instanceof HTMLImageElement) {
      flipFromRectRef.current = img.getBoundingClientRect();
    }
  }, []);
  useLayoutEffect(() => {
    const fromRect = flipFromRectRef.current;
    if (!fromRect) return;
    flipFromRectRef.current = null;
    const img = inflowStageRef.current?.querySelector("img");
    if (!(img instanceof HTMLImageElement)) return;
    const toRect = img.getBoundingClientRect();
    if (toRect.width === 0 || toRect.height === 0) return;
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;
    const sx = fromRect.width / toRect.width;
    const sy = fromRect.height / toRect.height;
    if (
      Math.abs(dx) < 0.5 &&
      Math.abs(dy) < 0.5 &&
      Math.abs(sx - 1) < 0.001 &&
      Math.abs(sy - 1) < 0.001
    ) {
      return;
    }
    img.animate(
      [
        {
          transformOrigin: "0 0",
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration: FULLSCREEN_MS, easing: FULLSCREEN_EASE },
    );
  }, [fullscreen]);

  const clampPan = useCallback(
    (raw: { x: number; y: number }, atZoom: number) => {
      // Pick the visible stage. The overlay is always mounted when zoom > 1
      // but is `md:hidden` (display:none, clientWidth = 0) on desktop —
      // selecting it then would clamp pan to {0,0}. Fall back to the
      // in-flow stage whenever the overlay is hidden / has zero size.
      const overlayEl = overlayRef.current;
      const stage =
        overlayEl && overlayEl.clientWidth > 0
          ? overlayEl
          : inflowStageRef.current;
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
    api?.scrollPrev();
  }, [api]);

  const goNext = useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, +(z * ZOOM_STEP).toFixed(2)));
  }, []);

  // Exit mobile fullscreen — mirrors the double-tap reset so the minimize
  // button and double-tap both clear zoom/pan/fullscreen together. Captures
  // the FLIP source rect before the state change so the layout effect can
  // animate the image back to its AR-slot.
  const exitFullscreen = useCallback(() => {
    captureFlip();
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    fullscreenRef.current = false;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFullscreen(false);
  }, [captureFlip]);

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

  // Wheel adjusts zoom; up = in, down = out. Non-passive listener so we can
  // preventDefault — React's JSX onWheel is passive in React 17+. Wheel is
  // a desktop concern, so we always target the in-flow stage (no overlay
  // on desktop).
  useEffect(() => {
    const el = inflowStageRef.current;
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
  }, [clampPan, safeIndex]);

  // Multi-touch gestures (pinch / two-finger pan / single-finger pan when
  // zoomed) + tap-to-fullscreen. Single-finger horizontal swipe at zoom=1
  // is left to Embla. Attached to both the in-flow stage and (when
  // mounted) the mobile overlay — touches outside the in-flow stage's
  // bounding box (e.g. while panning a 4× zoomed image) are caught by
  // the overlay listener.
  //
  // Gesture state lives in refs so the values survive listener re-binds.
  // When the overlay mounts mid-pinch (zoom crosses 1), this effect
  // re-runs; the closures it builds need to read the same gesture state
  // so the in-progress pinch keeps its starting baseline.
  const gestureRef = useRef<Pinch | SingleZoomed | null>(null);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const els: HTMLElement[] = [];
    if (inflowStageRef.current) els.push(inflowStageRef.current);
    if (overlayRef.current) els.push(overlayRef.current);
    if (els.length === 0) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && zoomRef.current > 1) {
        const t = e.touches[0];
        gestureRef.current = {
          type: "single-zoomed",
          startX: t.clientX,
          startY: t.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else if (e.touches.length === 1 && zoomRef.current === 1) {
        const t = e.touches[0];
        tapStartRef.current = { x: t.clientX, y: t.clientY };
      } else if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        const m = touchMid(a, b);
        gestureRef.current = {
          type: "pinch",
          dist0: touchDist(a, b),
          midX0: m.x,
          midY0: m.y,
          panX: panRef.current.x,
          panY: panRef.current.y,
          zoom0: zoomRef.current,
        };
        // A 2-finger gesture is never a tap. Clear the pending tap so
        // that pinch-zoom-out → release at zoom=1 doesn't accidentally
        // resolve as a tap-to-fullscreen.
        tapStartRef.current = null;
      } else {
        gestureRef.current = null;
      }
    };

    const onMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      // The element used as the centre-of-stage anchor for pinch math
      // is the currently *visible* stage. Overlay is mounted whenever
      // zoom > 1 but display:none on desktop — fall back to in-flow.
      const overlayEl = overlayRef.current;
      const visibleEl =
        overlayEl && overlayEl.clientWidth > 0
          ? overlayEl
          : (inflowStageRef.current as HTMLElement);
      if (e.touches.length === 2 && g.type === "pinch") {
        e.preventDefault();
        e.stopPropagation();
        const a = e.touches[0];
        const b = e.touches[1];
        const m = touchMid(a, b);
        const ratio = touchDist(a, b) / g.dist0;
        const z1 = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, +(g.zoom0 * ratio).toFixed(3)),
        );
        const r = z1 / g.zoom0;
        const rect = visibleEl.getBoundingClientRect();
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
        e.stopPropagation();
        const t = e.touches[0];
        const newPan = clampPan(
          {
            x: g.panX + (t.clientX - g.startX) * PAN_SENSITIVITY,
            y: g.panY + (t.clientY - g.startY) * PAN_SENSITIVITY,
          },
          zoomRef.current,
        );
        panRef.current = newPan;
        setPan(newPan);
      }
    };

    const onEnd = (e: TouchEvent) => {
      // Resolve a pending tap. A near-stationary touchend at zoom===1
      // only ENTERS fullscreen; exiting is reserved for double-tap so a
      // stray tap on the image while reading the form below doesn't drop
      // the user out of fullscreen.
      const tapStart = tapStartRef.current;
      const t = e.changedTouches[0];
      if (
        tapStart &&
        t &&
        zoomRef.current === 1 &&
        !fullscreenRef.current &&
        Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) <= TAP_MAX_PX
      ) {
        captureFlip();
        setFullscreen(true);
      }
      tapStartRef.current = null;
      if (e.touches.length === 0) {
        gestureRef.current = null;
      } else if (
        e.touches.length === 1 &&
        gestureRef.current?.type === "pinch"
      ) {
        const t = e.touches[0];
        gestureRef.current =
          zoomRef.current > 1
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

    for (const el of els) {
      el.addEventListener("touchstart", onStart, { passive: false });
      el.addEventListener("touchmove", onMove, { passive: false });
      el.addEventListener("touchend", onEnd);
      el.addEventListener("touchcancel", onEnd);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchmove", onMove);
        el.removeEventListener("touchend", onEnd);
        el.removeEventListener("touchcancel", onEnd);
      }
    };
    // Re-attach when the overlay mounts/unmounts (zoom > 1 toggle) so
    // the new element gets its listeners.
  }, [clampPan, safeIndex, zoom > 1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse drag (pan when zoomed > 1) and double-click (reset zoom +
  // exit fullscreen) are bound as native listeners on the in-flow
  // stage div *and* (when mounted) the mobile overlay. Going through
  // React's synthetic system on the <img> was unreliable: the image's
  // visual box overflows its `md:overflow-hidden` parent when zoomed,
  // and the clipped overflow isn't a reliable hit target. The stage /
  // overlay containers have well-defined bounds and no clipping, so a
  // pointerdown / dblclick anywhere over the visible image lands here
  // first. Document-level pointermove/up listeners take over for the
  // duration of a drag.
  useEffect(() => {
    const els: HTMLElement[] = [];
    if (inflowStageRef.current) els.push(inflowStageRef.current);
    if (overlayRef.current) els.push(overlayRef.current);
    if (els.length === 0) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      if (zoomRef.current <= 1) return;
      e.stopPropagation();
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startPan = panRef.current;
      const onMove = (ev: PointerEvent) => {
        const newPan = clampPan(
          {
            x: startPan.x + (ev.clientX - startMouseX) * PAN_SENSITIVITY,
            y: startPan.y + (ev.clientY - startMouseY) * PAN_SENSITIVITY,
          },
          zoomRef.current,
        );
        panRef.current = newPan;
        setPan(newPan);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        setIsDragging(false);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      setIsDragging(true);
    };

    const onDbl = (e: MouseEvent) => {
      if (zoomRef.current <= 1 && !fullscreenRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      // Capture FLIP source rect only when fullscreen is actually exiting,
      // so a pure zoom-reset (zoom>1, no fullscreen) doesn't trigger a
      // FLIP animation that the layout effect would discard anyway.
      if (fullscreenRef.current) captureFlip();
      zoomRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      fullscreenRef.current = false;
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setFullscreen(false);
    };

    for (const el of els) {
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("dblclick", onDbl);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("dblclick", onDbl);
      }
    };
    // Re-attach when the overlay mounts/unmounts (zoom > 1 toggle).
  }, [clampPan, safeIndex, zoom > 1]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoved = useCallback(() => {
    if (!current) return;
    onRemoved(current.id);
    if (total <= 1) {
      onClose("");
    } else if (safeIndex >= total - 1) {
      setIndex(total - 2);
    }
  }, [current, onRemoved, onClose, total, safeIndex]);

  // The active image is rendered via a sibling overlay when zoom > 1, to
  // escape Embla's translate3d-induced containing block (transform on a
  // ancestor traps `position: fixed`). Fullscreen at zoom=1 is handled as
  // a layout change inside the slide (image fills slide, editor hidden) so
  // Embla's native horizontal swipe still navigates between images.
  const imageEscaped = zoom > 1;

  // Stable opts reference so Embla doesn't reInit unnecessarily — only
  // re-create when `imageEscaped` or `fullscreen` toggles. New zoom values
  // inside `imageEscaped=true` don't churn this object.
  const carouselOpts = useMemo(
    () => ({
      align: "start" as const,
      containScroll: "trimSnaps" as const,
      // Embla auto-detects axis; vertical scroll inside slides passes
      // through to the native scroll container. Disable drag in
      // fullscreen too — the user has signalled they want to focus on
      // the active image, so an accidental swipe shouldn't switch it.
      watchDrag: !imageEscaped && !fullscreen,
      duration: 20,
    }),
    [imageEscaped, fullscreen],
  );

  if (!current) return null;

  const cursor = zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default";

  // Stop propagation on toolbar/arrow clicks so the image's listeners can't
  // accidentally intercept them.
  const stopAnd = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const imageTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  // `transform` applies on the same frame as state updates — pinch / pan
  // / wheel-zoom track input 1:1. Only `border-radius` is transitioned,
  // synced to the FLIP animation duration / easing for fullscreen toggles.
  const imageTransition = `border-radius ${FULLSCREEN_MS}ms ${FULLSCREEN_EASE}`;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Image Viewer"
      data-viewer="true"
    >
      {/* Backdrop. Mobile = solid white so the image gutter reads cleanly;
          desktop = dim+blur over the page behind. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background md:bg-background/40 md:backdrop-blur-xl md:backdrop-saturate-150"
      />

      {/* Mobile fullscreen-zoom backdrop. Always mounted with opacity 0 so
          the fade-in transitions when zoom crosses 1 or fullscreen toggles.
          Duration / easing synced to the FLIP animation. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[54] bg-background/40 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden"
        style={{ opacity: zoom > 1 || fullscreen ? 1 : 0 }}
      />

      {/* Mobile-only top-left button — pinned to the viewport. In normal
          mode it's a Close (X) for the viewer; in fullscreen it becomes
          a Minimize (exits fullscreen instead of closing the viewer). */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={stopAnd(fullscreen ? exitFullscreen : closeWithCurrent)}
        aria-label={fullscreen ? "Exit fullscreen" : "Close"}
        className="absolute top-3 left-3 z-[60] size-9 rounded-md bg-foreground/70 text-background shadow-sm hover:bg-foreground/80 hover:text-background md:hidden"
      >
        {fullscreen ? (
          <Minimize2 className="size-4" />
        ) : (
          <X className="size-4" />
        )}
      </Button>

      {/* Carousel container is `z-[55]` so the in-flow image sits above
          the mobile fullscreen-zoom backdrop (z-[54]). On desktop both
          backdrop and z-index are inert (md:hidden / md:flex). */}
      <div className="absolute inset-0 z-[55] md:flex">
        <Carousel
          className="h-full md:flex-1 md:min-w-0"
          opts={carouselOpts}
          setApi={setApi}
        >
          <CarouselContent>
            {images.map((img, i) => {
              const isActive = i === safeIndex;
              return (
                <CarouselItem
                  key={img.id}
                  // Hide the visual scrollbar — the slide is intentionally
                  // scrollable on mobile when image+editor exceeds the
                  // viewport, but the persistent gutter looks like it
                  // belongs to the image. Scroll behaviour itself stays.
                  className="h-full overflow-y-auto md:overflow-hidden [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
                >
                  <Slide
                    img={img}
                    isActive={isActive}
                    fullscreen={isActive && fullscreen}
                    view={view}
                    onRemoved={handleRemoved}
                    onClose={closeWithCurrent}
                    // Active image transforms with zoom/pan in place. The
                    // overlay below only takes over on mobile when zoom>1
                    // so it can break out of Embla's transformed track.
                    hideOnMobileWhenEscaped={isActive && imageEscaped}
                    stageRef={isActive ? inflowStageRef : undefined}
                    cursor={isActive ? cursor : "default"}
                    transform={isActive ? imageTransform : undefined}
                    transition={isActive ? imageTransition : undefined}
                  />
                </CarouselItem>
              );
            })}
          </CarouselContent>

          {/* Desktop overlays — anchored to the carousel area (not the
              full viewport) so they don't drift over the editor aside. */}

          {/* Counter pill */}
          {total > 1 ? (
            <div className="pointer-events-none absolute top-3 left-1/2 z-30 hidden -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1 text-xs text-background shadow md:block">
              {safeIndex + 1} / {total}
            </div>
          ) : null}

          {/* Zoom toolbar (top-right) */}
          <div
            data-slot="button-group"
            data-orientation="vertical"
            className="absolute top-3 right-3 z-30 hidden flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm md:flex"
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

          {/* Prev / Next arrows */}
          {total > 1 ? (
            <>
              <div className="absolute top-1/2 left-3 z-30 hidden -translate-y-1/2 md:block">
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
              <div className="absolute top-1/2 right-3 z-30 hidden -translate-y-1/2 md:block">
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
            </>
          ) : null}
        </Carousel>

        {/* Desktop side editor. Stays outside the carousel so it doesn't
            re-mount on swipe; keyed by current.id so it remounts on slide
            change with the right form state. */}
        <aside className="hidden bg-background/95 backdrop-blur-md md:flex md:w-96 md:flex-none md:flex-col md:border-l md:border-border/50">
          <DetailEditor
            key={current.id}
            imageId={current.id}
            view={view}
            onRemoved={handleRemoved}
            onClose={closeWithCurrent}
          />
        </aside>
      </div>

      {/* Escape hatch for the active image when zoom > 1 on mobile.
          Sibling of the carousel so its own transform isn't trapped by
          Embla's translate3d on the slide track. Hidden on desktop —
          desktop applies the transform to the in-flow image directly.
          The img is sized via `width`/`height` + `max-w-full max-h-full`
          (NOT `w-full h-full object-contain`) so that its `offsetWidth/
          Height` matches the rendered image content rather than the
          viewport-sized box. clampPan then computes pan limits against
          the actual visible image, so swiping while zoomed can't move
          the image past its edges into letterbox space. */}
      {imageEscaped ? (
        <div
          ref={overlayRef}
          className="pointer-events-auto absolute inset-0 z-[55] flex items-center justify-center md:hidden"
        >
          <img
            src={`/api/img/detail/${current.hash}`}
            alt={current.title ?? ""}
            width={current.width}
            height={current.height}
            draggable={false}
            decoding="async"
            style={{
              transform: imageTransform,
              transformOrigin: "center center",
              transition: imageTransition,
              cursor,
            }}
            className="block max-h-full max-w-full select-none"
          />
        </div>
      ) : null}
    </div>
  );
}

type SlideProps = {
  img: GridImage;
  isActive: boolean;
  /** Mobile-only: image fills the slide and the editor area is hidden. */
  fullscreen: boolean;
  view: ViewKind;
  onRemoved: () => void;
  onClose: () => void;
  /** Hide the in-flow image on mobile only (the overlay copy is showing). */
  hideOnMobileWhenEscaped: boolean;
  stageRef?: React.Ref<HTMLDivElement>;
  cursor: string;
  transform?: string;
  transition?: string;
};

const Slide = memo(function Slide({
  img,
  isActive,
  fullscreen,
  view,
  onRemoved,
  onClose,
  hideOnMobileWhenEscaped,
  stageRef,
  cursor,
  transform,
  transition,
}: SlideProps) {
  return (
    // In fullscreen mode the slide wrapper, stage div, and inner image
    // wrapper all need explicit h-full on mobile so the % chain resolves
    // (otherwise `h-full` on the image wrapper inherits `0` and the
    // image collapses to zero height).
    <div
      className={`md:flex md:h-full md:flex-row${
        fullscreen ? " max-md:h-full" : ""
      }`}
    >
      {/* Image stage. On mobile it sits at top of the vertically-scrolling
          slide column; on desktop it fills the slide. In mobile fullscreen
          mode, the stage expands to the full slide height (no aspect-ratio
          slot) and the editor below is hidden. */}
      <div
        ref={stageRef}
        className={`relative flex w-full md:flex-1 md:min-w-0 items-start md:items-center justify-center md:overflow-hidden${
          fullscreen ? " max-md:h-full" : ""
        }`}
      >
        <div
          // `aspect-(--image-ar)` on mobile keeps the slot height stable
          // regardless of the image's load state or transform. In fullscreen
          // we drop the aspect-ratio so the image fills the full slide.
          className={`pointer-events-none flex w-full md:h-full justify-center md:p-8 max-md:relative${
            fullscreen
              ? " max-md:h-full max-md:p-0 items-center"
              : " p-1 max-md:aspect-(--image-ar) max-md:m-1 max-md:p-0 items-start md:items-center"
          }`}
          style={
            { "--image-ar": `${img.width} / ${img.height}` } as React.CSSProperties
          }
        >
          <img
            src={`/api/img/detail/${img.hash}`}
            alt={img.title ?? ""}
            // Intrinsic dimensions let the browser AR-fit the image
            // before pixels arrive, and — combined with `max-h-full
            // max-w-full` instead of `w-full h-full object-contain` —
            // make the img element match the visible content rect (no
            // viewport-sized letterbox box). The FLIP animation reads
            // `getBoundingClientRect()` from this element, so it starts
            // from the actual image and not the entire screen.
            width={img.width}
            height={img.height}
            draggable={false}
            // Browser defers loading detail-size bytes until the slide
            // is near the viewport. Embla keeps neighbours in the DOM but
            // off-screen (translated by the slide track), so loading=eager
            // would fire all N images upfront.
            loading={isActive ? "eager" : "lazy"}
            decoding="async"
            style={{
              cursor,
              pointerEvents: "auto",
              transform,
              transformOrigin: "center center",
              transition,
            }}
            // `object-contain` is essential — `max-w-full` and `max-h-full`
            // clamp the box independently, so without object-contain a
            // square image inside a 992×836 area would stretch to the box
            // (1.18 ratio). object-contain keeps the rendered content
            // AR-correct regardless of the box's shape. The FLIP animation
            // animates the box rect; object-contain ensures the visible
            // image scales proportionally throughout. `rounded-xl` is on
            // the img (toggled off in fullscreen) so the inline
            // `border-radius` transition animates the corner change. On
            // mobile zoom>1 (escaped), hide the in-flow copy — the overlay
            // sibling renders the scaled image.
            className={`block max-h-full max-w-full select-none object-contain md:rounded-none${
              fullscreen ? "" : " max-md:rounded-xl"
            }${hideOnMobileWhenEscaped ? " max-md:invisible" : ""}`}
          />
        </div>
      </div>

      {/* Mobile editor. Active slide gets the real form; neighbours get a
          skeleton placeholder so the swipe shows the form area sliding
          alongside the image. Hidden on desktop (the side <aside> in the
          parent shows the real one) and in mobile fullscreen mode. */}
      <div className={fullscreen ? "hidden" : "md:hidden"}>
        {isActive ? (
          <DetailEditor
            key={img.id}
            imageId={img.id}
            view={view}
            onRemoved={onRemoved}
            onClose={onClose}
          />
        ) : (
          <DetailEditorSkeleton />
        )}
      </div>
    </div>
  );
});

// Mirrors the loading state inside DetailEditor itself. Shown in the
// inactive slides so the form area slides in alongside the image; once
// the swipe commits and Embla's `select` event fires, the real editor
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
