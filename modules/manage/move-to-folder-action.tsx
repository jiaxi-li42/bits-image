"use client";

import { useEffect, useState, useTransition } from "react";
import { FolderPlus } from "lucide-react";
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
import { addImagesToFolder, moveImagesToFolder } from "./server";
import { useManage } from "./manage-context";

export function MoveToFolderAction({
  currentFolderId,
}: {
  currentFolderId?: string;
}) {
  const { selected, count } = useManage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const isMove = Boolean(currentFolderId);
  const label = isMove ? "Move to Folder" : "Add to Folder";

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
  const visible = currentFolderId
    ? folders.filter((f) => f.id !== currentFolderId)
    : folders;
  const filtered = trimmed
    ? visible.filter((f) => f.path.toLowerCase().includes(trimmed))
    : visible;

  const onPick = (folder: FolderNode) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setOpen(false);
    setQuery("");
    startTransition(async () => {
      if (currentFolderId) {
        await moveImagesToFolder(ids, currentFolderId, folder.id);
        toast(
          `Moved ${ids.length} ${ids.length === 1 ? "image" : "images"} to "${folder.path}"`,
        );
      } else {
        const { added, alreadyIn } = await addImagesToFolder(ids, folder.id);
        if (added === 0) {
          toast(
            alreadyIn === 1
              ? `Image already in "${folder.path}"`
              : `All ${alreadyIn} images already in "${folder.path}"`,
          );
        } else if (alreadyIn > 0) {
          toast(
            `Added ${added} ${added === 1 ? "image" : "images"} to "${folder.path}" (${alreadyIn} already there)`,
          );
        } else {
          toast(
            `Added ${added} ${added === 1 ? "image" : "images"} to "${folder.path}"`,
          );
        }
      }
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
            <FolderPlus className="size-4" />
            {label}
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
