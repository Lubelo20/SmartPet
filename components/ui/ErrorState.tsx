import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ErrorStateProps = { title?: string; message?: string; onRetry?: () => void };

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-4"><AlertTriangle size={22} /></div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="text-sm text-muted mt-1 max-w-sm">{message}</p>}
      {onRetry && <Button variant="ghost" icon={RotateCw} className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
