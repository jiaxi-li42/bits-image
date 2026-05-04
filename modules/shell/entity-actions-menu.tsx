"use client";

import { useState, type ComponentType } from "react";
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
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { RenameDialog } from "./rename-dialog";

export type EntityActionsExtraItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
  /**
   * If false, the item is hidden (caller-side gating, e.g. max-depth checks).
   */
  enabled?: boolean;
};

export type EntityActionsMenuProps = {
  entity: { id: string; name: string };
  /**
   * Visible entity kind ("folder", "tag", …) — used in default copy / aria
   * labels. The caller can still override copy via `renameDialog`/`deleteDialog`.
   */
  kind: string;
  /**
   * Extra dropdown items (e.g. "Add Subfolder") rendered above Rename/Delete.
   */
  extras?: EntityActionsExtraItem[];
  onRename: (newName: string) => Promise<void | false>;
  onDelete: () => Promise<void>;
  /**
   * Successful rename / delete toast + post-action navigation. The component
   * shows the toast and the caller decides where to route via these.
   */
  renameToast?: string;
  deleteToast?: string;
  /**
   * Optional copy overrides for the rename / delete dialogs.
   */
  renameDescription?: string;
  deleteTitle?: string;
  deleteDescription?: string;
};

/**
 * Shared "More actions" dropdown for sidebar entity headers (folders, tags).
 * Hosts the MoreHorizontal trigger plus the Rename / Delete dialogs that
 * every entity surface needs. Callers wire entity-specific extras (e.g.
 * "Add Subfolder") via the `extras` prop and provide the server actions.
 */
export function EntityActionsMenu({
  entity,
  kind,
  extras,
  onRename,
  onDelete,
  renameToast,
  deleteToast,
  renameDescription,
  deleteTitle,
  deleteDescription,
}: EntityActionsMenuProps) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRename = async (trimmed: string) => {
    const res = await onRename(trimmed);
    if (res === false) return false;
    if (renameToast) toast(renameToast);
    router.refresh();
  };

  const handleDelete = async () => {
    await onDelete();
    if (deleteToast) toast(deleteToast);
  };

  const visibleExtras = (extras ?? []).filter((e) => e.enabled !== false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${kind[0]?.toUpperCase()}${kind.slice(1)} actions`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-fit">
          {visibleExtras.map((item) => (
            <DropdownMenuItem key={item.label} onClick={item.onSelect}>
              <item.icon />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Delete {kind[0]?.toUpperCase()}{kind.slice(1)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Rename ${kind}`}
        description={renameDescription}
        initialName={entity.name}
        onRename={handleRename}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={deleteTitle ?? `Delete this ${kind}?`}
        description={deleteDescription}
        onConfirm={handleDelete}
      />
    </>
  );
}
