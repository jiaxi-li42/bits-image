"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { MasonryPhotoAlbum, type Photo } from "react-photo-album";
import "react-photo-album/masonry.css";
import { loadMore } from "./actions";
import type { GridImage, TagFilterMode, ViewKind } from "./types";
import { Viewer } from "@/modules/viewer";
import { useManage } from "@/modules/manage";

export type GridProps = {
  view: ViewKind;
  initialItems: GridImage[];
  initialCursor: string | null;
  tagIds?: string[];
  tagMode?: TagFilterMode;
  query?: string;
  folderId?: string;
};

type GridPhoto = Photo & { id: string; hash: string };

function toPhoto(i: GridImage): GridPhoto {
  return {
    id: i.id,
    hash: i.hash,
    src: `/api/img/grid/${i.hash}`,
    width: i.width,
    height: i.height,
    alt: i.title ?? "",
  };
}

export function Grid({
  view,
  initialItems,
  initialCursor,
  tagIds,
  tagMode,
  query,
  folderId,
}: GridProps) {
  const [items, setItems] = useState<GridImage[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const manage = useManage();

  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
  }, [initialItems, initialCursor]);

  const photos = items.map(toPhoto);

  const loadNext = useCallback(() => {
    if (!cursor || pending) return;
    const c = cursor;
    startTransition(async () => {
      const res = await loadMore({
        view,
        cursor: c,
        tagIds,
        tagMode,
        query,
        folderId,
      });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    });
  }, [cursor, pending, view, tagIds, tagMode, query, folderId]);

  useEffect(() => {
    if (!cursor) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNext();
      },
      { rootMargin: "800px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loadNext]);

  // Click anywhere on the page (other than a photo card) deselects the
  // single-select highlight. Skipped while Manage mode is on so bulk
  // selection isn't wiped by clicking sidebar / toolbar / panel.
  useEffect(() => {
    if (manage.isManaging) return;
    if (!selectedId) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Don't deselect for clicks inside any photo card or the viewer overlay.
      if (target.closest("[data-photo-card]")) return;
      if (target.closest('[data-viewer="true"]')) return;
      // Don't fight popovers / dialogs / toasts living in portals.
      if (
        target.closest(
          '[data-slot="popover-content"],[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[role="dialog"],[role="menu"]',
        )
      )
        return;
      setSelectedId(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [selectedId, manage.isManaging]);

  if (items.length === 0) return null;

  const onViewerClose = (lastShownId: string) => {
    setViewerIndex(null);
    setSelectedId(lastShownId);
    // Wait for the viewer to unmount and the grid to settle, then scroll.
    if (!lastShownId) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-photo-id="${CSS.escape(lastShownId)}"]`,
        );
        if (!el) return;
        // Check whether the card is already comfortably on screen; if so, skip
        // the scroll so we don't yank the viewport for a tiny adjustment.
        const r = el.getBoundingClientRect();
        const fullyVisible = r.top >= 0 && r.bottom <= window.innerHeight;
        if (!fullyVisible) {
          el.scrollIntoView({ block: "center", behavior: "auto" });
        }
      });
    });
  };

  return (
    <>
      <div
        className={`px-4 py-4 md:px-6 ${manage.isManaging ? "pb-24" : ""}`}
      >
        <MasonryPhotoAlbum
          photos={photos}
          columns={(w) => (w < 540 ? 2 : w < 900 ? 3 : w < 1300 ? 4 : 5)}
          spacing={8}
          onClick={({ index }) => {
            const photo = photos[index];
            if (!photo) return;
            if (manage.isManaging) {
              manage.toggle(photo.id);
              return;
            }
            setSelectedId(photo.id);
            setViewerIndex(index);
          }}
          render={{
            button: ({ onClick, style, className, children }, context) => {
              const photo = context?.photo as GridPhoto | undefined;
              const isMulti = !!photo && manage.isSelected(photo.id);
              const isSingle =
                !manage.isManaging && !!photo && selectedId === photo.id;
              const isSelected = isMulti || isSingle;
              return (
                <div
                  role="button"
                  tabIndex={0}
                  style={style}
                  data-photo-card="true"
                  data-photo-id={photo?.id}
                  className={`${className ?? ""} relative cursor-pointer rounded-md outline-none ring-offset-2 ring-offset-background transition-shadow ${
                    isSelected
                      ? "ring-2 ring-primary"
                      : "focus-visible:ring-2 focus-visible:ring-ring"
                  }`}
                  onClick={onClick as unknown as React.MouseEventHandler<HTMLDivElement>}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClick?.(
                        e as unknown as React.MouseEvent<HTMLButtonElement>,
                      );
                    }
                  }}
                  aria-pressed={isSelected}
                >
                  {children}
                  {manage.isManaging ? (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border ${
                        isMulti
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-foreground/40 bg-background/80"
                      }`}
                    >
                      {isMulti ? <Check className="size-3.5" /> : null}
                    </span>
                  ) : null}
                </div>
              );
            },
          }}
        />
        <div ref={sentinelRef} className="h-10" aria-hidden />
        {pending ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : null}
      </div>
      {viewerIndex !== null ? (
        <Viewer
          images={items}
          startIndex={viewerIndex}
          onClose={onViewerClose}
          view={view}
          onRemoved={(id) =>
            setItems((prev) => prev.filter((img) => img.id !== id))
          }
        />
      ) : null}
    </>
  );
}
