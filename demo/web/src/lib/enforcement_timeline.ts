/** CSV 2.5 — group enforcement actions by month for timeline UI. */

import type { EnforcementAction } from "../data/enforcement_feed";

export type EnforcementMonthBucket = {
  monthKey: string;
  label: string;
  count: number;
  jurisdictions: string[];
};

function monthKeyFromDate(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})/);
  if (!m) return "unknown";
  return `${m[1]}-${m[2]}`;
}

function monthLabel(key: string): string {
  if (key === "unknown") return "Unknown";
  const [y, mo] = key.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number(mo) - 1;
  return `${names[idx] ?? mo} ${y}`;
}

export function buildEnforcementTimeline(actions: EnforcementAction[]): EnforcementMonthBucket[] {
  const map = new Map<string, { count: number; jurisdictions: Set<string> }>();

  for (const a of actions) {
    const key = monthKeyFromDate(a.actionDate);
    const row = map.get(key) ?? { count: 0, jurisdictions: new Set<string>() };
    row.count += 1;
    row.jurisdictions.add(a.jurisdiction);
    map.set(key, row);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, v]) => ({
      monthKey,
      label: monthLabel(monthKey),
      count: v.count,
      jurisdictions: [...v.jurisdictions].sort(),
    }));
}
