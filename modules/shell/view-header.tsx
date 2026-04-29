import type { ReactNode } from "react";

export function ViewHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="px-4 pt-6 pb-3 md:px-6">
      <div className="flex items-center gap-1">
        <h1 className="text-lg font-semibold tracking-tight md:text-xl">
          {title}
        </h1>
        {action}
      </div>
    </header>
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
