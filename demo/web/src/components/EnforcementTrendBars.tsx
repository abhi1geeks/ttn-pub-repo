import type { EnforcementTrendSummary } from "../lib/enforcement_trends";

type BarSpec = { label: string; value: number; barClass: string };

function barsFromTrend(trend: EnforcementTrendSummary): BarSpec[] {
  return [
    { label: "Rising enforcement", value: trend.up, barClass: "bg-rose-500" },
    { label: "Stable vs prior quarter", value: trend.stable, barClass: "bg-zinc-400" },
    { label: "New category", value: trend.newCategory, barClass: "bg-amber-500" },
  ];
}

/** Simple horizontal bar chart for CSV 2.5 trend analysis (no chart library). */
export function EnforcementTrendBars({ trend }: { trend: EnforcementTrendSummary }) {
  const bars = barsFromTrend(trend);
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="mt-4 space-y-3" role="img" aria-label="Enforcement trend distribution (demo)">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="mb-1 flex justify-between text-[11px] font-medium text-zinc-700">
            <span>{b.label}</span>
            <span className="tabular-nums text-zinc-900">{b.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-rose-100/80">
            <div
              className={`h-full rounded-full transition-all ${b.barClass}`}
              style={{ width: `${Math.round((b.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
