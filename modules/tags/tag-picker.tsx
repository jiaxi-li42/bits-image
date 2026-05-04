"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { TagChip } from "./tag-chip";
import {
  assignTag,
  assignTagByName,
  listTagsForImage,
  unassignTag,
  type Tag,
} from "./server";

export function TagPicker({ imageId }: { imageId: string }) {
  // Global tag list comes from the shell provider — server-rendered and
  // refreshed automatically via revalidatePath whenever a tag is created,
  // renamed, or deleted (see modules/tags/server.ts:revalidateAllViews).
  const { tags: all } = useShell();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assigned, setAssigned] = useState<Tag[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listTagsForImage(imageId).then((forImage) => {
      if (cancelled) return;
      setAssigned(forImage);
      setLoadingAssigned(false);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  const assignedIds = useMemo(
    () => new Set(assigned.map((t) => t.id)),
    [assigned],
  );
  const trimmed = query.trim().toLowerCase();
  const { filtered, canCreate } = useMemo(() => {
    const f = all.filter((t) => t.name.includes(trimmed));
    const exact = f.find((t) => t.name === trimmed);
    return { filtered: f, canCreate: trimmed.length > 0 && !exact };
  }, [all, trimmed]);

  const onAssign = (tag: Tag) => {
    if (assignedIds.has(tag.id)) return;
    setAssigned((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    startTransition(async () => {
      await assignTag(imageId, tag.id);
    });
  };

  const onUnassign = (tag: Tag) => {
    setAssigned((prev) => prev.filter((t) => t.id !== tag.id));
    startTransition(async () => {
      await unassignTag(imageId, tag.id);
    });
  };

  const onCreate = () => {
    const name = trimmed;
    if (!name) return;
    setQuery("");
    startTransition(async () => {
      const res = await assignTagByName(imageId, name);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      // Optimistically reflect the assignment for this image. The new tag
      // itself appears in the global `all` list once revalidatePath
      // re-renders the shell.
      setAssigned((prev) =>
        prev.some((t) => t.id === res.tag.id)
          ? prev
          : [...prev, res.tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-3.5" />
              Add Tag
            </Button>
          }
        />
        <PopoverContent className="w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={loadingAssigned ? "Loading…" : "Search or create…"}
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  e.preventDefault();
                  onCreate();
                }
              }}
            />
            <CommandList>
              <CommandEmpty>{loadingAssigned ? "Loading…" : "No tags."}</CommandEmpty>
              {filtered.length > 0 ? (
                <CommandGroup heading="Tags">
                  {filtered.map((t) => {
                    const isAssigned = assignedIds.has(t.id);
                    return (
                      <Tooltip key={t.id}>
                        <TooltipTrigger
                          render={
                            <CommandItem
                              value={t.name}
                              data-checked={isAssigned ? "true" : "false"}
                              onSelect={() =>
                                isAssigned ? onUnassign(t) : onAssign(t)
                              }
                            >
                              <span className="min-w-0 flex-1 truncate">{t.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t.count}
                              </span>
                            </CommandItem>
                          }
                        />
                        <TooltipContent side="right">{t.name}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {canCreate ? (
                <CommandGroup>
                  <CommandItem value={`__create_${trimmed}`} onSelect={onCreate}>
                    <Plus className="size-4" />
                    Create &quot;{trimmed}&quot;
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {assigned.map((t) => (
        <TagChip
          key={t.id}
          name={t.name}
          onRemove={() => onUnassign(t)}
          removeAriaLabel={`Remove Tag ${t.name}`}
        />
      ))}
    </div>
  );
}
