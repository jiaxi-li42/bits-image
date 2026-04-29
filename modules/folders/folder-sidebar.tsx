"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CreateEntityDialog } from "@/modules/shell/create-entity-dialog";
import { createFolder, type FolderNode } from "./server";

export function FolderSidebar({ folders }: { folders: FolderNode[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Map id -> node for ancestor lookups. Auto-expand the chain that contains
  // whichever folder is currently routed so it stays visible after navigation.
  const byId = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );
  const activeId = pathname.startsWith("/folders/")
    ? pathname.slice("/folders/".length).split("/")[0]
    : null;

  const hasChildren = useMemo(() => {
    const s = new Set<string>();
    for (const f of folders) if (f.parentId) s.add(f.parentId);
    return s;
  }, [folders]);

  const ancestorChain = useMemo(() => {
    const ids: string[] = [];
    if (!activeId) return ids;
    let cur: string | null = activeId;
    while (cur) {
      const node = byId.get(cur);
      if (!node || !node.parentId) break;
      ids.push(node.parentId);
      cur = node.parentId;
    }
    return ids;
  }, [activeId, byId]);
  // Default state: every folder that has children is expanded. Users can
  // still collapse manually; manual state is preserved across navigation.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(hasChildren));

  // When the route changes (e.g. clicking a deep folder), open the chain
  // leading to it so it stays visible. Manual collapses are preserved
  // because we only add — we never remove.
  useEffect(() => {
    if (ancestorChain.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestorChain) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ancestorChain]);

  const isVisible = (f: FolderNode): boolean => {
    let cur = f.parentId;
    while (cur) {
      if (!expanded.has(cur)) return false;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return true;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCreate = async (trimmed: string) => {
    const res = await createFolder(trimmed, null, { strict: true });
    if (res.status === "error") {
      toast.error(res.message);
      return false;
    }
    toast("Folder created");
    router.push(`/folders/${res.folder.id}`);
  };

  return (
    <div className="px-2 pt-3">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Folders
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New Folder"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3.5" />
        </Button>
        <CreateEntityDialog
          open={open}
          onOpenChange={setOpen}
          title="New folder"
          description="Folders organise images independently of tags."
          placeholder="Folder name"
          onCreate={onCreate}
        />
      </div>
      {folders.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          No folders yet
        </p>
      ) : (
        <ul>
          {folders.map((f) => {
            if (!isVisible(f)) return null;
            const href = `/folders/${f.id}`;
            const active = pathname === href;
            const expandable = hasChildren.has(f.id);
            const isOpen = expanded.has(f.id);
            return (
              <li
                key={f.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50",
                )}
                style={{ paddingLeft: `${f.depth * 12}px` }}
              >
                {expandable ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => toggleExpand(f.id)}
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    aria-expanded={isOpen}
                    // Ghost variant styles aria-expanded with bg-muted; we
                    // want the chevron to be a plain affordance regardless
                    // of expand state. Override here.
                    className="aria-expanded:bg-transparent aria-expanded:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </Button>
                ) : (
                  <span className="size-6 shrink-0" aria-hidden />
                )}
                <Link
                  href={href}
                  title={f.path}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-3"
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
