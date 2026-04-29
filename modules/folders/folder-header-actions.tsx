"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/modules/shell/confirm-delete-dialog";
import { CreateEntityDialog } from "@/modules/shell/create-entity-dialog";
import { RenameDialog } from "@/modules/shell/rename-dialog";
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onRename = async (trimmed: string) => {
    const res = await renameFolder(folder.id, trimmed);
    if (res.status === "ok") {
      toast("Folder renamed");
      router.refresh();
    } else {
      toast.error(res.message);
      return false;
    }
  };

  const onCreateSub = async (trimmed: string) => {
    const res = await createFolder(trimmed, folder.id, { strict: true });
    if (res.status === "ok") {
      toast("Subfolder created");
      router.push(`/folders/${res.folder.id}`);
    } else {
      toast.error(res.message);
      return false;
    }
  };

  const onDelete = async () => {
    await deleteFolder(folder.id);
    toast("Folder deleted");
    router.push("/library");
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
            <DropdownMenuItem onClick={() => setCreatingSub(true)}>
              <FolderPlus />
              Add Subfolder
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => setRenaming(true)}>
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

      <CreateEntityDialog
        open={creatingSub}
        onOpenChange={setCreatingSub}
        title="New subfolder"
        description={
          <>
            The new folder will live under {folder.name}. Images added to it
            are also assigned to {folder.name}.
          </>
        }
        placeholder="Subfolder name"
        onCreate={onCreateSub}
      />

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename folder"
        description="Images already in this folder stay assigned."
        initialName={folder.name}
        onRename={onRename}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this folder?"
        description="The folder and any subfolders will be removed. Images inside are not deleted."
        onConfirm={onDelete}
      />
    </>
  );
}
