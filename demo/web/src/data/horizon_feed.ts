/** CSV 1.5 Horizon Scanning — illustrative backlog (not live legislative data). */
import { DEMO_CANONICAL_PDF } from "../lib/document_url";

export type HorizonItem = {
  id: string;
  jurisdiction: string;
  instrument: string;
  stage: "consultation" | "draft" | "committee" | "enacted-pending";
  summary: string;
  nextMilestone: string;
  sourceLabel: string;
  externalUrl: string;
  /** When set, GLI hub shows “Open in ingest monitor” for this POC document. */
  monitorDocumentUrl?: string;
};

export const HORIZON_FEED: HorizonItem[] = [
  {
    id: "hz-001",
    jurisdiction: "Malta (MGA)",
    instrument: "Technical direction — RNG integrity (consultation)",
    stage: "consultation",
    summary: "Draft clarifies server-side entropy logging for remote games.",
    nextMilestone: "Comments close · demo date TBC",
    sourceLabel: "Illustrative",
    externalUrl: "https://www.mga.org.mt/",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
  {
    id: "hz-002",
    jurisdiction: "United Kingdom (UKGC)",
    instrument: "LCCP consultation — affordability checks",
    stage: "draft",
    summary: "Proposed thresholds for frictionless checks on high-velocity play.",
    nextMilestone: "Second reading · demo",
    sourceLabel: "Illustrative",
    externalUrl: "https://www.gamblingcommission.gov.uk/",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
  {
    id: "hz-003",
    jurisdiction: "Ontario (AGCO)",
    instrument: "Registrar’s standards — cyber incident reporting",
    stage: "committee",
    summary: "Aligns 24h notification with critical supplier dependencies.",
    nextMilestone: "Committee review · demo",
    sourceLabel: "Illustrative",
    externalUrl: "https://www.agco.ca/",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
  {
    id: "hz-004",
    jurisdiction: "New Jersey (DGE)",
    instrument: "Sports wagering — integrity monitoring (proposed)",
    stage: "draft",
    summary: "Adds telemetry retention for in-play anomaly scoring.",
    nextMilestone: "Public hearing window · demo",
    sourceLabel: "Illustrative",
    externalUrl: "https://www.njoag.gov/about/divisions-and-offices/division-of-gaming-enforcement-home/",
    monitorDocumentUrl: DEMO_CANONICAL_PDF,
  },
];
