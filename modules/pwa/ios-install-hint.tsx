"use client";

import { useEffect, useState } from "react";
import { Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DISMISSED_KEY = "pwa-ios-hint-dismissed";

/**
 * Floating banner shown on iOS Safari instructing the user to install
 * the app via the Share menu. Hidden when:
 *   - the device isn't iOS
 *   - the app is already running standalone (launched from Home Screen)
 *   - the user previously dismissed the banner (persisted in localStorage)
 *
 * Returns null until detection finishes so non-iOS users never see a
 * flash of the banner.
 */
export function IosInstallHint() {
  // null = "still detecting"; boolean = decided.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    if (!isIos) {
      setShow(false);
      return;
    }

    // matchMedia covers most browsers; navigator.standalone is the iOS
    // legacy flag still used by Safari when launched from the Home
    // Screen — both are checked so we don't nag installed users.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      setShow(false);
      return;
    }

    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
    setShow(!dismissed);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <Card
      size="sm"
      role="dialog"
      aria-label="Install Bits Image"
      // Floating bottom banner. md:hidden because the install gesture
      // only matters on iPhone Safari — iPad uses a different flow and
      // desktop doesn't need it.
      className="fixed inset-x-3 bottom-3 z-50 text-sm md:hidden"
    >
      <CardHeader>
        <CardTitle>Install Bits Image</CardTitle>
        <CardDescription>
          Tap{" "}
          <Share
            className="inline-block size-3.5 -translate-y-px align-middle"
            aria-label="the Share button"
          />{" "}
          then <span className="font-medium">Add to Home Screen</span> to get a full-screen, app-like experience.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={dismiss}
          className="w-full"
        >
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}
