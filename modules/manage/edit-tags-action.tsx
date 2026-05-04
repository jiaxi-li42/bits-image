"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { useShell } from "@/modules/shell/shell-context";
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

export function EditTagsAction({
  variant = "inline",
}: {
  variant?: "inline" | "floating";
}) {
  const { selected, count } = useManage();
  const { tags: allTags } = useShell();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<Map<string, Tri>>(new Map());
  const [current, setCurrent] = useState<Map<string, Tri>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const ids = useMemo(() => Array.from(selected), [selected]);
  const total = ids.length;
  const idsSig = useMemo(() => [...ids].sort().join(","), [ids]);
  // Last selection signature whose data we've already loaded — re-opening
  // the popover with the same selection re-uses the in-memory snapshot
  // instead of refetching tags + per-image state.
  const cachedSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (cachedSigRef.current === idsSig) {
      // Cache hit — reset any uncommitted tri-state edits from a previous
      // open back to the loaded baseline so Cancel-then-reopen behaves
      // like a fresh open.
      setCurrent(new Map(initial));
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTagStatesForImages(ids).then((stats) => {
      if (cancelled) return;
      const byId = new Map(stats.map((s) => [s.id, s]));
      const map = new Map<string, Tri>();
      for (const t of allTags) {
        map.set(t.id, deriveInitial(byId.get(t.id), total));
      }
      setInitial(map);
      setCurrent(new Map(map));
      setLoading(false);
      cachedSigRef.current = idsSig;
    });
    return () => {
      cancelled = true;
    };
    // allTags is intentionally not in deps — if a tag is added globally
    // while the popover is open we don't refetch state; the user can
    // reopen the popover to pick up the new tag. listing it as a dep would
    // refetch on every shell revalidation (e.g. unrelated folder edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids, total, idsSig]);

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

    // Keep the in-memory cache in sync with what we just sent to the
    // server. Without this update, `cachedSigRef.current === idsSig`
    // still matches on reopen, so the open-effect would `setCurrent
    // (new Map(initial))` — restoring pre-apply values and showing
    // wrong checkbox states until the user reselects different images.
    const nextInitial = new Map(initial);
    for (const id of add) nextInitial.set(id, "all");
    for (const id of remove) nextInitial.set(id, "none");
    setInitial(nextInitial);
    setCurrent(nextInitial);

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
          variant === "floating" ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={count === 0}
              aria-label="Edit Tags"
              className={FLOATING_BUTTON_CLASS}
            >
              <SwatchBook />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={count === 0}
            >
              <SwatchBook className="size-4" />
              Edit Tags
            </Button>
          )
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
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
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
