"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/modules/shell/confirm-delete-dialog";
import { RenameDialog } from "@/modules/shell/rename-dialog";
import { deleteTag, renameTag } from "./server";

export function TagHeaderActions({
  tag,
}: {
  tag: { id: string; name: string };
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onRename = async (trimmed: string) => {
    const res = await renameTag(tag.id, trimmed);
    if (res.status === "ok") {
      toast("Tag renamed");
      router.refresh();
    } else {
      toast.error(res.message);
      return false;
    }
  };

  const onDelete = async () => {
    await deleteTag(tag.id);
    toast(`"${tag.name}" deleted`);
    router.push("/library");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Tag actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-fit">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Delete Tag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename tag"
        description="Images tagged with this tag stay assigned."
        initialName={tag.name}
        onRename={onRename}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this tag?"
        description="The tag will be removed from all images. The images themselves are not deleted."
        onConfirm={onDelete}
      />
    </>
  );
}
