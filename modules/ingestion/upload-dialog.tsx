"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { Upload, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  OverlayScrollArea,
  type OverlayScrollAreaRef,
} from "@/components/ui/overlay-scrollbars";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FLOATING_BUTTON_CLASS } from "@/modules/shell/mobile-floating-actions";
import { cn } from "@/lib/utils";
import { checkExistingHashes, ingestFile } from "./server";

// Single source of truth for what counts as an uploadable image. Used by
// the in-dialog react-dropzone (which needs the MIME→extension map) and
// by the page-level `UploadDropTarget` (which only needs the MIME set
// for filtering `DataTransfer.files`).
const ACCEPT_MAP: Accept = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
};
const ACCEPTED_MIME_TYPES = new Set(Object.keys(ACCEPT_MAP));

function filterImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => ACCEPTED_MIME_TYPES.has(f.type));
}

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

/**
 * The upload dialog is owned by `UploadDropTarget` (one instance per
 * page). `UploadButton` opens it through this context — that way the
 * button click and a window-level file drag both end up driving the
 * same dialog, so dragging into the page while it's already open
 * doesn't stack a second copy on top.
 */
const UploadDialogContext = createContext<(() => void) | null>(null);

export function UploadButton({
  variant = "inline",
}: {
  variant?: "inline" | "floating";
} = {}) {
  // Falls back to `disabled` if rendered outside `UploadDropTarget` —
  // better than a silent dead click.
  const openDialog = useContext(UploadDialogContext);
  if (variant === "floating") {
    return (
      <Button
        size="icon"
        aria-label="Upload"
        className={FLOATING_BUTTON_CLASS}
        onClick={openDialog ?? undefined}
        disabled={!openDialog}
      >
        <Upload />
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      onClick={openDialog ?? undefined}
      disabled={!openDialog}
    >
      <Upload className="size-4" />
      Upload
    </Button>
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
  initialFiles,
  onRegister,
}: {
  onDone: () => void;
  folderId?: string;
  tagId?: string;
  /** Files to seed the queue with on mount (e.g. dropped onto the page).
   * Only used by the initializer — later changes are ignored because the
   * dialog re-mounts on each open, so a fresh prop arrives with a fresh
   * component instance. */
  initialFiles?: File[];
  /** Lets a parent push files into the queue imperatively after mount,
   * used by `UploadDropTarget` to route window-level drops (drops that
   * landed outside the visible dropzone box) into the same queue. */
  onRegister?: (addFiles: ((files: File[]) => void) | null) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    (initialFiles ?? []).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: "queued",
    })),
  );
  const [pending, startTransition] = useTransition();

  const addFiles = useCallback((files: File[]) => {
    const added: Entry[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: "queued",
    }));
    setEntries((prev) => [...prev, ...added]);
  }, []);

  // Expose the imperative add fn to the parent for the lifetime of this
  // mount, then null it on unmount so the parent doesn't try to push
  // into a stale closure.
  useEffect(() => {
    onRegister?.(addFiles);
    return () => onRegister?.(null);
  }, [addFiles, onRegister]);

  // Auto-scroll policy:
  //   - First fill of the queue (0 → N, however the files arrive — via
  //     `addFiles` after a drop, or via `initialFiles` seeded on mount):
  //     stay at the top so the user can scan from the start of their
  //     batch.
  //   - Every later drop (N → N+M) pins the list to the bottom so the
  //     newly added files are visible.
  //
  // We watch the *length* (not the entries reference) so status
  // transitions during upload — queued → hashing → uploading → ok —
  // don't re-trigger a scroll on every status update.
  //
  // Scroll target is the OS viewport (not the `<ul>` child) — OS
  // inserts its own scroll container between the host and the children,
  // so the ul's own scrollTop is meaningless here.
  const osRef = useRef<OverlayScrollAreaRef | null>(null);
  // Initial 0 — seed path also reads as a "first fill" (prev === 0).
  const prevLengthRef = useRef(0);
  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = entries.length;
    if (prev === 0) return; // first fill — leave the list at the top
    if (entries.length <= prev) return; // status update or no growth
    const viewport = osRef.current?.osInstance()?.elements().viewport;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [entries.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addFiles,
    accept: ACCEPT_MAP,
    multiple: true,
    // Keeps drag events from bubbling out of the box — `UploadDropTarget`'s
    // window-level handler then only fires for drops landing *outside*
    // the box, so the two paths don't double-add the same files.
    noDragEventsBubbling: true,
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
            : "Drag images anywhere, or click to choose"}
        </p>
        <p className="text-sm text-muted-foreground">
          JPG, PNG, WebP, AVIF (max 50MB)
        </p>
      </div>

      {entries.length > 0 ? (
        <OverlayScrollArea
          ref={osRef}
          className="min-w-0 max-h-48 rounded-md border text-sm"
        >
          <ul>
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
              {e.status === "error" ? (
                // Error messages can be arbitrarily long ("Unsupported image
                // format: heif. Allowed: JPEG, …"). `shrink-0` would push the
                // span past the dialog edge and force a horizontal page
                // scroll, so we let it truncate and surface the full text via
                // tooltip instead.
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="min-w-0 max-w-[50%] truncate text-xs text-destructive">
                        {e.message ?? "failed"}
                      </span>
                    }
                  />
                  <TooltipContent>{e.message ?? "failed"}</TooltipContent>
                </Tooltip>
              ) : (
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    e.status === "ok" && "text-emerald-600",
                    e.status === "duplicate" && "text-amber-600",
                    (e.status === "uploading" ||
                      e.status === "hashing" ||
                      e.status === "queued") &&
                      "text-muted-foreground",
                  )}
                >
                  {e.status === "queued" && "queued"}
                  {e.status === "hashing" && "checking…"}
                  {e.status === "uploading" && "uploading…"}
                  {e.status === "ok" && "uploaded"}
                  {e.status === "duplicate" && "duplicate"}
                </span>
              )}
            </li>
          ))}
          </ul>
        </OverlayScrollArea>
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

/**
 * The upload dialog host. Wraps a section of the page tree, owns the
 * single dialog instance for that section, and listens at the window
 * for file drags so the dialog can also be opened (and pre-queued) by
 * dropping images anywhere.
 *
 * Two ways to open:
 *   - `UploadButton` (rendered as a descendant) calls the context's
 *     open fn on click.
 *   - First `dragenter` of a file drag over the page opens the dialog
 *     so it becomes the drop affordance.
 *
 * Coordination with the in-dialog react-dropzone:
 *   - Drops on the in-dialog box stay there: react-dropzone is set
 *     to `noDragEventsBubbling`, so they never reach this window
 *     listener.
 *   - Drops anywhere else bubble to the window listener and we
 *     queue them ourselves. Two routes depending on whether the
 *     `UploadDropzone` has mounted yet:
 *       - mounted: use `addFilesRef`, the imperative handle the
 *         child registers via `onRegister`. Files append live.
 *       - not yet mounted (drop fired in the same gesture that
 *         opened the dialog): seed `initialFiles`; the child's
 *         useState initializer picks them up on mount.
 *
 * Other notes:
 *   - `DataTransfer.types.includes("Files")` gating skips text /
 *     element drags so we don't react to in-page selection drags.
 *   - We always `preventDefault` on `dragover` and `drop` to stop the
 *     OS from navigating to the file when a drop misses every
 *     handler.
 *   - The dragenter counter handles the noise of dragenter /
 *     dragleave bubbling through nested elements — only the
 *     0 → 1 transition is treated as "entering the page".
 */
export function UploadDropTarget({
  children,
  folderId,
  tagId,
}: {
  children: React.ReactNode;
  folderId?: string;
  tagId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [initialFiles, setInitialFiles] = useState<File[]>([]);
  // `dragenter` / `dragleave` fire as the cursor crosses every element
  // boundary, not just on entering / leaving the page. The counter
  // collapses that noise so we only react to true page-level entries.
  const dragCounter = useRef(0);
  // Imperative handle into the mounted `UploadDropzone`. Null when the
  // dialog hasn't been opened yet (or just closed).
  const addFilesRef = useRef<((files: File[]) => void) | null>(null);

  const handleRegister = useCallback(
    (fn: ((files: File[]) => void) | null) => {
      addFilesRef.current = fn;
    },
    [],
  );

  const openDialog = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer?.types?.includes("Files") ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounter.current++;
      // First entry onto the page — the dialog itself is the drop
      // affordance, so open it now and let the user drop into it.
      if (dragCounter.current === 1) setOpen(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Required so the browser doesn't open the dropped file directly
      // (its default behaviour for an unhandled drop on document).
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      // Don't auto-close on counter==0 — the user may have a momentary
      // leave (cursor briefly out of the viewport) or be lining up a
      // drop. They close via Escape / the X button / clicking outside.
    };

    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragCounter.current = 0;
      // Drops landing inside the in-dialog dropzone don't reach this
      // listener — react-dropzone's `noDragEventsBubbling` stops them
      // at the box, so we only see drops that landed outside.
      const images = filterImageFiles(e.dataTransfer.files);
      if (images.length === 0) {
        toast.error("No supported image formats");
        return;
      }
      if (addFilesRef.current) {
        addFilesRef.current(images);
      } else {
        // Dialog hadn't mounted yet — seed initialFiles. The
        // child's useState initializer picks them up on the very
        // next render.
        setInitialFiles(images);
      }
      setOpen(true);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <UploadDialogContext.Provider value={openDialog}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            // Reset so a later open via button / fresh drag starts clean.
            setInitialFiles([]);
            dragCounter.current = 0;
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload images</DialogTitle>
            <DialogDescription>
              Duplicates or unsupported formats are skipped automatically.
            </DialogDescription>
          </DialogHeader>
          <UploadDropzone
            onDone={() => {
              setOpen(false);
              setInitialFiles([]);
            }}
            folderId={folderId}
            tagId={tagId}
            initialFiles={initialFiles}
            onRegister={handleRegister}
          />
        </DialogContent>
      </Dialog>
    </UploadDialogContext.Provider>
  );
}
