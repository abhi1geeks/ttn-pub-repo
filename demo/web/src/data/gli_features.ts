/**
 * GLI AI Intelligence product map — aligned to `GLI AI Inteligence .csv` columns:
 * Module, Feature Name, Description / How It Works, Why GLI Needs It
 */
export type GliFeatureRow = {
  id: string;
  module: string;
  featureName: string;
  description: string;
  whyGliNeedsIt: string;
};

export const GLI_LIBRARY_CAPACITY_NOTE =
  "Production vision: 475+ curated sources. This POC demonstrates hierarchy, metadata, and ingest UX on a representative subset.";

export const GLI_FEATURES: GliFeatureRow[] = [
  {
    id: "1.1",
    module: "Regulatory Change Monitoring",
    featureName: "Smart Regulatory Source Library",
    description:
      "Pre-configured monitoring of 475+ gaming jurisdiction sources. Team can add/remove sources. Organised by region > country > jurisdiction > regulatory body.",
    whyGliNeedsIt: "Replaces manual checking of hundreds of regulatory websites daily",
  },
  {
    id: "1.2",
    module: "Regulatory Change Monitoring",
    featureName: "Automated Change Detection",
    description:
      "Crawls all configured sources at defined intervals. Detects additions, amendments, repeals. Redlined diff view showing exactly what changed between versions.",
    whyGliNeedsIt: "Instant visibility into changes without reading full documents",
  },
  {
    id: "1.3",
    module: "Regulatory Change Monitoring",
    featureName: "AI-Powered Alert Scoring & Tagging",
    description:
      "Each change auto-scored for relevance to GLI's certification scope. Auto-tagged by jurisdiction, game type, regulatory topic. Alerts routed to right team.",
    whyGliNeedsIt: "Ensures only relevant alerts reach the right desk",
  },
  {
    id: "1.4",
    module: "Regulatory Change Monitoring",
    featureName: "Version History & Audit Trail",
    description:
      "Every version of every monitored document stored with timestamps. Full history accessible for any jurisdiction. Exportable as evidence for certification audits.",
    whyGliNeedsIt: "Critical for maintaining credibility as a certification body",
  },
  {
    id: "1.5",
    module: "Regulatory Change Monitoring",
    featureName: "Horizon Scanning",
    description:
      "Tracks proposed bills, draft regulations, consultation papers before they become law. Sends early-warning alerts so testing teams can prepare in advance.",
    whyGliNeedsIt: "Proactive preparation before a new regulation takes effect",
  },
  {
    id: "2.1",
    module: "AI Research & Intelligence",
    featureName: "Plain Language Regulatory Summaries",
    description:
      "AI auto-summarises any regulatory document in plain English. Highlights what changed, what it means, and what action is required. Available in multiple languages.",
    whyGliNeedsIt: "Faster interpretation across multilingual global teams",
  },
  {
    id: "2.2",
    module: "AI Research & Intelligence",
    featureName: "GLI RegGPT — Conversational AI Assistant",
    description:
      "Chat interface trained on GLI's entire monitored regulatory library. Staff ask plain-language questions and get answers with citations. Scoped to curated document set only.",
    whyGliNeedsIt: "Replaces hours of manual research with instant accurate answers",
  },
  {
    id: "2.3",
    module: "AI Research & Intelligence",
    featureName: "Cross-Jurisdictional Comparison",
    description:
      "Side-by-side comparison of regulations across multiple jurisdictions on one screen. Example: Compare responsible gaming requirements across UK, Malta, and New Jersey. Exportable as tables.",
    whyGliNeedsIt: "Accelerates advisory work across multiple markets",
  },
  {
    id: "2.4",
    module: "AI Research & Intelligence",
    featureName: "Regulatory Gap Analysis",
    description:
      "Compares a gaming product's current certification against new/updated regulations. Flags gaps where recertification may be needed. Generates gap report with recommended actions.",
    whyGliNeedsIt: "Directly supports GLI's core certification business",
  },
  {
    id: "2.5",
    module: "AI Research & Intelligence",
    featureName: "Enforcement Actions Tracker",
    description:
      "Monitors regulatory enforcement actions, fines, and sanctions issued globally. Provides trend analysis showing which jurisdictions are increasing enforcement activity.",
    whyGliNeedsIt: "Helps GLI advise clients on high-risk markets",
  },
];

export function groupFeaturesByModule(rows: GliFeatureRow[]): Map<string, GliFeatureRow[]> {
  const m = new Map<string, GliFeatureRow[]>();
  for (const r of rows) {
    const list = m.get(r.module) ?? [];
    list.push(r);
    m.set(r.module, list);
  }
  return m;
}
