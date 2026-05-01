"use client";

import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { useManage } from "./manage-context";

export function ManageBar({
  variant = "inline",
}: {
  variant?: "inline" | "floating";
}) {
  const { isManaging, enter } = useManage();

  if (variant === "floating") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={enter}
        disabled={isManaging}
        aria-pressed={isManaging}
        aria-label="Manage"
        className={FLOATING_BUTTON_CLASS}
      >
        <SquarePen />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={enter}
      disabled={isManaging}
      aria-pressed={isManaging}
    >
      <SquarePen className="size-3.5" />
      Manage
    </Button>
  );
}
