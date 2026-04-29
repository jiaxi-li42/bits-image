"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Folder as FolderIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FolderListPicker } from "./folder-list-picker";
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
  const [assigned, setAssigned] = useState<Folder[]>([]);
  const [all, setAll] = useState<FolderNode[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFoldersForImage(imageId), listFolders()]).then(
      ([forImage, allFolders]) => {
        if (cancelled) return;
        setAssigned(forImage);
        setAll(allFolders);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  const assignedIds = useMemo(
    () => new Set(assigned.map((f) => f.id)),
    [assigned],
  );
  const allById = useMemo(() => new Map(all.map((f) => [f.id, f])), [all]);
  const pathById = useMemo(
    () => new Map(all.map((f) => [f.id, f.path])),
    [all],
  );

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

  const onPick = (folder: FolderNode) => {
    const isAssigned = assignedIds.has(folder.id);
    if (isAssigned) {
      // Remove this folder + every assigned descendant.
      const idsToRemove = new Set<string>([folder.id]);
      for (const d of descendantsOf(folder.id)) {
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
    } else {
      // Add this folder + every ancestor (server cascades the same way).
      const additions = [folder, ...ancestorsOf(folder.id)].filter(
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
    }
  };

  const onCreate = (name: string) => {
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
          <FolderListPicker
            assignedIds={assignedIds}
            onPick={onPick}
            onCreate={onCreate}
          />
        </PopoverContent>
      </Popover>
      {assigned.map((f) => {
        const path = pathById.get(f.id) ?? f.name;
        return (
          <Badge
            key={f.id}
            variant="ghost"
            size="md"
            title={path}
            // Read-only label, not interactive — neutralise the ghost hover.
            className="hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
          >
            <FolderIcon className="size-3.5" />
            {f.name}
          </Badge>
        );
      })}
    </div>
  );
}
