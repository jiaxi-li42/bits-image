"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { verifyPasscode } from "./server";

const PASSCODE_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function UnlockGate({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(false);
  const [pending, startTransition] = useTransition();
  // Lock further input while an attempt is in flight or the shake is
  // playing — prevents the next keypress from rewriting state mid-animation.
  const lockedRef = useRef(false);
  // Track the shake-clear timer so unmount cancels it (no setState on
  // an unmounted component if the user verifies and navigates away
  // while a previous failure's shake is still settling).
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  const submit = useCallback(
    (value: string) => {
      lockedRef.current = true;
      startTransition(async () => {
        const res = await verifyPasscode(value);
        if (res.status === "ok") {
          router.replace(next);
          router.refresh();
          return;
        }
        // Keep `code` populated for the duration of the shake so the six
        // dots stay filled (and switch to the destructive colour) — then
        // clear it when the animation ends so the user can start over.
        setShake(true);
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = setTimeout(() => {
          setShake(false);
          setCode("");
          lockedRef.current = false;
          shakeTimerRef.current = null;
        }, 350);
      });
    },
    [next, router],
  );

  const append = useCallback((digit: string) => {
    if (lockedRef.current) return;
    setCode((prev) =>
      prev.length >= PASSCODE_LENGTH ? prev : prev + digit,
    );
  }, []);

  // Auto-submit once the user has entered all PASSCODE_LENGTH digits.
  // This runs after commit (not inside the setState updater), so it's
  // safe to call startTransition from `submit`.
  useEffect(() => {
    if (code.length === PASSCODE_LENGTH) submit(code);
  }, [code, submit]);

  const backspace = useCallback(() => {
    if (lockedRef.current) return;
    setCode((prev) => prev.slice(0, -1));
  }, []);

  // Physical-keyboard parity. Numeric keys and Backspace mirror the
  // on-screen keypad so desktop users aren't forced to click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        append(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [append, backspace]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-xs flex-col items-center gap-10">
        <header className="space-y-1.5 text-center">
          <h1 className="text-lg font-semibold">Verification Code</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to you.
          </p>
        </header>

        {/* Dot indicators */}
        <div
          aria-hidden
          className={cn(
            "flex items-center gap-3",
            shake && "animate-shake-x",
          )}
        >
          {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3 rounded-full transition-colors",
                shake
                  ? "bg-destructive"
                  : i < code.length
                    ? "bg-foreground"
                    : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* Live region for screen readers — the dot row is aria-hidden. */}
        <span className="sr-only" aria-live="polite">
          {code.length === 0
            ? "No digits entered"
            : `${code.length} of ${PASSCODE_LENGTH} digits entered`}
        </span>

        {/* Numeric keypad */}
        <div className="grid w-full grid-cols-3 gap-y-3 justify-items-center">
          {KEYS.map((k) => (
            <KeypadButton
              key={k}
              label={k}
              onPress={() => append(k)}
              disabled={pending || shake}
            />
          ))}
          <span aria-hidden />
          <KeypadButton
            label="0"
            onPress={() => append("0")}
            disabled={pending || shake}
          />
          <KeypadButton
            ariaLabel="Delete last digit"
            onPress={backspace}
            disabled={pending || shake || code.length === 0}
          >
            <Delete className="size-5" />
          </KeypadButton>
        </div>
      </div>
    </div>
  );
}

function KeypadButton({
  label,
  ariaLabel,
  onPress,
  disabled,
  children,
}: {
  label?: string;
  ariaLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      disabled={disabled}
      // Oversize the touch target without changing the icon-lg base size by
      // using min dimensions; rounded-full + ghost matches the keypad look
      // (no chrome, just hover feedback).
      className="size-14 rounded-full text-2xl font-medium"
    >
      {children ?? label}
    </Button>
  );
}
