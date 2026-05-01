"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { CreateEntityDialog } from "@/modules/shell/create-entity-dialog";
import { EntityActionsMenu } from "@/modules/shell/entity-actions-menu";
import { createFolder, deleteFolder, renameFolder } from "./server";
import { MAX_FOLDER_DEPTH } from "./constants";

export function FolderHeaderActions({
  folder,
  depth,
}: {
  folder: { id: string; name: string };
  depth: number;
}) {
  const router = useRouter();
  const [creatingSub, setCreatingSub] = useState(false);

  const onRename = async (trimmed: string) => {
    const res = await renameFolder(folder.id, trimmed);
    if (res.status === "error") {
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
    router.push("/library");
  };

  return (
    <>
      <EntityActionsMenu
        entity={folder}
        kind="folder"
        extras={[
          {
            icon: FolderPlus,
            label: "Add Subfolder",
            onSelect: () => setCreatingSub(true),
            enabled: depth < MAX_FOLDER_DEPTH,
          },
        ]}
        onRename={onRename}
        onDelete={onDelete}
        renameToast="Folder renamed"
        deleteToast="Folder deleted"
        deleteDescription="The folder and any subfolders will be removed. Images inside are not deleted."
      />

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
    </>
  );
}
