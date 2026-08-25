import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/types";

/**
 * The single source for semantic colour. These are five fixed hues rather than
 * a role that flips, so they carry `dark:` pairs directly: a 50-level tint is
 * invisible on a dark surface, and the 700-level text would be unreadable on it.
 * Everything structural goes through the tokens in globals.css instead.
 */
export const TONE: Record<Tone, { ring: string; bg: string; text: string; dot: string; Icon: LucideIcon }> = {
  success: { ring: "border-emerald-200 dark:border-emerald-900", bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", Icon: CheckCircle2 },
  warning: { ring: "border-amber-200 dark:border-amber-900", bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500", Icon: AlertTriangle },
  critical: { ring: "border-rose-200 dark:border-rose-900", bg: "bg-rose-50 dark:bg-rose-950", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500", Icon: XCircle },
  info: { ring: "border-sky-200 dark:border-sky-900", bg: "bg-sky-50 dark:bg-sky-950", text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500", Icon: Info },
  neutral: { ring: "border-line", bg: "bg-surface-2", text: "text-ink-2", dot: "bg-muted", Icon: Info },
};
