"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { MasonryPhotoAlbum, type Photo } from "react-photo-album";
import "react-photo-album/masonry.css";
import { loadMore } from "./actions";
import { TRASH_RETENTION_MS } from "./types";
import type { GridImage, TagFilterMode, ViewKind } from "./types";
import { Viewer } from "@/modules/viewer";
import {
  useIsManaging,
  useIsSelected,
  useManageActions,
} from "@/modules/manage";
import { Checkbox } from "@/components/ui/checkbox";

export type GridProps = {
  view: ViewKind;
  initialItems: GridImage[];
  initialCursor: string | null;
  tagIds?: string[];
  tagMode?: TagFilterMode;
  query?: string;
  folderId?: string;
};

type GridPhoto = Photo & {
  id: string;
  hash: string;
  deletedAt: number | null;
};

function toPhoto(i: GridImage): GridPhoto {
  return {
    id: i.id,
    hash: i.hash,
    deletedAt: i.deletedAt,
    src: `/api/img/grid/${i.hash}`,
    width: i.width,
    height: i.height,
    alt: i.title ?? "",
  };
}

function daysLeft(deletedAt: number): number {
  const ms = deletedAt + TRASH_RETENTION_MS - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
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
  // Granular manage subscriptions: the Grid container only needs to know
  // mode + actions. Per-photo selection is read inside <PhotoCard> via
  // `useIsSelected(id)` so a multi-select toggle re-renders only the
  // toggled card, not the whole grid.
  const isManaging = useIsManaging();
  const manageActions = useManageActions();

  // Sync server state into local state ONLY when the server actually
  // delivered a different page. The previous version diffed by reference,
  // which fired on every parent re-render — wiping optimistic deletes
  // the viewer had just applied. Signature is "first-id:length:cursor".
  const serverSig = `${initialItems[0]?.id ?? ""}:${initialItems.length}:${
    initialCursor ?? ""
  }`;
  const lastSyncedSigRef = useRef(serverSig);
  useEffect(() => {
    if (lastSyncedSigRef.current === serverSig) return;
    lastSyncedSigRef.current = serverSig;
    setItems(initialItems);
    setCursor(initialCursor);
  }, [serverSig, initialItems, initialCursor]);

  const photos = useMemo(() => items.map(toPhoto), [items]);

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
    if (isManaging) return;
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
  }, [selectedId, isManaging]);

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
      <div className={`px-4 py-4 md:px-6 ${isManaging ? "pb-24" : ""}`}>
        <MasonryPhotoAlbum
          photos={photos}
          columns={(w) => (w < 540 ? 2 : w < 900 ? 3 : w < 1300 ? 4 : 5)}
          spacing={16}
          onClick={({ index }) => {
            const photo = photos[index];
            if (!photo) return;
            if (isManaging) {
              manageActions.toggle(photo.id);
              return;
            }
            setSelectedId(photo.id);
            setViewerIndex(index);
          }}
          render={{
            button: ({ onClick, style, className, children }, context) => {
              const photo = context?.photo as GridPhoto | undefined;
              return (
                <PhotoCard
                  photo={photo}
                  view={view}
                  isSingleSelected={!!photo && selectedId === photo.id}
                  onClick={onClick}
                  hostStyle={style}
                  hostClassName={className}
                >
                  {children}
                </PhotoCard>
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

/**
 * Per-photo card. Subscribes to its own selection state via
 * `useIsSelected(id)` so a multi-select toggle on a different photo
 * does NOT re-render this one. Mode (`useIsManaging`) is also a
 * granular subscription — it doesn't fire when only the selection
 * changes.
 *
 * `isSingleSelected` is passed as a prop because the single-select
 * highlight is local to the parent Grid (state set on viewer close);
 * it's a rare change so re-rendering all visible cards once is fine.
 */
function PhotoCard({
  photo,
  view,
  isSingleSelected,
  onClick,
  hostStyle,
  hostClassName,
  children,
}: {
  photo: GridPhoto | undefined;
  view: ViewKind;
  isSingleSelected: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  hostStyle?: React.CSSProperties;
  hostClassName?: string;
  children?: ReactNode;
}) {
  const id = photo?.id ?? "";
  const isMulti = useIsSelected(id);
  const isManaging = useIsManaging();
  const isSelected = isMulti || (!isManaging && isSingleSelected);
  return (
    <div
      role="button"
      tabIndex={0}
      style={hostStyle}
      data-photo-card="true"
      data-photo-id={photo?.id}
      className={`${hostClassName ?? ""} relative cursor-pointer overflow-hidden rounded-md outline-none ring-offset-2 ring-offset-background transition-shadow ${
        isSelected
          ? "ring-2 ring-primary"
          : "focus-visible:ring-2 focus-visible:ring-ring"
      }`}
      onClick={onClick as unknown as React.MouseEventHandler<HTMLDivElement>}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
        }
      }}
      aria-pressed={isSelected}
    >
      {children}
      {view === "trash" && photo?.deletedAt != null ? (
        <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-medium text-foreground shadow-xs">
          {(() => {
            const d = daysLeft(photo.deletedAt);
            return d === 1 ? "1 day left" : `${d} days left`;
          })()}
        </span>
      ) : null}
      {isManaging ? (
        <Checkbox
          checked={isMulti}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute top-2 right-2 size-5 bg-background/80"
        />
      ) : null}
    </div>
  );
}
