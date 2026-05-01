"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Filter } from "lucide-react";
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
import { useShell } from "@/modules/shell/shell-context";
import { TagChip } from "./tag-chip";

export function TagFilterBar({ excludeTagId }: { excludeTagId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { tags: all } = useShell();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"and" | "or">("and");

  // Filter is session-only. On mount (and whenever the route changes) strip
  // any persisted ?tags / ?mode from the URL and reset local state. Selecting
  // tags during the session still updates the URL via update() — but a hard
  // refresh or fresh navigation always starts clean.
  //
  // Both the URL strip and the state reset must happen here together: a
  // separate URL-sync effect would read the still-stale URL before
  // router.replace lands and re-populate state from the persisted params.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("tags") || sp.has("mode")) {
      sp.delete("tags");
      sp.delete("mode");
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
    setSelectedIds([]);
    setMode("and");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Sync state from URL on browser back/forward only.
  useEffect(() => {
    const sync = () => {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("tags") ?? "";
      setSelectedIds(raw ? raw.split(",").filter(Boolean) : []);
      const m = sp.get("mode");
      setMode(m === "or" ? "or" : "and");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

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
    <div className="flex w-full min-w-0 flex-wrap items-start gap-2 md:w-auto">
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
                // to the centre when the trigger grows. max-w-full so the
                // trigger never extends past its container on small screens.
                "h-auto min-h-7 min-w-[7rem] max-w-full flex-wrap justify-start py-1 md:max-w-xs",
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
                  <TagChip
                    key={t.id}
                    name={t.name}
                    density="compact"
                    onRemove={() => toggle(t.id)}
                    removeAriaLabel={`Remove Filter ${t.name}`}
                  />
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
        <Button variant="ghost" size="sm" onClick={clear} className="ml-auto">
          Clear
        </Button>
      ) : null}
    </div>
  );
}
