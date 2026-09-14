"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { restoreImages } from "./server";
import { useManage } from "./manage-context";

export function RestoreAction({
  variant = "inline",
}: {
  variant?: "inline" | "floating";
}) {
  const { selected, count, clear } = useManage();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await restoreImages(ids);
      toast(
        `${res.restored} ${res.restored === 1 ? "image" : "images"} restored`,
      );
      if (res.restored < ids.length) toast.error("Some images could not be restored: expired, pending deletion, or no longer in Trash.");
      clear();
    });
  };

  if (variant === "floating") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled={count === 0 || pending}
        onClick={onClick}
        aria-label="Restore"
        className={FLOATING_BUTTON_CLASS}
      >
        <RotateCcw />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={count === 0 || pending}
      onClick={onClick}
    >
      <RotateCcw className="size-4" />
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
