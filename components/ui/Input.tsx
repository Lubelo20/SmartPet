import type { InputHTMLAttributes } from "react";

/**
 * text-base on phones, text-sm from the sm breakpoint. iOS zooms the whole
 * page when an input under 16px receives focus — that was the sideways shift
 * on the mobile pet form. Sixteen pixels is the fix that keeps pinch-zoom
 * working; `maximum-scale=1` in the viewport meta would also stop it, at the
 * cost of accessibility for everyone.
 */
export const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input(props: InputProps) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}
