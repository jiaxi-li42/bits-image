"use client";

import { useEffect, useState, useTransition } from "react";
import { FolderInput } from "lucide-react";
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
import { listFolders, type FolderNode } from "@/modules/folders";
import { addImagesToFolder } from "./server";
import { useManage } from "./manage-context";

export function MoveToFolderAction() {
  const { selected, count, clear } = useManage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listFolders().then((all) => {
      if (cancelled) return;
      setFolders(all);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? folders.filter((f) => f.path.toLowerCase().includes(trimmed))
    : folders;

  const onPick = (folder: FolderNode) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setOpen(false);
    setQuery("");
    startTransition(async () => {
      await addImagesToFolder(ids, folder.id);
      toast(
        `Added ${ids.length} ${ids.length === 1 ? "photo" : "photos"} to "${folder.path}"`,
      );
      clear();
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
            <FolderInput className="size-4" />
            Move to another folder
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={loading ? "Loading…" : "Search folders…"}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading…" : "No folders."}
            </CommandEmpty>
            {filtered.length > 0 ? (
              <CommandGroup heading="Folders">
                {filtered.map((f) => {
                  const showTree = trimmed.length === 0;
                  return (
                    <CommandItem
                      key={f.id}
                      value={f.path}
                      onSelect={() => onPick(f)}
                      title={f.path}
                    >
                      <span
                        className="flex-1 truncate"
                        style={
                          showTree
                            ? { paddingLeft: `${f.depth * 14}px` }
                            : undefined
                        }
                      >
                        {showTree ? f.name : f.path}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {f.count}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
