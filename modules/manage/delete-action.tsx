"use client";

import { Trash2 } from "lucide-react";
import { ConfirmAction } from "./confirm-action";
import { useManage } from "./manage-context";
import { softDeleteImages } from "./server";

export function DeleteAction() {
  const { count } = useManage();
  return (
    <ConfirmAction
      triggerLabel="Delete"
      triggerIcon={<Trash2 className="size-4" />}
      triggerClassName="text-destructive hover:text-destructive"
      title="Move to Trash?"
      description={
        <>
          {count} {count === 1 ? "image" : "images"} will be moved to Trash.
          They can be restored from there for up to 30 days.
        </>
      }
      confirmLabel="Move to Trash"
      pendingLabel="Moving…"
      successToast={(n) =>
        `Moved ${n} ${n === 1 ? "image" : "images"} to Trash`
      }
      run={async (ids) => {
        const res = await softDeleteImages(ids);
        return { count: res.removed };
      }}
    />
  );
}
