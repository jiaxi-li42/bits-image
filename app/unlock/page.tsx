import { UnlockGate } from "@/modules/auth";

// Public route — must render before authentication. The root layout
// detects the missing auth cookie and skips AppShell, so this page is
// rendered as a clean full-screen gate.
export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const raw = params.next;
  // Whitelist: only allow same-origin path redirects, never absolute URLs.
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  return <UnlockGate next={next} />;
}
