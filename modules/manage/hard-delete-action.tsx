"use client";

import { Trash } from "lucide-react";
import { ConfirmAction } from "./confirm-action";
import { useManage } from "./manage-context";
import { hardDeleteImages } from "./server";

export function HardDeleteAction({
  variant = "inline",
}: {
  variant?: "inline" | "floating";
}) {
  const { count } = useManage();
  return (
    <ConfirmAction
      variant={variant}
      destructive
      triggerLabel="Delete Permanently"
      triggerIcon={<Trash className={variant === "floating" ? undefined : "size-4"} />}
      triggerClassName={
        variant === "floating" ? undefined : "text-destructive hover:text-destructive"
      }
      title="Delete permanently?"
      description={
        <>
          {count} {count === 1 ? "image" : "images"} will be removed from
          storage. This cannot be undone.
        </>
      }
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      successToast={(n) =>
        `${n} ${n === 1 ? "image" : "images"} deleted permanently`
      }
      run={async (ids) => {
        const res = await hardDeleteImages(ids);
        return { count: res.removed };
      }}
    />
  );
}
