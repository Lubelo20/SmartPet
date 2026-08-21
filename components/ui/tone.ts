import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/types";

export const TONE: Record<Tone, { ring: string; bg: string; text: string; dot: string; Icon: LucideIcon }> = {
  success: { ring: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", Icon: CheckCircle2 },
  warning: { ring: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", Icon: AlertTriangle },
  critical: { ring: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500", Icon: XCircle },
  info: { ring: "border-sky-200", bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", Icon: Info },
  neutral: { ring: "border-slate-200", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", Icon: Info },
};
