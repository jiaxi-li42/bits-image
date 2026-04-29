"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createFolder, deleteFolder, renameFolder } from "./server";
import { MAX_FOLDER_DEPTH } from "./constants";

export function FolderHeaderActions({
  folder,
  depth,
}: {
  folder: { id: string; name: string };
  depth: number;
}) {
  const canAddSubfolder = depth < MAX_FOLDER_DEPTH;
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [creatingSub, setCreatingSub] = useState(false);
  const [name, setName] = useState(folder.name);
  const [subName, setSubName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!creatingSub) setSubName("");
  }, [creatingSub]);
  useEffect(() => {
    if (!renaming) setName(folder.name);
  }, [renaming, folder.name]);

  const onRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === folder.name) {
      setRenaming(false);
      return;
    }
    startTransition(async () => {
      const res = await renameFolder(folder.id, trimmed);
      if (res.status === "ok") {
        toast("Folder renamed");
        setRenaming(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const onCreateSub = () => {
    const trimmed = subName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createFolder(trimmed, folder.id, { strict: true });
      if (res.status === "ok") {
        toast("Subfolder created");
        setSubName("");
        setCreatingSub(false);
        router.push(`/folders/${res.folder.id}`);
      } else {
        toast.error(res.message);
      }
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      await deleteFolder(folder.id);
      toast("Folder deleted");
      router.push("/library");
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Folder actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-fit">
          {canAddSubfolder ? (
            <DropdownMenuItem
              onClick={() => {
                setSubName("");
                setCreatingSub(true);
              }}
            >
              <FolderPlus />
              Add Subfolder
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              setName(folder.name);
              setRenaming(true);
            }}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Delete Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creatingSub} onOpenChange={setCreatingSub}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New subfolder</DialogTitle>
            <DialogDescription>
              The new folder will live under {folder.name}. Images added to it
              are also assigned to {folder.name}.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Subfolder name"
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCreateSub();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreatingSub(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={onCreateSub} disabled={pending || !subName.trim()}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Images already in this folder stay assigned.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenaming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={onRename} disabled={pending || !name.trim()}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this folder?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder and any subfolders will be removed. Images inside are
              not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
