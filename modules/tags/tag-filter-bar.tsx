"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { listTags, type TagWithCount } from "./server";

export function TagFilterBar({ excludeTagId }: { excludeTagId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [all, setAll] = useState<TagWithCount[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"and" | "or">("and");

  useEffect(() => {
    let cancelled = false;
    listTags().then((t) => {
      if (cancelled) return;
      setAll(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("tags") ?? "";
      setSelectedIds(raw ? raw.split(",").filter(Boolean) : []);
      const m = sp.get("mode");
      setMode(m === "or" ? "or" : "and");
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname]);

  const update = (next: { tagIds?: string[]; mode?: "and" | "or" }) => {
    const sp = new URLSearchParams(window.location.search);
    const ids = next.tagIds ?? selectedIds;
    const m = next.mode ?? mode;
    if (ids.length > 0) sp.set("tags", ids.join(","));
    else sp.delete("tags");
    if (ids.length > 1) sp.set("mode", m);
    else sp.delete("mode");
    setSelectedIds(ids);
    setMode(m);
    const qs = sp.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    update({ tagIds: next });
  };

  const clear = () => update({ tagIds: [] });

  const visibleTags = excludeTagId
    ? all.filter((t) => t.id !== excludeTagId)
    : all;
  const selected = visibleTags.filter((t) => selectedIds.includes(t.id));

  if (visibleTags.length === 0 && selected.length === 0) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                // Allow chips to wrap into multiple lines while keeping the
                // base sm height as a floor. Left-align so chips don't drift
                // to the centre when the trigger grows.
                "h-auto min-h-7 min-w-[7rem] max-w-xs flex-wrap justify-start py-1",
                selected.length > 0 &&
                  // When chips are present the trigger reads more like an
                  // input than a button — drop pointer/aria-expanded hover.
                  "cursor-text hover:bg-background hover:text-foreground aria-expanded:bg-background aria-expanded:text-foreground",
              )}
            >
              {selected.length === 0 ? (
                <>
                  <Filter className="size-3.5" />
                  Filter by Tag
                </>
              ) : (
                selected.map((t) => (
                  <Badge
                    key={t.id}
                    variant="secondary"
                    className="gap-1 rounded-sm py-0 pr-0.5 pl-1.5"
                  >
                    {t.name}
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove Filter ${t.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(t.id);
                      }}
                      className="rounded p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </span>
                  </Badge>
                ))
              )}
            </Button>
          }
        />
        <PopoverContent className="w-48 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>No tags.</CommandEmpty>
              <CommandGroup>
                {visibleTags.map((t) => {
                  const checked = selectedIds.includes(t.id);
                  return (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      data-checked={checked ? "true" : undefined}
                      onSelect={() => toggle(t.id)}
                    >
                      <span className="truncate">{t.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedIds.length > 1 ? (
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[mode]}
          onValueChange={(v) => {
            // base-ui ToggleGroup is multi-select; treat the most recently
            // pressed value as the new (single) mode, ignore deselects.
            const next = v[v.length - 1];
            if (next === "and" || next === "or") update({ mode: next });
          }}
        >
          <ToggleGroupItem value="and" aria-label="Match all selected tags">
            Match all
          </ToggleGroupItem>
          <ToggleGroupItem value="or" aria-label="Match any selected tag">
            Match any
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      {selectedIds.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      ) : null}
    </>
  );
}
