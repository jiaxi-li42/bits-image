"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { useManage } from "./manage-context";

type ConfirmActionProps = {
  triggerLabel: string;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  successToast: (n: number) => string;
  run: (ids: string[]) => Promise<{ count: number }>;
};

/**
 * Shared scaffolding for bulk actions that need a confirmation dialog: a
 * Delete-style trigger button + an AlertDialog + a transition that runs the
 * server action, toasts, closes the dialog, and clears the selection.
 *
 * Used by DeleteAction (soft-delete) and HardDeleteAction (permanent delete).
 */
export function ConfirmAction({
  triggerLabel,
  triggerIcon,
  triggerClassName,
  title,
  description,
  confirmLabel,
  pendingLabel,
  successToast,
  run,
}: ConfirmActionProps) {
  const { selected, count, clear } = useManage();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await run(ids);
      toast(successToast(res.count));
      setOpen(false);
      clear();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={count === 0}
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerIcon}
        {triggerLabel}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} disabled={pending}>
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
