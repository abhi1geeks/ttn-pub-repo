/** CSV export for horizon (1.5) and enforcement (2.5) illustrative feeds. */

import type { EnforcementAction } from "../data/enforcement_feed";
import type { HorizonItem } from "../data/horizon_feed";
import { parseTrendDirection } from "./enforcement_trends";
import { csvRow } from "./csv_util";

export function buildHorizonFeedCsv(items: HorizonItem[]): string {
  const header = [
    "id",
    "jurisdiction",
    "stage",
    "instrument",
    "summary",
    "next_milestone",
    "source_label",
    "external_url",
    "monitor_document_url",
  ];
  const rows = items.map((h) =>
    csvRow([
      h.id,
      h.jurisdiction,
      h.stage,
      h.instrument,
      h.summary,
      h.nextMilestone,
      h.sourceLabel,
      h.externalUrl,
      h.monitorDocumentUrl ?? "",
    ]),
  );
  return [csvRow(header), ...rows].join("\n");
}

export function buildEnforcementFeedCsv(actions: EnforcementAction[]): string {
  const header = [
    "id",
    "action_date",
    "jurisdiction",
    "action_type",
    "summary",
    "amount_label",
    "trend_note",
    "trend_direction_demo",
    "monitor_document_url",
  ];
  const rows = actions.map((e) =>
    csvRow([
      e.id,
      e.actionDate,
      e.jurisdiction,
      e.actionType,
      e.summary,
      e.amountLabel,
      e.trendNote,
      parseTrendDirection(e.trendNote),
      e.monitorDocumentUrl ?? "",
    ]),
  );
  return [csvRow(header), ...rows].join("\n");
}
