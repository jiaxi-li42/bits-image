"use client";

import { CheckSquare2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useManage } from "./manage-context";

export function ManageBar() {
  const { isManaging, toggleMode, count } = useManage();

  return (
    <Button
      type="button"
      variant={isManaging ? "secondary" : "outline"}
      size="sm"
      onClick={toggleMode}
      aria-pressed={isManaging}
    >
      <CheckSquare2 className="size-3.5" />
      {isManaging ? "Done" : "Manage"}
      {isManaging && count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
    </Button>
  );
}
