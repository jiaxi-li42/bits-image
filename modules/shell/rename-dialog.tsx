"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  initialName: string;
  /**
   * Called with the trimmed new name when the user submits.
   * Return `false` to keep the dialog open with the input preserved.
   */
  onRename: (name: string) => Promise<boolean | void>;
  pendingLabel?: string;
  submitLabel?: string;
};

/**
 * Shared "rename a thing" dialog. Resets the input back to `initialName`
 * whenever the dialog reopens (handles base-ui's missing onOpenChange call
 * when the consumer toggles `open` externally).
 */
export function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  onRename,
  pendingLabel = "Saving…",
  submitLabel = "Save",
}: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) setName(initialName);
  }, [open, initialName]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === initialName) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      const result = await onRename(trimmed);
      if (result === false) return;
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          autoFocus
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
