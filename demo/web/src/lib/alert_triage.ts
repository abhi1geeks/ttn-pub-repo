/** Demo heuristics for CSV 1.3 — AI-Powered Alert Scoring & Tagging (routing suggestion only). */

export type RelevanceTier = "high" | "medium" | "low" | "unknown";

/** Map UC1-005 SummaryAgent materiality (1–5) to alert tier for CSV 1.3 UI. */
export function relevanceTierFromMateriality(score: number | null | undefined): RelevanceTier {
  if (score == null || Number.isNaN(score)) return "unknown";
  if (score >= 4) return "high";
  if (score === 3) return "medium";
  return "low";
}

export function relevanceLabel(tier: RelevanceTier): string {
  switch (tier) {
    case "high":
      return "High relevance (demo tier)";
    case "medium":
      return "Medium relevance (demo tier)";
    case "low":
      return "Low relevance (demo tier)";
    default:
      return "Not scored yet";
  }
}

export function suggestDemoRoutingQueue(meta: {
  productLine?: string | null;
  jurisdiction?: string | null;
}): string {
  const pl = String(meta.productLine ?? "").toLowerCase();
  const ju = String(meta.jurisdiction ?? "").toLowerCase();
  if (pl.includes("online") || ju.includes("malta") || ju.includes("uk") || ju.includes("jersey")) {
    return "Online gaming lab · queue B";
  }
  if (pl.includes("slot") || pl.includes("system") || pl.includes("rng") || ju.includes("nevada")) {
    return "Systems & RNG lab · queue A";
  }
  return "Central regulatory monitoring · queue A";
}

export function topicTagsFromRun(meta: {
  productLine?: string | null;
  jurisdiction?: string | null;
  effectiveDate?: string | null;
}): string[] {
  const tags: string[] = [];
  const ju = String(meta.jurisdiction ?? "").trim();
  const pl = String(meta.productLine ?? "").trim();
  const ed = String(meta.effectiveDate ?? "").trim();
  if (ju) tags.push(`Jurisdiction: ${ju}`);
  if (pl) tags.push(`Product line: ${pl}`);
  if (ed) tags.push(`Effective: ${ed}`);
  tags.push("Topic: regulatory change");
  return tags;
}
