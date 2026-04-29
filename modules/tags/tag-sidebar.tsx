"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Tag as TagIcon } from "lucide-react";
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
import { createTag, type TagWithCount } from "./server";

export function TagSidebar({ tags }: { tags: TagWithCount[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!createOpen) setName("");
  }, [createOpen]);

  const onCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createTag(trimmed, { strict: true });
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      toast("Tag created");
      setName("");
      setCreateOpen(false);
      router.push(`/tags/${res.tag.id}`);
    });
  };

  return (
    <div className="px-2 pt-3">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tags
        </h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New Tag"
              >
                <Plus className="size-3.5" />
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New tag</DialogTitle>
              <DialogDescription>
                Tags can be assigned to any image from the image details panel.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Tag name"
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
                onClick={() => setCreateOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={onCreate} disabled={pending || !name.trim()}>
                {pending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {tags.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">No tags yet</p>
      ) : (
        <ul>
          {tags.map((t) => {
            const href = `/tags/${t.id}`;
            const active = pathname === href;
            return (
              <li key={t.id}>
                <Link
                  href={href}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  <TagIcon className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-xs opacity-60">{t.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
