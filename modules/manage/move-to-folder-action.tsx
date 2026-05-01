"use client";

import { useMemo, useState, useTransition } from "react";
import { FolderInput, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FolderListPicker, type FolderNode } from "@/modules/folders";
import {
  addImagesToFolder,
  moveImagesToFolder,
} from "@/modules/folders/server";
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { useManage } from "./manage-context";

export function MoveToFolderAction({
  currentFolderId,
  variant = "inline",
}: {
  currentFolderId?: string;
  variant?: "inline" | "floating";
}) {
  const { selected, count } = useManage();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const isMove = Boolean(currentFolderId);
  const label = isMove ? "Move to Folder" : "Add to Folder";
  const Icon = isMove ? FolderInput : FolderPlus;

  const excludeIds = useMemo(
    () => (currentFolderId ? new Set([currentFolderId]) : undefined),
    [currentFolderId],
  );

  const onPick = (folder: FolderNode) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setOpen(false);
    startTransition(async () => {
      if (currentFolderId) {
        await moveImagesToFolder(ids, currentFolderId, folder.id);
        toast(
          `Moved ${ids.length} ${ids.length === 1 ? "image" : "images"} to "${folder.path}"`,
        );
      } else {
        const { added, alreadyIn } = await addImagesToFolder(ids, folder.id);
        if (added === 0) {
          toast(
            alreadyIn === 1
              ? `Image already in "${folder.path}"`
              : `All ${alreadyIn} images already in "${folder.path}"`,
          );
        } else if (alreadyIn > 0) {
          toast(
            `Added ${added} ${added === 1 ? "image" : "images"} to "${folder.path}" (${alreadyIn} already there)`,
          );
        } else {
          toast(
            `Added ${added} ${added === 1 ? "image" : "images"} to "${folder.path}"`,
          );
        }
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          variant === "floating" ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={count === 0}
              aria-label={label}
              className={FLOATING_BUTTON_CLASS}
            >
              <Icon />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={count === 0}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          )
        }
      />
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <FolderListPicker excludeIds={excludeIds} onPick={onPick} />
      </PopoverContent>
    </Popover>
  );
}
