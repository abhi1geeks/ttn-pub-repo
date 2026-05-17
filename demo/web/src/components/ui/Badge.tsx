import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-800 ring-zinc-200",
  success: "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
  warning: "bg-amber-50 text-amber-900 ring-amber-200/80",
  danger: "bg-rose-50 text-rose-950 ring-rose-200/80",
  accent: "bg-emerald-100 text-emerald-900 ring-emerald-200/80",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${toneClass[tone]}`}>
      {children}
    </span>
  );
}
