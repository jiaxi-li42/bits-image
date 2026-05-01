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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:left-60"
      role="region"
      aria-label="Manage selected images"
    >
      {/* Mobile-only: floating action row sitting above the bottom bar.
          Buttons inside are pointer-events-auto via FLOATING_BUTTON_CLASS so
          the transparent space around them lets clicks reach the grid. */}
      <div
        className="flex justify-center gap-3 px-4 pb-3 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        {isTrash ? (
          <>
            <RestoreAction variant="floating" />
            <HardDeleteAction variant="floating" />
          </>
        ) : (
          <>
            <MoveToFolderAction
              currentFolderId={folderId}
              variant="floating"
            />
            <EditTagsAction variant="floating" />
            <DeleteAction variant="floating" />
          </>
        )}
      </div>

      {/* Bottom bar: count on the left, inline actions in the middle on
          desktop only, Clear/Done on the right. */}
      <div className="pointer-events-auto border-t bg-background/95 shadow-xl backdrop-blur-md">
        <div
          className="flex flex-wrap items-center gap-3 p-4 md:px-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <span className="text-sm text-muted-foreground">
            {count} {count === 1 ? "image" : "images"} selected
          </span>

          {/* Desktop-only inline actions */}
          <div className="hidden items-center gap-2 md:flex">
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
    </div>
  );
}
