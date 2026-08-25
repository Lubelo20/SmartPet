import type { ReactNode } from "react";
import { ClipboardList, type LucideIcon } from "lucide-react";

type EmptyStateProps = { icon?: LucideIcon; title: string; message?: string; action?: ReactNode };

export function EmptyState({ icon: Icon = ClipboardList, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-muted mb-4"><Icon size={22} /></div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="text-sm text-muted mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
