"use client";

import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManage } from "./manage-context";

export function ManageBar() {
  const { isManaging, enter } = useManage();

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
