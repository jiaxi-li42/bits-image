import type { LucideIcon } from "lucide-react";
import { Images, Inbox, Tags, Trash2 } from "lucide-react";
import type { ViewKind } from "@/modules/views";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  view: ViewKind;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/library", label: "Library", icon: Images, view: "library" },
  { href: "/inbox", label: "Inbox", icon: Inbox, view: "inbox" },
  { href: "/organised", label: "Organised", icon: Tags, view: "organised" },
  { href: "/trash", label: "Trash", icon: Trash2, view: "trash" },
];
