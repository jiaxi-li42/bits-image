"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEBOUNCE_MS = 250;

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);
  const lastSyncedRef = useRef(initial);

  useEffect(() => {
    const fromUrl = params.get("q") ?? "";
    if (fromUrl !== lastSyncedRef.current) {
      lastSyncedRef.current = fromUrl;
      setValue(fromUrl);
    }
  }, [params]);

  useEffect(() => {
    if (value === lastSyncedRef.current) return;
    const id = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (value.trim()) sp.set("q", value.trim());
      else sp.delete("q");
      lastSyncedRef.current = value.trim();
      const qs = sp.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value, params, router]);

  return (
    <div className="relative w-full md:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        role="searchbox"
        placeholder="Search images..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 rounded-md pl-7 pr-7 font-medium"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
          onClick={() => setValue("")}
          aria-label="Clear search"
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}
