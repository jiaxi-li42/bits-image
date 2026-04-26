"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { listTags, type TagWithCount } from "@/modules/tags";
import {
  applyTagDiffToImages,
  getTagStatesForImages,
  type TagStateForImages,
} from "./server";
import { useManage } from "./manage-context";

type Tri = "all" | "some" | "none";

function deriveInitial(tag: TagWithCount, stat: TagStateForImages | undefined, total: number): Tri {
  void tag;
  if (!stat || stat.count === 0) return "none";
  if (stat.count >= total) return "all";
  return "some";
}

export function EditTagsAction() {
  const { selected, count, clear } = useManage();
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [initial, setInitial] = useState<Map<string, Tri>>(new Map());
  const [current, setCurrent] = useState<Map<string, Tri>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");

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
        for (const t of tags) map.set(t.id, deriveInitial(t, byId.get(t.id), total));
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
      // For tri-state UX: clicking either applies to all (-> "all") or
      // unapplies from all (-> "none"). "some" only exists as the initial
      // mixed state — clicking flips it to "all" first; clicking again
      // moves to "none".
      const cur = next.get(tagId) ?? "none";
      if (cur === "none") next.set(tagId, "all");
      else if (cur === "all") next.set(tagId, "none");
      else next.set(tagId, "all");
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
      else if (c === "none") {
        // From "all" -> "none" or "some" -> "none": remove from all selected.
        remove.push(tagId);
      }
    }
    if (add.length === 0 && remove.length === 0) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await applyTagDiffToImages(ids, add, remove);
      toast(
        `Tags updated on ${total} ${total === 1 ? "photo" : "photos"}`,
      );
      setOpen(false);
      clear();
    });
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, filter]);

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
            <Tags className="size-4" />
            Edit tags
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <div className="border-b p-2">
          <Input
            placeholder="Filter tags…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {loading ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {allTags.length === 0 ? "No tags yet." : "No matches."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((t) => {
                const state = current.get(t.id) ?? "none";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => cycle(t.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        checked={state === "all"}
                        indeterminate={state === "some"}
                        // Visual-only inside the row button; the row click drives the state.
                        tabIndex={-1}
                        onClick={(e) => e.preventDefault()}
                      />
                      <span className="flex-1 truncate text-left">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-2">
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
      </PopoverContent>
    </Popover>
  );
}
