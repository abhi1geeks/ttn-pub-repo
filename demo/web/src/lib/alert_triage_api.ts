/** POST /v1/agents/alert-triage — shared by CSV 1.3 UI and auto-triage after impact summary. */

export type AlertTriageRequest = {
  materiality_score?: number;
  executive_summary?: string;
  materiality_notes?: string;
  product_line?: string;
  jurisdiction?: string;
  effective_date?: string;
  new_chunks?: number;
  removed_chunks?: number;
};

export type AlertTriageResponse = {
  relevanceTier?: string;
  relevance_tier?: string;
  routingQueue?: string;
  routing_queue?: string;
  tags?: string[];
  rationale?: string;
  stub?: boolean;
};

export async function postAlertTriage(body: AlertTriageRequest): Promise<AlertTriageResponse> {
  const r = await fetch("/api/agents/v1/agents/alert-triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 400) || r.statusText);
  return JSON.parse(text) as AlertTriageResponse;
}
