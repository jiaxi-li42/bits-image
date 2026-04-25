"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailSheet } from "@/modules/details";
import type { ViewKind } from "@/modules/views";

export type Change = "removed" | "updated";

export function ImageActionsMenu({
  imageId,
  view,
  onChanged,
}: {
  imageId: string;
  view: ViewKind;
  onChanged?: (change: Change) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="size-7 rounded-full shadow-sm"
        aria-label="Edit details"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>

      {open ? (
        <DetailSheet
          imageId={imageId}
          open={open}
          onOpenChange={setOpen}
          view={view}
          onUpdated={() => onChanged?.("updated")}
          onRemoved={() => onChanged?.("removed")}
        />
      ) : null}
    </>
  );
}
