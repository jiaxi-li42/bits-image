"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ViewKind } from "@/modules/views";
import { useManage } from "./manage-context";
import { MoveToFolderAction } from "./move-to-folder-action";
import { EditTagsAction } from "./edit-tags-action";
import { DeleteAction } from "./delete-action";
import { RestoreAction } from "./restore-action";
import { HardDeleteAction } from "./hard-delete-action";

export function ManagePanel({ view }: { view: ViewKind }) {
  const { isManaging, count, clear, exit } = useManage();
  if (!isManaging) return null;

  const isTrash = view === "trash";

  return (
    <div
      data-manage-panel="true"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-xl backdrop-blur-md"
      role="region"
      aria-label="Manage selected photos"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <span className="text-sm">
          <span className="font-semibold">{count}</span>
          <span className="ml-1 text-muted-foreground">
            {count === 1 ? "photo" : "photos"} selected
          </span>
        </span>
        <Separator orientation="vertical" className="mx-2 h-6" />
        {isTrash ? (
          <>
            <RestoreAction />
            <HardDeleteAction />
          </>
        ) : (
          <>
            <MoveToFolderAction />
            <EditTagsAction />
            <DeleteAction />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={count === 0}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exit}
            aria-label="Close manage panel"
          >
            <X className="size-3.5" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
