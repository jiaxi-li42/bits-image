"use client";

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Selection state lives in a module-scoped store rather than React state.
 * Photo cards subscribe to *their own id* via `useIsSelected(id)` (powered
 * by `useSyncExternalStore` with per-id listener sets), so toggling one
 * card only re-renders that card — not every visible tile in the grid.
 *
 * Cross-cutting reads (the count badge, the manage panel, action buttons
 * needing the full id set) use the global subscription; these surfaces
 * are 1-2 instances per page so re-rendering all of them on a toggle is
 * fine.
 */

type Listener = () => void;

let isManaging = false;
let selectedSet: ReadonlySet<string> = new Set();
const idListeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

function notifyId(id: string) {
  const set = idListeners.get(id);
  if (!set) return;
  for (const l of set) l();
}

function notifyGlobal() {
  for (const l of globalListeners) l();
}

// --- public store ---------------------------------------------------------

const store = {
  isManaging: () => isManaging,
  selected: () => selectedSet,
  count: () => selectedSet.size,
  isSelected: (id: string) => selectedSet.has(id),

  enter() {
    if (isManaging) return;
    isManaging = true;
    notifyGlobal();
  },

  exit() {
    const wasManaging = isManaging;
    const cleared = selectedSet.size > 0 ? [...selectedSet] : null;
    if (cleared) selectedSet = new Set();
    if (wasManaging) isManaging = false;
    if (cleared) for (const id of cleared) notifyId(id);
    if (wasManaging || cleared) notifyGlobal();
  },

  toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedSet = next;
    notifyId(id);
    notifyGlobal();
  },

  clear() {
    if (selectedSet.size === 0) return;
    const cleared = [...selectedSet];
    selectedSet = new Set();
    for (const id of cleared) notifyId(id);
    notifyGlobal();
  },

  subscribeGlobal(l: Listener): () => void {
    globalListeners.add(l);
    return () => {
      globalListeners.delete(l);
    };
  },

  subscribeId(id: string, l: Listener): () => void {
    let set = idListeners.get(id);
    if (!set) {
      set = new Set();
      idListeners.set(id, set);
    }
    set.add(l);
    return () => {
      const s = idListeners.get(id);
      if (!s) return;
      s.delete(l);
      if (s.size === 0) idListeners.delete(id);
    };
  },
};

// --- granular hooks (use these in hot paths) ------------------------------

/**
 * Subscribes only to the given id's selection state. A toggle on a
 * different id never re-renders this hook's caller. This is the hook
 * to use inside per-photo render callbacks.
 */
export function useIsSelected(id: string): boolean {
  return useSyncExternalStore(
    (cb) => store.subscribeId(id, cb),
    () => store.isSelected(id),
    () => false,
  );
}

export function useIsManaging(): boolean {
  return useSyncExternalStore(
    (cb) => store.subscribeGlobal(cb),
    () => store.isManaging(),
    () => false,
  );
}

export function useSelectionCount(): number {
  return useSyncExternalStore(
    (cb) => store.subscribeGlobal(cb),
    () => store.count(),
    () => 0,
  );
}

export function useSelectedIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => store.subscribeGlobal(cb),
    () => store.selected(),
    () => EMPTY_SET,
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Stable references for the action callbacks. Components calling this
 * never re-render on selection / mode changes — `store` itself never
 * changes identity.
 */
export type ManageActions = Pick<typeof store, "enter" | "exit" | "toggle" | "clear">;
const actions: ManageActions = {
  enter: store.enter,
  exit: store.exit,
  toggle: store.toggle,
  clear: store.clear,
};
export function useManageActions(): ManageActions {
  return actions;
}

// --- compat hook (unified shape — keeps existing call sites working) -----

type ManageContextValue = {
  isManaging: boolean;
  selected: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
} & ManageActions;

/**
 * Compatibility hook. Subscribes globally, so callers re-render on any
 * mode/selection change. Fine for the manage bar / panel / action
 * buttons (1-2 instances per page); the per-photo grid card should use
 * `useIsSelected(id)` instead.
 */
export function useManage(): ManageContextValue {
  const isManagingNow = useIsManaging();
  const selected = useSelectedIds();
  return useMemo(
    () => ({
      isManaging: isManagingNow,
      selected,
      count: selected.size,
      isSelected: (id: string) => selected.has(id),
      ...actions,
    }),
    [isManagingNow, selected],
  );
}

// --- provider (drops cross-view selection on navigation) ------------------

/**
 * Provider's only job now is mounting the pathname-watcher effect that
 * resets selection when the user navigates between views. The store
 * itself is module-scoped and doesn't need a Context.
 */
export function ManageProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    store.exit();
  }, [pathname]);
  return <>{children}</>;
}
