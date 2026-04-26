"use client";

import { CheckSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManage } from "./manage-context";

export function ManageBar() {
  const { isManaging, toggleMode, count } = useManage();

  return (
    <Button
      type="button"
      variant={isManaging ? "secondary" : "outline"}
      size="sm"
      className="h-7 gap-1.5"
      onClick={toggleMode}
      aria-pressed={isManaging}
    >
      <CheckSquare2 className="size-3.5" />
      {isManaging ? "Done" : "Manage"}
      {isManaging && count > 0 ? (
        <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-xs text-primary">
          {count}
        </span>
      ) : null}
    </Button>
  );
}
