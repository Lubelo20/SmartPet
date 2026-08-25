import { clamp } from "@/lib/utils";

type ProgressBarProps = { value: number; tone?: "emerald" | "amber" | "rose" | "slate" | "sky"; height?: number };

export function ProgressBar({ value, tone = "emerald", height = 8 }: ProgressBarProps) {
  const colours = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-inverse", sky: "bg-sky-500" };
  return (
    <div className="w-full rounded-full bg-surface-2 overflow-hidden" style={{ height }}>
      <div className={`${colours[tone]} h-full rounded-full transition-all duration-500 ease-out`} style={{ width: `${clamp(value, 0, 100)}%` }} />
    </div>
  );
}
