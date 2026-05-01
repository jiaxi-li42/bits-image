"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreateEntityDialog } from "./create-entity-dialog";
import { createFolder } from "@/modules/folders";
import { createTag } from "@/modules/tags";

type CreateEntityValue = {
  openCreateFolder: () => void;
  openCreateTag: () => void;
};

const CreateEntityContext = createContext<CreateEntityValue | null>(null);

/**
 * Renders the New Folder / New Tag dialogs at this level in the tree, so any
 * descendant can trigger them without nesting them inside another Dialog
 * (e.g. the mobile sidebar Sheet — base-ui suppresses nested Dialog
 * backdrops, so a nested create dialog would show no dim/blur on mobile).
 */
export function CreateEntityProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [folderOpen, setFolderOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const onCreateFolder = async (trimmed: string) => {
    const res = await createFolder(trimmed, null, { strict: true });
    if (res.status === "error") {
      toast.error(res.message);
      return false;
    }
    toast("Folder created");
    router.push(`/folders/${res.folder.id}`);
  };

  const onCreateTag = async (trimmed: string) => {
    const res = await createTag(trimmed, { strict: true });
    if (res.status === "error") {
      toast.error(res.message);
      return false;
    }
    toast("Tag created");
    router.push(`/tags/${res.tag.id}`);
  };

  return (
    <CreateEntityContext.Provider
      value={{
        openCreateFolder: () => setFolderOpen(true),
        openCreateTag: () => setTagOpen(true),
      }}
    >
      {children}
      <CreateEntityDialog
        open={folderOpen}
        onOpenChange={setFolderOpen}
        title="New folder"
        description="Folders organise images independently of tags."
        placeholder="Folder name"
        onCreate={onCreateFolder}
      />
      <CreateEntityDialog
        open={tagOpen}
        onOpenChange={setTagOpen}
        title="New tag"
        description="Tags can be assigned to any image from the image details panel."
        placeholder="Tag name"
        onCreate={onCreateTag}
      />
    </CreateEntityContext.Provider>
  );
}

export function useCreateEntity(): CreateEntityValue {
  const ctx = useContext(CreateEntityContext);
  if (!ctx)
    throw new Error("useCreateEntity must be used within <CreateEntityProvider>");
  return ctx;
}
