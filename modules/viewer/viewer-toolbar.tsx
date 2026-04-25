"use client";

import { useState, useTransition } from "react";
import { Download, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import type { GridImage, ViewKind } from "@/modules/views";
import {
  getDownloadUrl,
  hardDeleteImage,
  restoreImage,
  softDeleteImage,
} from "./../actions/server";

export function ViewerToolbar({
  image,
  view,
  onRemoved,
}: {
  image: GridImage;
  view: ViewKind;
  onRemoved: (id: string) => void;
}) {
  const [, startTransition] = useTransition();
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isTrash = view === "trash";

  const onDownload = async () => {
    const url = await getDownloadUrl(image.id);
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
      await softDeleteImage(image.id);
      toast("Moved to Trash");
      onRemoved(image.id);
    });
  };

  const onRestore = () => {
    startTransition(async () => {
      await restoreImage(image.id);
      toast("Restored");
      onRemoved(image.id);
    });
  };

  const onHardDelete = () => {
    startTransition(async () => {
      await hardDeleteImage(image.id);
      toast("Deleted permanently");
      onRemoved(image.id);
    });
  };

  const btn =
    "yarl__button inline-flex size-10 items-center justify-center text-white/80 hover:text-white";

  return (
    <div className="flex items-center">
      {!isTrash ? (
        <>
          <button
            type="button"
            className={btn}
            aria-label="Edit details"
            onClick={() => setDetailsOpen(true)}
          >
            <Pencil className="size-5" />
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Download"
            onClick={onDownload}
          >
            <Download className="size-5" />
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Move to Trash"
            onClick={onSoftDelete}
          >
            <Trash2 className="size-5" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={btn}
            aria-label="Restore"
            onClick={onRestore}
          >
            <RotateCcw className="size-5" />
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Download"
            onClick={onDownload}
          >
            <Download className="size-5" />
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Delete permanently"
            onClick={() => setConfirmPurge(true)}
          >
            <Trash2 className="size-5" />
          </button>
        </>
      )}

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
            <AlertDialogAction onClick={onHardDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailsOpen ? (
        <DetailSheet
          imageId={image.id}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      ) : null}
    </div>
  );
}
