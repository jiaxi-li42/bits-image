"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { BrandMark } from "./brand-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuLink,
  useSidebar,
} from "@/components/ui/sidebar";
import { FolderSidebar } from "@/modules/folders";
import { TagSidebar } from "@/modules/tags";
import { useCreateEntity } from "./create-entity-context";
import { NAV_ITEMS } from "./nav-items";
import { useShell } from "./shell-context";

const APP_VERSION = "v1.5.1";

// Tighter row metrics for desktop sidebar links (folders / tags). Mobile
// keeps the default touch-friendly height; desktop tightens to fit more
// rows in the same vertical space. Shared across folder / tag sidebars.
export const SIDEBAR_LINK_DENSE = "md:h-7 md:py-1 md:text-[0.8rem]";

export function AppSidebar() {
  const pathname = usePathname();
  const { counts, folders, tags } = useShell();
  const { setOpenMobile, isMobile } = useSidebar();
  const { openCreateFolder, openCreateTag } = useCreateEntity();

  // Close the mobile drawer after a navigation occurs.
  const closeOnNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  // On mobile, dismiss the drawer first so the create dialog is rendered as
  // a top-level Dialog (not nested under the sheet's Dialog) — base-ui
  // suppresses backdrops on nested Dialogs, so without this the mobile
  // dialog would have no dim/blur.
  const triggerCreate = (open: () => void) => {
    if (isMobile) setOpenMobile(false);
    open();
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link
          href="/library"
          onClick={closeOnNavigate}
          className="flex items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent"
        >
          <div className="flex size-9 items-center justify-center rounded-full bg-muted">
            <BrandMark className="size-6 text-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Bits Image</div>
            <div className="text-xs text-muted-foreground">{APP_VERSION}</div>
          </div>
        </Link>
      </SidebarHeader>

      {/* Top-level views — pinned at the top above the scrollable area. */}
      <SidebarGroup className="border-b">
        <SidebarGroupContent>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              const count = counts[item.view];
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuLink
                    href={item.href}
                    onClick={closeOnNavigate}
                    isActive={active}
                  >
                    <Icon />
                    <span className="flex-1">{item.label}</span>
                  </SidebarMenuLink>
                  <SidebarMenuBadge>{count}</SidebarMenuBadge>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarContent>
        {/* Folders */}
        <SidebarGroup>
          <SidebarGroupLabel>Folders</SidebarGroupLabel>
          <SidebarGroupAction
            aria-label="New Folder"
            onClick={() => triggerCreate(openCreateFolder)}
          >
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <FolderSidebar folders={folders} onNavigate={closeOnNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tags */}
        <SidebarGroup>
          <SidebarGroupLabel>Tags</SidebarGroupLabel>
          <SidebarGroupAction
            aria-label="New Tag"
            onClick={() => triggerCreate(openCreateTag)}
          >
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <TagSidebar tags={tags} onNavigate={closeOnNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
