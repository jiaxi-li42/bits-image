"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import type { ViewCounts } from "./counts";
import { FolderSidebar } from "@/modules/folders";
import { TagSidebar } from "@/modules/tags";
import type { FolderNode } from "@/modules/folders";
import type { TagWithCount } from "@/modules/tags";

const APP_VERSION = "v0.9";

export function DesktopSidebar({
  counts,
  folders,
  tags,
}: {
  counts: ViewCounts;
  folders: FolderNode[];
  tags: TagWithCount[];
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh md:flex w-60 shrink-0 flex-col border-r bg-background">
      <Link
        href="/library"
        className="flex shrink-0 items-center gap-3 px-4 py-4 hover:bg-accent/40"
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-muted">
          <User className="size-4 text-muted-foreground" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Bits Image</div>
          <div className="text-xs text-muted-foreground">{APP_VERSION}</div>
        </div>
      </Link>

      <nav className="shrink-0 mx-2 p-2 border-b">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const count = counts[item.view];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              <span className="text-xs tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      <div className="no-scrollbar flex-1 min-h-0 overflow-y-auto">
        <FolderSidebar folders={folders} />
        <TagSidebar tags={tags} />
      </div>
    </aside>
  );
}
