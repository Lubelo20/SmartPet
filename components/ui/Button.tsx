import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
};

export function Button({ variant = "primary", size = "md", icon: Icon, children, className = "", ...rest }: ButtonProps) {
  const base = `inline-flex items-center gap-2 font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed ${className.includes("justify") ? "" : "justify-center"}`;
  const sizes = { sm: "text-xs px-3 py-2", md: "text-sm px-4 py-2.5", lg: "text-base px-6 py-3.5" };
  const variants = {
    primary: "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
    dark: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
    ghost: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50",
  };
  return (
    <button {...rest} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={size === "lg" ? 20 : 16} strokeWidth={2} />}
      {children}
    </button>
  );
}
