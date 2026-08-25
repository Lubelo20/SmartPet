import type { InputHTMLAttributes } from "react";

export const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input(props: InputProps) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}
