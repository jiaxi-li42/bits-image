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

  // Save on Cmd/Ctrl+Enter as well.
  const onKeyDown: React.KeyboardEventHandler<HTMLFormElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (isDirty) handleSubmit(onSubmit)();
    }
  };

  const onDownload = async () => {
    const url = await getDownloadUrl(imageId);
    if (!url) {
      toast.error("Could not get download URL");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
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

  const onHardDelete = () => {
    startTransition(async () => {
      await hardDeleteImages([imageId]);
      toast("Deleted permanently");
      setConfirmPurge(false);
      onRemoved?.();
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onBlur={autoSaveOnBlur}
      onKeyDown={onKeyDown}
      className={`flex h-full flex-col ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-8">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Edit details</h2>
          <p className="text-sm text-muted-foreground">
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
            className="-mt-1 -mr-1"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading ? (
          <div className="space-y-8">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="space-y-8">
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
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border/50 p-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={pending}
        >
          <Download className="size-4" />
          Download the Original
        </Button>
        {isTrash ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRestore}
              disabled={pending}
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
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete Permanently
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSoftDelete}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        )}
        {pending ? (
          <span className="ml-auto text-xs text-muted-foreground">Saving…</span>
        ) : null}
      </footer>

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the image from storage. It cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onHardDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
