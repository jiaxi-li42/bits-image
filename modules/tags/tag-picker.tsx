"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  assignTag,
  assignTagByName,
  listTags,
  listTagsForImage,
  unassignTag,
  type Tag,
  type TagWithCount,
} from "./server";

export function TagPicker({ imageId }: { imageId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assigned, setAssigned] = useState<Tag[]>([]);
  const [all, setAll] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTagsForImage(imageId), listTags()]).then(([forImage, allTags]) => {
      if (cancelled) return;
      setAssigned(forImage);
      setAll(allTags);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  const assignedIds = new Set(assigned.map((t) => t.id));
  const trimmed = query.trim().toLowerCase();
  const filtered = all.filter((t) => t.name.includes(trimmed));
  const exact = filtered.find((t) => t.name === trimmed);
  const canCreate = trimmed.length > 0 && !exact;

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
      setAssigned((prev) =>
        prev.some((t) => t.id === res.tag.id)
          ? prev
          : [...prev, res.tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setAll((prev) =>
        prev.some((t) => t.id === res.tag.id)
          ? prev
          : [...prev, { ...res.tag, count: 1 }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
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
              placeholder={loading ? "Loading…" : "Search or create…"}
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
              <CommandEmpty>{loading ? "Loading…" : "No tags."}</CommandEmpty>
              {filtered.length > 0 ? (
                <CommandGroup heading="Tags">
                  {filtered.map((t) => {
                    const isAssigned = assignedIds.has(t.id);
                    return (
                      <CommandItem
                        key={t.id}
                        value={t.name}
                        data-checked={isAssigned ? "true" : "false"}
                        onSelect={() => (isAssigned ? onUnassign(t) : onAssign(t))}
                      >
                        <span className="flex-1 truncate">{t.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t.count}
                        </span>
                      </CommandItem>
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
        <Badge key={t.id} variant="secondary" size="md" className="pr-1">
          {t.name}
          <button
            type="button"
            onClick={() => onUnassign(t)}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
            aria-label={`Remove Tag ${t.name}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
