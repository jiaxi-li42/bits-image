"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { cn } from "@/lib/utils";
import { checkExistingHashes, ingestFile } from "./server";

/**
 * Compute the SHA-256 of a File using the Web Crypto API. Used as a
 * pre-flight before uploading bytes — if the hash is already in the DB
 * we can skip the upload entirely. Mirrors the server's `sha256(buffer)`
 * (both are byte-level SHA-256 → 64-char hex), so a client hit is also
 * guaranteed to be a server hit.
 */
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function UploadButton({
  folderId,
  tagId,
  variant = "inline",
}: {
  folderId?: string;
  tagId?: string;
  variant?: "inline" | "floating";
} = {}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          variant === "floating" ? (
            <Button
              size="icon"
              aria-label="Upload"
              className={FLOATING_BUTTON_CLASS}
            >
              <Upload />
            </Button>
          ) : (
            <Button size="sm">
              <Upload className="size-4" />
              Upload
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload images</DialogTitle>
          <DialogDescription>
            Duplicates or unsupported formats are skipped automatically.
          </DialogDescription>
        </DialogHeader>
        <UploadDropzone
          onDone={() => setOpen(false)}
          folderId={folderId}
          tagId={tagId}
        />
      </DialogContent>
    </Dialog>
  );
}

type FileStatus =
  | "queued"
  | "hashing"
  | "uploading"
  | "ok"
  | "duplicate"
  | "error";

type Entry = {
  id: string;
  file: File;
  status: FileStatus;
  message?: string;
};

function UploadDropzone({
  onDone,
  folderId,
  tagId,
}: {
  onDone: () => void;
  folderId?: string;
  tagId?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, startTransition] = useTransition();

  const onDrop = useCallback((accepted: File[]) => {
    const added: Entry[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: "queued",
    }));
    setEntries((prev) => [...prev, ...added]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
    },
    multiple: true,
  });

  const start = () => {
    const queued = entries.filter((e) => e.status === "queued");
    if (queued.length === 0) return;
    startTransition(async () => {
      let okCount = 0;
      let dupCount = 0;
      let errCount = 0;

      // Phase 1 — hash all queued files locally in parallel. Web Crypto's
      // SHA-256 is byte-identical to the server's `sha256(buffer)`, so a
      // hash that's already in the DB is guaranteed to match.
      setEntries((prev) =>
        prev.map((e) =>
          e.status === "queued" && queued.some((q) => q.id === e.id)
            ? { ...e, status: "hashing" }
            : e,
        ),
      );
      const hashed: { entry: Entry; hash: string | null }[] = await Promise.all(
        queued.map(async (entry) => {
          try {
            return { entry, hash: await sha256Hex(entry.file) };
          } catch {
            // If hashing fails (e.g. unreadable file), fall through to the
            // server, which will surface a proper error.
            return { entry, hash: null };
          }
        }),
      );

      // Phase 2 — single round-trip to ask the server which of those
      // hashes are already on disk. Folder/tag are passed through so the
      // server can attach existing rows in the same call (otherwise
      // skipping the upload would silently drop those associations).
      let existing: Record<string, string> = {};
      try {
        existing = await checkExistingHashes(
          hashed.map((h) => h.hash).filter((h): h is string => !!h),
          folderId,
          tagId,
        );
      } catch {
        // Server unreachable — fall back to per-file `ingestFile`, which
        // still does the SHA dedup itself. Slower but correct.
      }

      // Phase 3 — for each file, either short-circuit as duplicate or
      // upload through the existing path (which still catches perceptual
      // dupes on the server).
      for (const { entry, hash } of hashed) {
        if (hash && existing[hash]) {
          dupCount++;
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id
                ? { ...e, status: "duplicate", message: "Already in library" }
                : e,
            ),
          );
          continue;
        }

        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, status: "uploading" } : e,
          ),
        );
        const fd = new FormData();
        fd.append("file", entry.file);
        if (folderId) fd.append("folderId", folderId);
        if (tagId) fd.append("tagId", tagId);
        try {
          const res = await ingestFile(fd);
          if (res.status === "ok") {
            okCount++;
            setEntries((prev) =>
              prev.map((e) => (e.id === entry.id ? { ...e, status: "ok" } : e)),
            );
          } else if (res.status === "duplicate") {
            dupCount++;
            setEntries((prev) =>
              prev.map((e) =>
                e.id === entry.id
                  ? { ...e, status: "duplicate", message: "Already in library" }
                  : e,
              ),
            );
          } else {
            errCount++;
            setEntries((prev) =>
              prev.map((e) =>
                e.id === entry.id
                  ? { ...e, status: "error", message: res.message }
                  : e,
              ),
            );
          }
        } catch (err) {
          errCount++;
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id
                ? {
                    ...e,
                    status: "error",
                    message: err instanceof Error ? err.message : "Upload failed",
                  }
                : e,
            ),
          );
        }
      }

      const parts: string[] = [];
      if (okCount) parts.push(`${okCount} uploaded`);
      if (dupCount) parts.push(`${dupCount} duplicate`);
      if (errCount) parts.push(`${errCount} failed`);
      toast(parts.join(" · ") || "No files");

      if (errCount === 0 && dupCount === 0) {
        setTimeout(() => onDone(), 400);
      }
    });
  };

  return (
    <div className="min-w-0 space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
        )}
      >
        <input {...getInputProps()} />
        <ImagePlus className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive
            ? "Drop images here"
            : "Drag images here, or click to choose"}
        </p>
        <p className="text-sm text-muted-foreground">
          JPG, PNG, WebP, AVIF (max 50MB)
        </p>
      </div>

      {entries.length > 0 ? (
        <ul className="min-w-0 max-h-48 overflow-y-auto rounded-md border text-sm">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex min-w-0 items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="min-w-0 flex-1 truncate">
                      {e.file.name}
                    </span>
                  }
                />
                <TooltipContent>{e.file.name}</TooltipContent>
              </Tooltip>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  e.status === "ok" && "text-emerald-600",
                  e.status === "duplicate" && "text-amber-600",
                  e.status === "error" && "text-destructive",
                  (e.status === "uploading" ||
                    e.status === "hashing" ||
                    e.status === "queued") &&
                    "text-muted-foreground",
                )}
              >
                {e.status === "queued" && "queued"}
                {e.status === "hashing" && "checking…"}
                {e.status === "uploading" && "uploading…"}
                {e.status === "ok" && "✓ uploaded"}
                {e.status === "duplicate" && "duplicate"}
                {e.status === "error" && (e.message ?? "failed")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          onClick={start}
          disabled={pending || entries.every((e) => e.status !== "queued")}
        >
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}
