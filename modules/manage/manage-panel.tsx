"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViewKind } from "@/modules/views";
import { useManage } from "./manage-context";
import { MoveToFolderAction } from "./move-to-folder-action";
import { EditTagsAction } from "./edit-tags-action";
import { DeleteAction } from "./delete-action";
import { RestoreAction } from "./restore-action";
import { HardDeleteAction } from "./hard-delete-action";

export function ManagePanel({
  view,
  folderId,
}: {
  view: ViewKind;
  folderId?: string;
}) {
  const { isManaging, count, clear, exit } = useManage();
  if (!isManaging) return null;

  const isTrash = view === "trash";

  return (
    <div
      data-manage-panel="true"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-xl backdrop-blur-md md:left-60"
      role="region"
      aria-label="Manage selected images"
    >
      <div className="flex flex-wrap items-center gap-3 p-4 md:px-6">
        <span className="text-sm text-muted-foreground">
          {count} {count === 1 ? "image" : "images"} selected
        </span>
        <div className="flex items-center gap-2">
          {isTrash ? (
            <>
              <RestoreAction />
              <HardDeleteAction />
            </>
          ) : (
            <>
              <MoveToFolderAction currentFolderId={folderId} />
              <EditTagsAction />
              <DeleteAction />
            </>
          )}
        </div>
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
            aria-label="Exit manage mode"
          >
            <Check className="size-3.5" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
