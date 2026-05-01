import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchBar } from "@/modules/search";

export function ViewHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <>
      {/* Mobile: sticky [≡] | divider | title row pinned at the top.
          Search bar below it stays in normal scroll flow. */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
        <SidebarTrigger aria-label="Open menu" />
        <div className="h-5 self-center border-l border-border" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {action}
      </div>
      <div className="px-4 pt-3 pb-3 md:hidden">
        <SearchBar />
      </div>

      {/* Desktop: title + optional action; search lives in toolbar row below */}
      <header className="hidden md:block md:px-6 md:pt-6 md:pb-3">
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold tracking-tight md:text-xl">
            {title}
          </h1>
          {action}
        </div>
      </header>
    </>
  );
}

// EmptyState is unrelated to ViewHeader but lives in this file historically;
// keep export.
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="max-w-sm text-center">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
