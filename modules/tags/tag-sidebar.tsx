"use client";

import { usePathname } from "next/navigation";
import { Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuLink,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_LINK_DENSE } from "@/modules/shell/app-sidebar";
import type { TagWithCount } from "./server";

export function TagSidebar({
  tags,
  onNavigate,
}: {
  tags: TagWithCount[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  if (tags.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">No tags yet</p>
    );
  }

  return (
    <SidebarMenu>
      {tags.map((t) => {
        const href = `/tags/${t.id}`;
        const active = pathname === href;
        return (
          <SidebarMenuItem key={t.id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuLink
                    href={href}
                    onClick={onNavigate}
                    isActive={active}
                    className={cn("pr-7", SIDEBAR_LINK_DENSE)}
                  >
                    <TagIcon />
                    <span className="flex-1 truncate">{t.name}</span>
                  </SidebarMenuLink>
                }
              />
              <TooltipContent side="right">{t.name}</TooltipContent>
            </Tooltip>
            <SidebarMenuBadge>{t.count}</SidebarMenuBadge>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
