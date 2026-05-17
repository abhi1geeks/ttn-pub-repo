import type { EnforcementMonthBucket } from "../lib/enforcement_timeline";

export function EnforcementTimeline({ buckets }: { buckets: EnforcementMonthBucket[] }) {
  if (!buckets.length) return null;
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="mt-4" role="img" aria-label="Enforcement actions by month (demo)">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Activity timeline (demo)</p>
      <ul className="mt-2 space-y-2">
        {buckets.map((b) => (
          <li key={b.monthKey}>
            <div className="flex justify-between text-[11px] font-medium text-zinc-700">
              <span>{b.label}</span>
              <span className="tabular-nums text-zinc-900">
                {b.count} action{b.count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-rose-100/80">
              <div
                className="h-full rounded-full bg-rose-500"
                style={{ width: `${Math.round((b.count / max) * 100)}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-500">{b.jurisdictions.join(" · ")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
