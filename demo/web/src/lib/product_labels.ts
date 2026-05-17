/** User-facing labels derived from the product map (internal ids stay in gli_features / usecase.csv). */

import { GLI_FEATURES, type GliFeatureRow } from "../data/gli_features";

const BY_ID = new Map<string, GliFeatureRow>(GLI_FEATURES.map((r) => [r.id, r]));

export const INGEST_WORKFLOW_PHRASE = "ingest workflow";

export function featureById(id: string): GliFeatureRow | undefined {
  return BY_ID.get(id);
}

export function featureDisplayName(id: string): string {
  return BY_ID.get(id)?.featureName ?? humanizeId(id);
}

/** Hub section headers and panel kickers. */
export function sectionTitle(id: string): string {
  return featureDisplayName(id);
}

function humanizeId(id: string): string {
  return id.replace(/\./g, " ").trim() || "Feature";
}
