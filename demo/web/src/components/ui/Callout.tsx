import type { ReactNode } from "react";

type Tone = "info" | "warning" | "success" | "danger";

const toneClass: Record<Tone, string> = {
  info: "border-sky-200 bg-sky-50/70 text-sky-950",
  warning: "border-amber-200 bg-amber-50/80 text-amber-950",
  success: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
  danger: "border-rose-200 bg-rose-50/90 text-rose-950",
};

export function Callout({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${toneClass[tone]}`}>{children}</div>;
}
