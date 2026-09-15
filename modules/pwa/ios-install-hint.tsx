"use client";

import { useState, useSyncExternalStore } from "react";
import { getIosDisplayMode, subscribeBrowserEnvironment } from "./browser-environment";
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

function getShowHint() {
  if (getIosDisplayMode() !== "browser") return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== "1";
  } catch {
    return true;
  }
}

const getServerHint = () => false;

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
  const show = useSyncExternalStore(subscribeBrowserEnvironment, getShowHint, getServerHint);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage may be blocked; dismissal still works for this page visit.
    }
    setDismissed(true);
  };

  if (!show || dismissed) return null;

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
