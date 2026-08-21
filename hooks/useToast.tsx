"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ToastNotification } from "@/components/ui/ToastNotification";
import { uid } from "@/lib/utils";
import type { ToastInput } from "@/lib/types";

type ToastItem = ToastInput & { id: string };

const ToastCtx = createContext<((t: ToastInput) => void) | null>(null);

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((toast: ToastInput) => {
    const id = uid("T");
    setItems((prev) => [...prev, { id, tone: "success", ...toast }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), toast.duration || 4200);
  }, []);
  const dismiss = (id: string) => setItems((prev) => prev.filter((t) => t.id !== id));
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
        {items.map((t) => <ToastNotification key={t.id} {...t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  );
}
