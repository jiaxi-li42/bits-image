"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { emptyTrash } from "./server";

export function TrashEmptyButton({
  disabled,
  variant = "inline",
}: {
  disabled?: boolean;
  variant?: "inline" | "floating";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onConfirm = () => {
    startTransition(async () => {
      const { removed } = await emptyTrash();
      setOpen(false);
      toast(removed > 0 ? `${removed} image${removed === 1 ? "" : "s"} deleted` : "Trash already empty");
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          variant === "floating" ? (
            <Button
              variant="destructive"
              size="icon"
              disabled={disabled}
              aria-label="Empty Trash"
              className={FLOATING_BUTTON_CLASS}
            >
              <Trash2 />
            </Button>
          ) : (
            <Button variant="destructive" size="sm" disabled={disabled}>
              <Trash2 className="size-4" />
              Empty Trash
            </Button>
          )
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Empty trash?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes every image in trash. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting…" : "Empty Trash"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
