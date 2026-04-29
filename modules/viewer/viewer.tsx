"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GridImage, ViewKind } from "@/modules/views";
import { DetailEditor } from "@/modules/details";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.4;

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
  // Mirror the latest zoom/pan in refs so the wheel handler can read fresh
  // values across rapid events without depending on React's batching.
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

  // Lock background scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // Wheel adjusts zoom; up = in, down = out. We attach via ref so we can
  // make the listener non-passive and call preventDefault() — React's JSX
  // onWheel is passive in React 17+, which silently drops preventDefault.
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY / 300);
      // Cursor offset from the image's natural centre (== stage centre,
      // because the image is centered in the stage flex container). Used
      // to keep the world-point under the cursor stationary across zooms.
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + rect.width / 2);
      const offsetY = e.clientY - (rect.top + rect.height / 2);
      // Read live values via refs — multiple wheel events can fire in the
      // same tick before React commits, and we need each event to anchor
      // off the most recent zoom/pan, not the value React last rendered.
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
      // Update refs synchronously so the next wheel event reads correct
      // state regardless of when React commits.
      zoomRef.current = z1;
      panRef.current = newPan;
      setZoom(z1);
      setPan(newPan);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pan: drag the image when zoomed > 1.
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startPanX: number;
    startPanY: number;
    pointerId: number;
  } | null>(null);

  const onImagePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    // Only left-button drags pan; right/middle stay native.
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

  const cursor =
    zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default";

  // Stop propagation on toolbar/arrow clicks so an outer listener cannot
  // accidentally intercept them. (Not strictly required today, but cheap
  // insurance against pointer-event regressions from popovers / drag.)
  const stopAnd = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex bg-background/40 backdrop-blur-xl backdrop-saturate-150"
      role="dialog"
      aria-modal="true"
      aria-label="Image Viewer"
      data-viewer="true"
    >
      <div
        ref={stageRef}
        className="relative flex flex-1 min-w-0 items-center justify-center overflow-hidden"
      >
        {/* Counter */}
        {total > 1 ? (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1 text-xs text-background shadow">
            {safeIndex + 1} / {total}
          </div>
        ) : null}

        {/* Toolbar (top-right): zoom in / zoom out, stacked. Close lives in the editor panel header. */}
        <div
          data-slot="button-group"
          data-orientation="vertical"
          className="absolute top-3 right-3 z-20 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm"
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

        {/* Prev arrow */}
        {total > 1 ? (
          <div className="absolute top-1/2 left-3 z-20 -translate-y-1/2">
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

        {/* Image */}
        <div className="pointer-events-none flex h-full w-full items-center justify-center p-8">
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
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging
                ? "none"
                : "transform 120ms ease-out",
              cursor,
              touchAction: zoom > 1 ? "none" : "auto",
              pointerEvents: "auto",
            }}
            className="max-h-full max-w-full select-none object-contain"
          />
        </div>

        {/* Next arrow */}
        {total > 1 ? (
          <div className="absolute top-1/2 right-3 z-20 -translate-y-1/2">
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

      {/* Right-side editor panel */}
      <aside className="hidden md:flex w-96 shrink-0 flex-col border-l border-border/50 bg-background/95 backdrop-blur-md">
        <DetailEditor
          key={current.id}
          imageId={current.id}
          view={view}
          onRemoved={handleRemoved}
          onClose={closeWithCurrent}
        />
      </aside>
    </div>
  );
}
