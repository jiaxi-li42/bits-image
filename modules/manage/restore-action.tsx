"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreImages } from "./server";
import { useManage } from "./manage-context";

export function RestoreAction() {
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
      clear();
    });
  };

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
