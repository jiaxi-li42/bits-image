"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EntityActionsMenu } from "@/modules/shell/entity-actions-menu";
import { deleteTag, renameTag } from "./server";

export function TagHeaderActions({
  tag,
}: {
  tag: { id: string; name: string };
}) {
  const router = useRouter();

  const onRename = async (trimmed: string) => {
    const res = await renameTag(tag.id, trimmed);
    if (res.status === "error") {
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
    <EntityActionsMenu
      entity={tag}
      kind="tag"
      onRename={onRename}
      onDelete={onDelete}
      renameToast="Tag renamed"
      renameDescription="Images tagged with this tag stay assigned."
      deleteDescription="The tag will be removed from all images. The images themselves are not deleted."
    />
  );
}
