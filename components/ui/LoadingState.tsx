import { RefreshCw } from "lucide-react";

type LoadingStateProps = { label?: string; rows?: number };

export function LoadingState({ label = "Loading", rows = 3 }: LoadingStateProps) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <RefreshCw size={14} className="animate-spin" /> {label}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-surface-2 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
