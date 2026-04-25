import { getViewCounts } from "./counts";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileNav } from "./mobile-nav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const counts = await getViewCounts();

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar counts={counts} />
      <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>
      <MobileNav counts={counts} />
    </div>
  );
}
