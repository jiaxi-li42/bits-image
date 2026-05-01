"use client";

import { usePathname } from "next/navigation";
import { Tag as TagIcon } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuLink,
} from "@/components/ui/sidebar";
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
            <SidebarMenuLink
              href={href}
              onClick={onNavigate}
              isActive={active}
              className="pr-7 md:h-7 md:py-1 md:text-[0.8rem]"
            >
              <TagIcon />
              <span className="flex-1 truncate">{t.name}</span>
            </SidebarMenuLink>
            <SidebarMenuBadge>{t.count}</SidebarMenuBadge>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
