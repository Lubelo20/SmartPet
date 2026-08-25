import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
};

export function Button({ variant = "primary", size = "md", icon: Icon, children, className = "", ...rest }: ButtonProps) {
  const base = `inline-flex items-center gap-2 font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-canvas focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed ${className.includes("justify") ? "" : "justify-center"}`;
  const sizes = { sm: "text-xs px-3 py-2", md: "text-sm px-4 py-2.5", lg: "text-base px-6 py-3.5" };
  const variants = {
    // The background is amber in BOTH themes, so the label must be a fixed
    // dark slate rather than the `ink` token: ink flips to near-white in dark
    // and lands at 1.96:1 on amber — worse than the 2.15:1 failure this fixed
    // in the first place. slate-900 on amber-500 is 8.31:1.
    primary: "bg-amber-500 text-slate-900 hover:bg-amber-400 shadow-sm",
    dark: "bg-inverse text-inverse-ink hover:opacity-90 shadow-sm",
    ghost: "bg-surface text-ink-2 border border-line hover:bg-surface-2",
    subtle: "bg-surface-2 text-ink-2 hover:opacity-80",
    // rose-600 is 3.50:1 on the dark surface and fails; rose-400 is 6.11:1.
    danger: "bg-surface text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950",
  };
  return (
    <button {...rest} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={size === "lg" ? 20 : 16} strokeWidth={2} />}
      {children}
    </button>
  );
}
