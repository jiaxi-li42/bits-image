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
            <Button variant="outline" size="sm" className="h-7 gap-1.5">
              <Filter className="size-3.5" />
              Filter by tag
              {selectedIds.length > 0 ? (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                  {selectedIds.length}
                </span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent className="w-64 p-0" align="start">
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
                      data-checked={checked ? "true" : "false"}
                      onSelect={() => toggle(t.id)}
                    >
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.count}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.map((t) => (
        <Badge key={t.id} variant="secondary" className="pr-1">
          {t.name}
          <button
            type="button"
            onClick={() => toggle(t.id)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            aria-label={`Remove filter ${t.name}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      {selectedIds.length > 1 ? (
        <div className="inline-flex h-7 overflow-hidden rounded-md border">
          <Button
            type="button"
            variant={mode === "and" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-none px-2 text-xs"
            onClick={() => update({ mode: "and" })}
          >
            All
          </Button>
          <Button
            type="button"
            variant={mode === "or" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-none px-2 text-xs"
            onClick={() => update({ mode: "or" })}
          >
            Any
          </Button>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={clear}
        >
          Clear
        </Button>
      ) : null}
    </>
  );
}
