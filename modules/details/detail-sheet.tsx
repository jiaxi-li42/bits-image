"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, RotateCcw, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import {
  getDownloadUrl,
  hardDeleteImage,
  restoreImage,
  softDeleteImage,
} from "@/modules/actions/server";
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

export type DetailSheetProps = {
  imageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view?: ViewKind;
  onUpdated?: () => void;
  onRemoved?: () => void;
};

export function DetailSheet({
  imageId,
  open,
  onOpenChange,
  view = "library",
  onUpdated,
  onRemoved,
}: DetailSheetProps) {
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
    if (!open) return;
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
  }, [imageId, open, reset]);

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const res = await updateImageMeta(imageId, {
        title: values.title || null,
        description: values.description || null,
        sourceUrl: values.sourceUrl || null,
      });
      if (res.status === "ok") {
        toast("Saved");
        onUpdated?.();
      } else {
        toast.error(res.message);
      }
    });
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
      await softDeleteImage(imageId);
      toast("Moved to Trash");
      onRemoved?.();
      onOpenChange(false);
    });
  };

  const onRestore = () => {
    startTransition(async () => {
      await restoreImage(imageId);
      toast("Restored");
      onRemoved?.();
      onOpenChange(false);
    });
  };

  const onHardDelete = () => {
    startTransition(async () => {
      await hardDeleteImage(imageId);
      toast("Deleted permanently");
      setConfirmPurge(false);
      onRemoved?.();
      onOpenChange(false);
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit details</SheetTitle>
          <SheetDescription>
            Title, description, source URL, tags, and folders.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex h-full flex-col gap-4 overflow-y-auto px-4 pb-4"
        >
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" {...register("title")} />
                {errors.title ? (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={5}
                  {...register("description")}
                />
                {errors.description ? (
                  <p className="text-xs text-destructive">
                    {errors.description.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourceUrl">Source URL</Label>
                <Input
                  id="sourceUrl"
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
                <Label>Tags</Label>
                <TagPicker imageId={imageId} />
              </div>
              <div className="grid gap-2">
                <Label>Folders</Label>
                <FolderPicker imageId={imageId} />
              </div>

              <Separator className="my-2" />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                  disabled={pending}
                >
                  <Download className="size-4" />
                  Download
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
                      Delete permanently
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
                    Move to Trash
                  </Button>
                )}
              </div>
            </>
          )}

          <SheetFooter className="mt-auto">
            <Button type="submit" disabled={loading || pending || !isDirty}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Close
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

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
            <AlertDialogAction onClick={onHardDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
