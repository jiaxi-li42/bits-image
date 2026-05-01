"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TagChipDensity = "default" | "compact";

export type TagChipProps = {
  name: string;
  onRemove: () => void;
  /**
   * `default` (h-7) lines up alongside Button size="sm" — used in the
   * single-image TagPicker. `compact` is the tighter chip used inside
   * the filter-bar trigger so multiple chips wrap cleanly.
   */
  density?: TagChipDensity;
  removeAriaLabel?: string;
};

/**
 * Shared "tag with × close" chip. Single source of truth for the
 * Badge + remove-button composition used by TagPicker and TagFilterBar.
 */
export function TagChip({
  name,
  onRemove,
  density = "default",
  removeAriaLabel,
}: TagChipProps) {
  const isCompact = density === "compact";
  return (
    <Badge
      variant="secondary"
      size={isCompact ? "sm" : "md"}
      className={cn(
        "max-w-full",
        isCompact ? "gap-1 rounded-sm py-0 pr-0.5 pl-1.5" : "pr-1",
      )}
    >
      <span className="truncate">{name}</span>
      <span
        role="button"
        tabIndex={-1}
        aria-label={removeAriaLabel ?? `Remove ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="shrink-0 rounded-full p-0.5 hover:bg-muted-foreground/20"
      >
        <X className="size-3" />
      </span>
    </Badge>
  );
}
