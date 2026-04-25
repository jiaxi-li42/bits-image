"use client";

import { useState, useTransition } from "react";
import { MoreVertical, Download, Trash2, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DetailSheet } from "@/modules/details";
import type { ViewKind } from "@/modules/views";
import {
  getDownloadUrl,
  hardDeleteImage,
  restoreImage,
  softDeleteImage,
} from "./server";

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
  const [, startTransition] = useTransition();
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isTrash = view === "trash";

  const onDownload = async () => {
    const url = await getDownloadUrl(imageId);
    if (!url) {
      toast.error("Could not get download URL");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onSoftDelete = () => {
    startTransition(async () => {
      await softDeleteImage(imageId);
      toast("Moved to Trash");
      onChanged?.("removed");
    });
  };

  const onRestore = () => {
    startTransition(async () => {
      await restoreImage(imageId);
      toast("Restored");
      onChanged?.("removed");
    });
  };

  const onHardDelete = () => {
    startTransition(async () => {
      await hardDeleteImage(imageId);
      toast("Deleted permanently");
      onChanged?.("removed");
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon"
              className="size-7 rounded-full shadow-sm"
              aria-label="Image actions"
            >
              <MoreVertical className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {!isTrash ? (
            <>
              <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                <Pencil className="size-4" />
                Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDownload}>
                <Download className="size-4" />
                Download
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSoftDelete} variant="destructive">
                <Trash2 className="size-4" />
                Move to Trash
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={onRestore}>
                <RotateCcw className="size-4" />
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDownload}>
                <Download className="size-4" />
                Download
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmPurge(true)}
                variant="destructive"
              >
                <Trash2 className="size-4" />
                Delete permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the image from storage. It cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onHardDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailsOpen ? (
        <DetailSheet
          imageId={imageId}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onUpdated={() => onChanged?.("updated")}
        />
      ) : null}
    </>
  );
}
