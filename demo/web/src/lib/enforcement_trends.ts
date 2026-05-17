/** CSV 2.5 — aggregate illustrative enforcement feed into trend signals. */

import type { EnforcementAction } from "../data/enforcement_feed";

export type TrendDirection = "up" | "stable" | "new" | "unknown";

export function parseTrendDirection(trendNote: string): TrendDirection {
  const t = trendNote.toLowerCase();
  if (t.includes("up vs")) return "up";
  if (t.includes("new category")) return "new";
  if (t.includes("stable")) return "stable";
  return "unknown";
}

export type EnforcementTrendSummary = {
  total: number;
  up: number;
  stable: number;
  newCategory: number;
  unknown: number;
  /** Jurisdictions flagged as increasing enforcement in the demo feed. */
  hotspots: string[];
  narrative: string;
};

export function buildEnforcementTrendSummary(actions: EnforcementAction[]): EnforcementTrendSummary {
  let up = 0;
  let stable = 0;
  let newCategory = 0;
  let unknown = 0;
  const hotspots: string[] = [];

  for (const a of actions) {
    const dir = parseTrendDirection(a.trendNote);
    if (dir === "up") {
      up += 1;
      hotspots.push(a.jurisdiction);
    } else if (dir === "new") {
      newCategory += 1;
      hotspots.push(a.jurisdiction);
    } else if (dir === "stable") stable += 1;
    else unknown += 1;
  }

  const parts: string[] = [];
  if (up > 0) parts.push(`${up} jurisdiction(s) show rising enforcement (demo labels)`);
  if (newCategory > 0) parts.push(`${newCategory} new enforcement category this quarter (demo)`);
  if (stable > 0) parts.push(`${stable} stable vs prior quarter`);
  const narrative =
    parts.length > 0
      ? parts.join("; ") + "."
      : "No trend labels parsed from the illustrative feed.";

  return {
    total: actions.length,
    up,
    stable,
    newCategory,
    unknown,
    hotspots,
    narrative,
  };
}
