"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SwatchBook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { listTags, type TagWithCount } from "@/modules/tags";
import {
  applyTagDiffToImages,
  getTagStatesForImages,
  type TagStateForImages,
} from "./server";
import { useManage } from "./manage-context";

type Tri = "all" | "some" | "none";

function deriveInitial(stat: TagStateForImages | undefined, total: number): Tri {
  if (!stat || stat.count === 0) return "none";
  if (stat.count >= total) return "all";
  return "some";
}

export function EditTagsAction() {
  const { selected, count } = useManage();
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [initial, setInitial] = useState<Map<string, Tri>>(new Map());
  const [current, setCurrent] = useState<Map<string, Tri>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const ids = useMemo(() => Array.from(selected), [selected]);
  const total = ids.length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listTags(), getTagStatesForImages(ids)]).then(
      ([tags, stats]) => {
        if (cancelled) return;
        const byId = new Map(stats.map((s) => [s.id, s]));
        const map = new Map<string, Tri>();
        for (const t of tags) map.set(t.id, deriveInitial(byId.get(t.id), total));
        setAllTags(tags);
        setInitial(map);
        setCurrent(new Map(map));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, ids, total]);

  const cycle = (tagId: string) => {
    setCurrent((prev) => {
      const next = new Map(prev);
      // Tri-state UX: clicking either applies to all (-> "all") or unapplies
      // from all (-> "none"). "some" only exists as the initial mixed state;
      // clicking it flips to "all" first, then "none".
      const cur = next.get(tagId) ?? "none";
      next.set(tagId, cur === "all" ? "none" : "all");
      return next;
    });
  };

  const apply = () => {
    const add: string[] = [];
    const remove: string[] = [];
    for (const [tagId, c] of current) {
      const i = initial.get(tagId) ?? "none";
      if (c === i) continue;
      if (c === "all") add.push(tagId);
      else if (c === "none") remove.push(tagId);
    }
    setOpen(false);
    if (add.length === 0 && remove.length === 0) return;
    const targetIds = ids;
    const targetTotal = total;
    startTransition(async () => {
      await applyTagDiffToImages(targetIds, add, remove);
      toast(
        `Tags updated on ${targetTotal} ${targetTotal === 1 ? "image" : "images"}`,
      );
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={count === 0}
          >
            <SwatchBook className="size-4" />
            Edit Tags
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <Command>
          <CommandInput placeholder="Filter tags…" />
          <CommandList>
            <CommandEmpty>
              {loading
                ? "Loading…"
                : allTags.length === 0
                  ? "No tags yet."
                  : "No matches."}
            </CommandEmpty>
            {allTags.length > 0 ? (
              <CommandGroup>
                {allTags.map((t) => {
                  const state = current.get(t.id) ?? "none";
                  return (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      onSelect={() => cycle(t.id)}
                    >
                      <Checkbox
                        checked={state === "all"}
                        indeterminate={state === "some"}
                        // Visual-only inside the row; the row click drives state.
                        // pointer-events:none lets the click reach the
                        // CommandItem onSelect — base-ui Checkbox would
                        // otherwise swallow the event.
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.count}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
          <Separator />
          <div className="flex items-center justify-end gap-2 p-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={pending || loading}
            >
              {pending ? "Applying…" : "Apply"}
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
