"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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

export function DetailSheet({
  imageId,
  open,
  onOpenChange,
  onUpdated,
}: {
  imageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
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
        onOpenChange(false);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit details</SheetTitle>
          <SheetDescription>Title, description, and source URL.</SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex h-full flex-col gap-4 px-4"
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
                  <p className="text-xs text-destructive">{errors.title.message}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={5} {...register("description")} />
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
            </>
          )}

          <SheetFooter className="mt-auto">
            <Button
              type="submit"
              disabled={loading || pending || !isDirty}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
