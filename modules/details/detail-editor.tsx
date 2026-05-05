"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/modules/shell/confirm-delete-dialog";
import { TagPicker } from "@/modules/tags";
import { FolderPicker } from "@/modules/folders";
import { getDownloadUrl } from "@/modules/actions/server";
import {
  hardDeleteImages,
  restoreImages,
  softDeleteImages,
} from "@/modules/manage/server";
import type { ViewKind } from "@/modules/views";
import { getImageMeta, updateImageMeta } from "./server";

const FormSchema = z.object({
  title: z.string().trim().max(200),
  description: z.string().trim().max(2000),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
      message: "Must be a valid URL",
    }),
});

type FormValues = z.infer<typeof FormSchema>;

export type DetailEditorProps = {
  imageId: string;
  view?: ViewKind;
  className?: string;
  onUpdated?: () => void;
  onRemoved?: () => void;
  onClose?: () => void;
};

export function DetailEditor({
  imageId,
  view = "library",
  className,
  onUpdated,
  onRemoved,
  onClose,
}: DetailEditorProps) {
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [confirmPurge, setConfirmPurge] = useState(false);
  const isTrash = view === "trash";
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { title: "", description: "", sourceUrl: "" },
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getImageMeta(imageId).then((meta) => {
      if (cancelled) return;
      if (meta) {
        reset({
          title: meta.title ?? "",
          description: meta.description ?? "",
          sourceUrl: meta.sourceUrl ?? "",
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId, reset]);

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const res = await updateImageMeta(imageId, {
        title: values.title || null,
        description: values.description || null,
        sourceUrl: values.sourceUrl || null,
      });
      if (res.status === "ok") {
        toast("Edits saved");
        onUpdated?.();
        // Re-baseline so the next blur with no further edits is a no-op.
        reset(values, { keepValues: true });
      } else {
        toast.error(res.message);
      }
    });
  };

  // Auto-save: when a text field blurs and the form is dirty + valid, persist.
  const autoSaveOnBlur: React.FocusEventHandler<HTMLFormElement> = (e) => {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && e.currentTarget.contains(next)) return; // moved within form
    if (!isDirty) return;
    handleSubmit(onSubmit)();
  };

  const onDownload = async () => {
    const url = await getDownloadUrl(imageId);
    if (!url) {
      toast.error("Could not get download URL");
      return;
    }
    // Open the signed R2 URL in a new tab so the current details page
    // stays put. The browser-native `download` attribute is ignored on
    // cross-origin URLs, which (without target=_blank) causes mobile
    // Safari to navigate the current tab to the image and lose the
    // viewer state.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onSoftDelete = () => {
    startTransition(async () => {
      await softDeleteImages([imageId]);
      toast("Moved to Trash");
      onRemoved?.();
    });
  };

  const onRestore = () => {
    startTransition(async () => {
      await restoreImages([imageId]);
      toast("Restored");
      onRemoved?.();
    });
  };

  const onHardDelete = async () => {
    await hardDeleteImages([imageId]);
    toast("Deleted permanently");
    onRemoved?.();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onBlur={autoSaveOnBlur}
      className={`flex flex-col md:h-full ${className ?? ""}`}
    >
      <header className="hidden items-start justify-between gap-3 px-4 pt-4 pb-8 md:flex">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Edit details</h2>
          <p className="hidden text-sm text-muted-foreground md:block">
            Edit your image details here. Changes will be saved automatically.
          </p>
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 hidden md:inline-flex"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="px-4 pt-4 pb-4 md:flex-1 md:overflow-y-auto md:pt-0 md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
        {loading ? (
          <div className="space-y-8">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          // In trash, every field is read-only. `disabled` covers form
          // controls; the wrapping `pointer-events-none`+opacity suppresses
          // and visually fades the picker triggers and chip-remove buttons,
          // which a real user click would otherwise still feel responsive
          // (the click is spec-suppressed by fieldset, but cursor/hover
          // remained interactive without this).
          <fieldset
            disabled={isTrash}
            className={`space-y-8 ${isTrash ? "[&_button]:pointer-events-none [&_button]:opacity-50" : ""}`}
          >
            <div className="grid gap-2">
              <Label htmlFor={`title-${imageId}`}>Name</Label>
              <Input id={`title-${imageId}`} {...register("title")} />
              {errors.title ? (
                <p className="text-xs text-destructive">
                  {errors.title.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`description-${imageId}`}>Description</Label>
              <Textarea
                id={`description-${imageId}`}
                rows={5}
                placeholder="Enter your notes"
                {...register("description")}
              />
              {errors.description ? (
                <p className="text-xs text-destructive">
                  {errors.description.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`sourceUrl-${imageId}`}>Source URL</Label>
              <Input
                id={`sourceUrl-${imageId}`}
                placeholder="https://…"
                {...register("sourceUrl")}
              />
              {errors.sourceUrl ? (
                <p className="text-xs text-destructive">
                  {errors.sourceUrl.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Assigned tags</Label>
              <TagPicker imageId={imageId} />
            </div>
            <div className="grid gap-2">
              <Label>Assigned folders</Label>
              <FolderPicker imageId={imageId} />
            </div>
          </fieldset>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-border/50 p-4 md:flex-row md:items-center">
        {isTrash ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRestore}
              disabled={pending}
              className="w-full md:w-auto"
            >
              <RotateCcw className="size-4" />
              Restore
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmPurge(true)}
              disabled={pending}
              className="w-full text-destructive hover:text-destructive md:w-auto"
            >
              <Trash2 className="size-4" />
              Delete Permanently
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={pending}
              className="w-full md:w-auto"
            >
              <Download className="size-4" />
              Download the Original
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSoftDelete}
              disabled={pending}
              className="w-full text-destructive hover:text-destructive md:w-auto"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </>
        )}
      </footer>

      <ConfirmDeleteDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="Delete permanently?"
        description="This removes the image from storage. It cannot be restored."
        onConfirm={onHardDelete}
      />
    </form>
  );
}
