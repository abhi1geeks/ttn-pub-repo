/** CSV 1.5 — demo early-warning notification digest (not sent by email in POC). */

import type { HorizonItem } from "../data/horizon_feed";
import { suggestDemoRoutingQueue } from "./alert_triage";

export function buildHorizonAlertPreview(items: HorizonItem[]): string {
  if (items.length === 0) {
    return "No instruments on your watchlist. Use Watch on the horizon table to subscribe (demo).";
  }

  const lines: string[] = [
    "Subject: [GLI Intelligence — DEMO] Horizon early-warning digest",
    "",
    "This is a preview only. Production would route to your team's notification channel.",
    "",
    `Instruments tracked: ${items.length}`,
    "",
    "---",
    "",
  ];

  for (const h of items) {
    const queue = suggestDemoRoutingQueue({ jurisdiction: h.jurisdiction });
    lines.push(`• ${h.jurisdiction} — ${h.instrument}`);
    lines.push(`  Stage: ${h.stage} · Next: ${h.nextMilestone}`);
    lines.push(`  Suggested routing (demo): ${queue}`);
    lines.push(`  Summary: ${h.summary}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("Open GLI Intelligence hub → Horizon scanning for full detail and ingest monitor links.");
  return lines.join("\n");
}
