/** CSV 1.5 — early-warning helpers for horizon scanning demo feed. */

import type { HorizonItem } from "../data/horizon_feed";

const EARLY_STAGES = new Set<HorizonItem["stage"]>(["consultation", "draft", "committee"]);

export function isHorizonEarlyWarning(item: HorizonItem): boolean {
  return EARLY_STAGES.has(item.stage);
}

export function horizonEarlyWarnings(items: HorizonItem[]): HorizonItem[] {
  return items.filter(isHorizonEarlyWarning);
}

export function horizonAlertHeadline(count: number): string {
  if (count === 0) return "No early-warning instruments in the demo backlog.";
  if (count === 1) return "1 instrument in pre-enactment review (demo early warning).";
  return `${count} instruments in pre-enactment review (demo early warnings).`;
}
