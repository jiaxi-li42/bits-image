"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MasonryPhotoAlbum, type Photo } from "react-photo-album";
import "react-photo-album/masonry.css";
import { loadMore } from "./actions";
import type { GridImage, TagFilterMode, ViewKind } from "./types";
import { Viewer } from "@/modules/viewer";
import { ImageActionsMenu } from "@/modules/actions";

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

export function Grid({ view, initialItems, initialCursor, tagIds, tagMode, query, folderId }: GridProps) {
  const [items, setItems] = useState<GridImage[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
  }, [initialItems, initialCursor]);

  const photos = items.map(toPhoto);

  const loadNext = useCallback(() => {
    if (!cursor || pending) return;
    const c = cursor;
    startTransition(async () => {
      const res = await loadMore({ view, cursor: c, tagIds, tagMode, query, folderId });
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

  if (items.length === 0) return null;

  return (
    <>
      <div className="px-4 py-4 md:px-6">
        <MasonryPhotoAlbum
          photos={photos}
          columns={(w) => (w < 540 ? 2 : w < 900 ? 3 : w < 1300 ? 4 : 5)}
          spacing={8}
          onClick={({ index }) => setViewerIndex(index)}
          render={{
            button: ({ onClick, style, className, children }) => (
              <div
                role="button"
                tabIndex={0}
                style={style}
                className={`${className ?? ""} group relative`}
                onClick={onClick as unknown as React.MouseEventHandler<HTMLDivElement>}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
                  }
                }}
              >
                {children}
              </div>
            ),
            extras: (_, { photo, index }) => (
              <div
                className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <ImageActionsMenu
                  imageId={(photo as GridPhoto).id}
                  view={view}
                  onChanged={(change) => {
                    if (change === "removed") {
                      setItems((prev) => prev.filter((_, i) => i !== index));
                    }
                  }}
                />
              </div>
            ),
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
          onClose={() => setViewerIndex(null)}
          view={view}
          onRemoved={(id) =>
            setItems((prev) => prev.filter((img) => img.id !== id))
          }
        />
      ) : null}
    </>
  );
}
