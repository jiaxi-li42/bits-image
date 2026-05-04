"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useShell } from "@/modules/shell/shell-context";
import type { FolderNode } from "./server";

export type FolderListPickerProps = {
  /**
   * Folder ids to mark as already-assigned (renders with `data-checked="true"`).
   * If `onPick` is called with one of these, the caller decides whether it
   * means "remove" (toggle UX) or "no-op" (single-target picker UX).
   */
  assignedIds?: ReadonlySet<string>;
  /**
   * Folder ids to hide from the list entirely (e.g. the current folder for a
   * "move to" picker).
   */
  excludeIds?: ReadonlySet<string>;
  onPick: (folder: FolderNode) => void;
  /**
   * If provided, an unmatched search submits with Enter to create a new
   * top-level folder via this callback.
   */
  onCreate?: (name: string) => void;
  searchPlaceholder?: string;
};

/**
 * Shared `<Command>` body for folder pickers. The caller owns the `<Popover>`
 * shell and decides how/where to mount this. Both single-image (folder-picker)
 * and bulk (move-to-folder-action) flows feed it the same data.
 */
export function FolderListPicker({
  assignedIds,
  excludeIds,
  onPick,
  onCreate,
  searchPlaceholder,
}: FolderListPickerProps) {
  const [query, setQuery] = useState("");
  const { folders } = useShell();

  const trimmed = query.trim();
  const visible = excludeIds
    ? folders.filter((f) => !excludeIds.has(f.id))
    : folders;
  const filtered = trimmed
    ? visible.filter((f) =>
        f.path.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : visible;
  const exact = filtered.find(
    (f) => f.path === trimmed || f.name === trimmed,
  );
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !exact;
  const showTree = trimmed.length === 0;

  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={
          searchPlaceholder ?? (onCreate ? "Search or create…" : "Search folders…")
        }
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canCreate && onCreate) {
            e.preventDefault();
            onCreate(trimmed);
            setQuery("");
          }
        }}
      />
      <CommandList>
        <CommandEmpty>No folders.</CommandEmpty>
        {filtered.length > 0 ? (
          <CommandGroup heading="Folders">
            {filtered.map((f) => {
              const isAssigned = assignedIds?.has(f.id) ?? false;
              const label = showTree ? f.name : f.path;
              return (
                <Tooltip key={f.id}>
                  <TooltipTrigger
                    render={
                      <CommandItem
                        value={f.path}
                        data-checked={isAssigned ? "true" : undefined}
                        onSelect={() => onPick(f)}
                      >
                        <span
                          className="min-w-0 flex-1 truncate"
                          style={
                            showTree
                              ? { paddingLeft: `${f.depth * 14}px` }
                              : undefined
                          }
                        >
                          {label}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {f.count}
                        </span>
                      </CommandItem>
                    }
                  />
                  <TooltipContent side="right">{f.path}</TooltipContent>
                </Tooltip>
              );
            })}
          </CommandGroup>
        ) : null}
        {canCreate && onCreate ? (
          <CommandGroup>
            <CommandItem
              value={`__create_${trimmed}`}
              onSelect={() => {
                onCreate(trimmed);
                setQuery("");
              }}
            >
              <Plus className="size-4" />
              Create &quot;{trimmed}&quot;
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );
}
