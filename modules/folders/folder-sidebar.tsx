"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Folder as FolderIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createFolder, type FolderNode } from "./server";

export function FolderSidebar({ folders }: { folders: FolderNode[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const onCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createFolder(trimmed);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      toast("Folder created");
      setName("");
      setOpen(false);
      router.push(`/folders/${res.folder.id}`);
    });
  };

  return (
    <div className="px-2 pt-3">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Folders
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                aria-label="New folder"
              >
                <Plus className="size-3.5" />
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
              <DialogDescription>
                Folders organise photos independently of tags.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCreate();
                }
              }}
              autoFocus
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={onCreate} disabled={pending || !name.trim()}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {folders.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          No folders yet
        </p>
      ) : (
        <ul>
          {folders.map((f) => {
            const href = `/folders/${f.id}`;
            const active = pathname === href;
            return (
              <li key={f.id}>
                <Link
                  href={href}
                  className={cn(
                    "group flex items-center gap-2 rounded-md py-1.5 pr-3 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  style={{ paddingLeft: `${12 + f.depth * 14}px` }}
                  title={f.path}
                >
                  <FolderIcon className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs opacity-60">{f.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
