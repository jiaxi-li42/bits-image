"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Filter } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useShell } from "@/modules/shell/shell-context";

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
              // Dashed border signals "click to add filters". Trigger stays
              // a single sm-height row regardless of selection count — chip
              // overflow lives in the inline summary on the right, never
              // wraps the button itself.
              //
              // aria-expanded:* overrides keep the trigger looking like its
              // default (resting) state while the popover is open, instead
              // of darkening to the outline variant's active style.
              className="border-dashed aria-expanded:bg-background aria-expanded:text-foreground dark:aria-expanded:bg-input/30"
            >
              <Filter className="size-3.5" />
              Tag Filter
              {selected.length > 0 ? (
                <>
                  <Separator orientation="vertical" className="mx-1 h-4" />
                  {/* Below lg: just the count, to keep the trigger tight. */}
                  <Badge
                    size="sm"
                    variant="secondary"
                    className="lg:hidden"
                  >
                    {selected.length}
                  </Badge>
                  {/* lg+: inline names up to 2; collapse to a summary
                      badge once the list would push the trigger wide. */}
                  <div className="hidden gap-1 lg:flex">
                    {selected.length > 2 ? (
                      <Badge size="sm" variant="secondary">
                        {selected.length} selected
                      </Badge>
                    ) : (
                      selected.map((t) => (
                        <Badge key={t.id} size="sm" variant="secondary">
                          {t.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </>
              ) : null}
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
