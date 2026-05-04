import * as React from "react"

import { cn } from "@/lib/utils"

type CardSize = "default" | "sm"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: CardSize }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        // The size prop drives vertical rhythm: smaller gap between
        // sections + smaller top/bottom padding. Subcomponents pick up
        // the matching horizontal padding via the data-size selector
        // pattern below — no Context needed, components stay pure.
        size === "sm" ? "gap-4 py-4" : "gap-6 py-6",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        // Grid so a CardAction (if present) docks to the top-right while
        // the title + description stack on the left. `has-data-` only
        // promotes the grid to two columns when an action exists.
        "grid items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        "[[data-slot=card][data-size=sm]_&]:px-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-6",
        "[[data-slot=card][data-size=sm]_&]:px-4",
        className
      )}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-6 [.border-t]:pt-6",
        "[[data-slot=card][data-size=sm]_&]:px-4 [[data-slot=card][data-size=sm].border-t_&]:pt-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
}
