import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { AppShell } from "@/modules/shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AUTH_COOKIE_NAME,
  expectedAuthToken,
  tokenMatches,
} from "@/modules/auth/auth-token";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bits Image",
  description: "Keep collecting, stay inspired.",
};

// Disable the browser's native pinch-to-zoom and iOS double-tap-to-zoom.
// The image viewer implements its own pinch-zoom on top of touch events
// + CSS transforms (modules/viewer/viewer.tsx), which is independent of
// the browser's visual viewport — so disabling user-scaling here does
// not affect the in-viewer zoom experience.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Skip the AppShell (sidebar + data fetching) for unauthenticated
  // requests. /unlock is the only route a non-authed visitor can reach
  // (the proxy redirects everything else), so this also renders the
  // unlock screen full-bleed without leaking folder/tag names through
  // the sidebar before the passcode is entered.
  //
  // When APP_PASSCODE isn't configured we mirror the proxy's fail-open
  // behaviour: dev environments without a passcode render the full app
  // normally (otherwise every page below would crash because AppShell —
  // and the SidebarProvider it mounts — would be missing).
  const expected = expectedAuthToken();
  const store = await cookies();
  const cookie = store.get(AUTH_COOKIE_NAME)?.value;
  const authed =
    !expected || (!!cookie && tokenMatches(cookie, expected));

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider>
          {authed ? <AppShell>{children}</AppShell> : children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
