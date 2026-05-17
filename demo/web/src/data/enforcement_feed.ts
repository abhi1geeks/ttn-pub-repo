/** CSV 2.5 Enforcement Actions Tracker — illustrative feed (not live enforcement data). */
import { DEMO_CANONICAL_PDF } from "../lib/document_url";

export type EnforcementAction = {
  id: string;
  jurisdiction: string;
  actionType: "fine" | "sanction" | "license-action" | "cease-desist";
  amountLabel: string;
  summary: string;
  actionDate: string;
  trendNote: string;
  /** POC ingest URL — opens ingest monitor when the demo PDF has runs. */
  monitorDocumentUrl?: string;
};

export const ENFORCEMENT_FEED: EnforcementAction[] = [
  {
    id: "enf-001",
    jurisdiction: "United Kingdom",
    actionType: "fine",
    amountLabel: "£2.3m (illustrative)",
    summary: "AML monitoring gaps on high-deposit cohorts.",
    actionDate: "2026-02-14",
    trendNote: "Stable vs prior quarter (demo)",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
  {
    id: "enf-002",
    jurisdiction: "Malta",
    actionType: "license-action",
    amountLabel: "—",
    summary: "Corrective plan for RNG change-management records.",
    actionDate: "2026-03-02",
    trendNote: "Up vs prior quarter (demo)",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
  {
    id: "enf-003",
    jurisdiction: "New Jersey",
    actionType: "fine",
    amountLabel: "$180k (illustrative)",
    summary: "Responsible-gaming cooldown breach on rapid re-entry.",
    actionDate: "2026-03-21",
    trendNote: "Stable vs prior quarter (demo)",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
  {
    id: "enf-004",
    jurisdiction: "Ontario",
    actionType: "cease-desist",
    amountLabel: "—",
    summary: "Unlicensed affiliate traffic to grey-market skins.",
    actionDate: "2026-04-05",
    trendNote: "New category this quarter (demo)",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
];
