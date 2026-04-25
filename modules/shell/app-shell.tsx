import { getViewCounts } from "./counts";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileNav } from "./mobile-nav";
import { listFolders } from "@/modules/folders";
import { listTags } from "@/modules/tags";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [counts, folders, tags] = await Promise.all([
    getViewCounts(),
    listFolders(),
    listTags(),
  ]);

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar counts={counts} folders={folders} tags={tags} />
      <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>
      <MobileNav counts={counts} />
    </div>
  );
}
