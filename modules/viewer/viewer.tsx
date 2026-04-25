"use client";

import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import type { GridImage, ViewKind } from "@/modules/views";
import { ViewerToolbar } from "./viewer-toolbar";

export type ViewerProps = {
  images: GridImage[];
  startIndex: number;
  onClose: () => void;
  view: ViewKind;
  onRemoved: (id: string) => void;
};

export function Viewer({ images, startIndex, onClose, view, onRemoved }: ViewerProps) {
  const [index, setIndex] = useState(startIndex);

  const slides = useMemo(
    () =>
      images.map((img) => ({
        src: `/api/img/detail/${img.hash}`,
        width: img.width,
        height: img.height,
        alt: img.title ?? "",
        id: img.id,
      })),
    [images],
  );

  const current = images[index];

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      on={{ view: ({ index: i }) => setIndex(i) }}
      slides={slides}
      plugins={[Zoom, Counter]}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
      controller={{ closeOnBackdropClick: true }}
      toolbar={{
        buttons: current
          ? [
              <ViewerToolbar
                key={`actions-${current.id}`}
                image={current}
                view={view}
                onRemoved={(id) => {
                  onRemoved(id);
                  if (images.length <= 1) onClose();
                  else setIndex((i) => Math.min(i, images.length - 2));
                }}
              />,
              "close",
            ]
          : ["close"],
      }}
    />
  );
}
