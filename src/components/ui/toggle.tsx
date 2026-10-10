"use client";
import { cn } from "@/lib/cn";

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-6 w-11" : "h-5 w-9",
        checked ? "bg-emerald-600" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block transform rounded-full bg-white shadow transition-transform",
          size === "md" ? "h-5 w-5" : "h-4 w-4",
          checked ? (size === "md" ? "translate-x-5" : "translate-x-4") : "translate-x-0.5",
        )}
      />
    </button>
  );
}
