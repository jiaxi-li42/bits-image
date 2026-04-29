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

export type CreateEntityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  placeholder: string;
  /**
   * Called with the trimmed name when the user submits. Should return a promise
   * that resolves once the entity is created (or rejects/return false to keep
   * the dialog open for the user to fix the input).
   *
   * Return `true` (or `void`) on success → dialog closes and the input clears.
   * Return `false` → dialog stays open and the input is preserved.
   */
  onCreate: (name: string) => Promise<boolean | void>;
  pendingLabel?: string;
  submitLabel?: string;
};

/**
 * Shared "name a new thing" dialog. Used for new folders, subfolders, and
 * tags. Handles the input-clear-on-close bug so callers don't have to.
 */
export function CreateEntityDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  onCreate,
  pendingLabel = "Creating…",
  submitLabel = "Create",
}: CreateEntityDialogProps) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  // base-ui doesn't fire onOpenChange when consumers set `open` externally
  // (e.g. via Cancel), so reset on every transition to closed.
  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await onCreate(trimmed);
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
          placeholder={placeholder}
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
