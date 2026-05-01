"use client";

import { createContext, useContext } from "react";
import type { ViewCounts } from "./counts";
import type { FolderNode } from "@/modules/folders";
import type { TagWithCount } from "@/modules/tags";

export type ShellData = {
  counts: ViewCounts;
  folders: FolderNode[];
  tags: TagWithCount[];
};

const ShellContext = createContext<ShellData | null>(null);

export function ShellProvider({
  value,
  children,
}: {
  value: ShellData;
  children: React.ReactNode;
}) {
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellData {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <ShellProvider>");
  return ctx;
}
