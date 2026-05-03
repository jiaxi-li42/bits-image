"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type TagChipProps = {
  name: string;
  onRemove: () => void;
  removeAriaLabel?: string;
};

/**
 * Shared "tag with × close" chip used by TagPicker for the list of
 * assigned tags. Lines up alongside Button size="sm" (h-7).
 */
export function TagChip({ name, onRemove, removeAriaLabel }: TagChipProps) {
  return (
    <Badge variant="secondary" size="md" className="max-w-full pr-1">
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
