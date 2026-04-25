"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "./nav-items";
import type { ViewCounts } from "./counts";
import { FolderSidebar } from "@/modules/folders";
import { TagSidebar } from "@/modules/tags";
import type { FolderNode } from "@/modules/folders";
import type { TagWithCount } from "@/modules/tags";

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
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-background overflow-y-auto">
      <div className="px-4 py-5">
        <Link href="/library" className="text-lg font-semibold tracking-tight">
          Bits Image
        </Link>
      </div>
      <nav className="px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const count = counts[item.view];
          const showBadge = item.view === "inbox" ? count > 0 : false;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {showBadge ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {count}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <FolderSidebar folders={folders} />
      <TagSidebar tags={tags} />
    </aside>
  );
}
