"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type ManageContextValue = {
  isManaging: boolean;
  enter: () => void;
  exit: () => void;
  toggleMode: () => void;
  selected: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (ids: string[]) => void;
  remove: (ids: string[]) => void;
  clear: () => void;
  count: number;
};

const ManageContext = createContext<ManageContextValue | null>(null);

export function ManageProvider({ children }: { children: ReactNode }) {
  const [isManaging, setIsManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const pathname = usePathname();

  // Cross-view state should not leak: if the user navigates between views
  // while Manage mode is on, drop the selection and exit.
  useEffect(() => {
    setIsManaging(false);
    setSelected(new Set());
  }, [pathname]);

  const enter = useCallback(() => setIsManaging(true), []);
  const exit = useCallback(() => {
    setIsManaging(false);
    setSelected(new Set());
  }, []);
  const toggleMode = useCallback(() => {
    setIsManaging((prev) => {
      if (prev) setSelected(new Set());
      return !prev;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const add = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const value = useMemo<ManageContextValue>(
    () => ({
      isManaging,
      enter,
      exit,
      toggleMode,
      selected,
      isSelected,
      toggle,
      add,
      remove,
      clear,
      count: selected.size,
    }),
    [
      isManaging,
      enter,
      exit,
      toggleMode,
      selected,
      isSelected,
      toggle,
      add,
      remove,
      clear,
    ],
  );

  return (
    <ManageContext.Provider value={value}>{children}</ManageContext.Provider>
  );
}

export function useManage(): ManageContextValue {
  const ctx = useContext(ManageContext);
  if (!ctx) {
    throw new Error("useManage must be used within a ManageProvider");
  }
  return ctx;
}
