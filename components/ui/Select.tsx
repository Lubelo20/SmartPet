import type { SelectHTMLAttributes } from "react";
import { inputCls } from "@/components/ui/Input";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select(props: SelectProps) {
  return <select {...props} className={`${inputCls} appearance-none ${props.className || ""}`} />;
}
