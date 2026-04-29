"use client";

import { useEffect, useState, useTransition } from "react";
import { Folder as FolderIcon, Plus } from "lucide-react";
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
import {
  addImageToFolder,
  addImageToFolderByName,
  listFolders,
  listFoldersForImage,
  removeImageFromFolder,
  type Folder,
  type FolderNode,
} from "./server";

export function FolderPicker({ imageId }: { imageId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assigned, setAssigned] = useState<Folder[]>([]);
  const [all, setAll] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFoldersForImage(imageId), listFolders()]).then(
      ([forImage, allFolders]) => {
        if (cancelled) return;
        setAssigned(forImage);
        setAll(allFolders);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  const assignedIds = new Set(assigned.map((f) => f.id));
  const allById = new Map(all.map((f) => [f.id, f]));
  const pathById = new Map(all.map((f) => [f.id, f.path]));
  const trimmed = query.trim();

  // When a query is active we hide the tree and show flat-path matches.
  // Otherwise we show every folder in tree order (sorted by listFolders).
  const filtered = trimmed
    ? all.filter((f) =>
        f.path.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : all;
  const exact = filtered.find((f) => f.path === trimmed || f.name === trimmed);
  const canCreate = trimmed.length > 0 && !exact;

  function ancestorsOf(folderId: string): FolderNode[] {
    const out: FolderNode[] = [];
    let current = allById.get(folderId);
    while (current && current.parentId) {
      const parent = allById.get(current.parentId);
      if (!parent) break;
      out.push(parent);
      current = parent;
    }
    return out;
  }

  function descendantsOf(folderId: string): FolderNode[] {
    const out: FolderNode[] = [];
    const stack = [folderId];
    while (stack.length) {
      const parentId = stack.pop()!;
      for (const f of all) {
        if (f.parentId === parentId) {
          out.push(f);
          stack.push(f.id);
        }
      }
    }
    return out;
  }

  const onAdd = (folder: FolderNode | Folder) => {
    if (assignedIds.has(folder.id)) return;
    // Optimistically tick the chosen folder + every ancestor — the server
    // does the same on persistence (addImageToFolder cascades up).
    const ancestors = ancestorsOf(folder.id);
    const additions = [folder, ...ancestors].filter(
      (f) => !assignedIds.has(f.id),
    );
    setAssigned((prev) =>
      [...prev, ...additions].sort((a, b) => a.name.localeCompare(b.name)),
    );
    startTransition(async () => {
      await addImageToFolder(imageId, folder.id);
      const fresh = await listFoldersForImage(imageId);
      setAssigned(fresh);
    });
  };

  const onRemove = (folder: Folder) => {
    // Cascade down: pulling a parent off pulls every assigned descendant too.
    const descendants = descendantsOf(folder.id);
    const idsToRemove = new Set<string>([folder.id]);
    for (const d of descendants) {
      if (assignedIds.has(d.id)) idsToRemove.add(d.id);
    }
    setAssigned((prev) => prev.filter((f) => !idsToRemove.has(f.id)));
    startTransition(async () => {
      await Promise.all(
        Array.from(idsToRemove).map((id) =>
          removeImageFromFolder(imageId, id),
        ),
      );
      const fresh = await listFoldersForImage(imageId);
      setAssigned(fresh);
    });
  };

  const onCreate = () => {
    const name = trimmed;
    if (!name) return;
    setQuery("");
    startTransition(async () => {
      const res = await addImageToFolderByName(imageId, name);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      const [forImage, allFolders] = await Promise.all([
        listFoldersForImage(imageId),
        listFolders(),
      ]);
      setAssigned(forImage);
      setAll(allFolders);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-3.5" />
              Select Folder
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
              <CommandEmpty>{loading ? "Loading…" : "No folders."}</CommandEmpty>
              {filtered.length > 0 ? (
                <CommandGroup heading="Folders">
                  {filtered.map((f) => {
                    const isAssigned = assignedIds.has(f.id);
                    // Indent only when showing the full tree (no search).
                    const showTree = trimmed.length === 0;
                    const label = showTree ? f.name : f.path;
                    return (
                      <CommandItem
                        key={f.id}
                        value={f.path}
                        data-checked={isAssigned ? "true" : "false"}
                        onSelect={() => (isAssigned ? onRemove(f) : onAdd(f))}
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
                          {label}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {f.count}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {canCreate ? (
                <CommandGroup>
                  <CommandItem
                    value={`__create_${trimmed}`}
                    onSelect={onCreate}
                  >
                    <Plus className="size-4" />
                    Create &quot;{trimmed}&quot;
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {assigned.map((f) => {
        const path = pathById.get(f.id) ?? f.name;
        return (
          <span
            key={f.id}
            title={path}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[0.8rem] font-medium text-foreground"
          >
            <FolderIcon className="size-3.5" />
            {f.name}
          </span>
        );
      })}
    </div>
  );
}
