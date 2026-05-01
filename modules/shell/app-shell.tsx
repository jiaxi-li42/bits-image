import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { listFolders } from "@/modules/folders";
import { listTags } from "@/modules/tags";
import { AppSidebar } from "./app-sidebar";
import { getViewCounts } from "./counts";
import { CreateEntityProvider } from "./create-entity-context";
import { ShellProvider } from "./shell-context";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [counts, folders, tags, cookieStore] = await Promise.all([
    getViewCounts(),
    listFolders(),
    listTags(),
    cookies(),
  ]);

  // Persist desktop sidebar open/closed across reloads (matches shadcn).
  const sidebarCookie = cookieStore.get("sidebar:state")?.value;
  const defaultOpen = sidebarCookie !== "false";

  return (
    <ShellProvider value={{ counts, folders, tags }}>
      <CreateEntityProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      </CreateEntityProvider>
    </ShellProvider>
  );
}
