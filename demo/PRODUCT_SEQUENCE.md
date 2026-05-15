# Outcome-first delivery sequence

Prioritized for **reviewer trust**, **single source of truth**, and **evidence-first** UX. Each phase has a user-visible outcome, not only engineering tasks.

| Phase | Outcome (what the user experiences) | Acceptance (high level) | Status |
|-------|-------------------------------------|-------------------------|--------|
| **1** | Reviewer actions **survive refresh and are shared** with anyone reading the same Qdrant runs | Acknowledge / Flag / Clear writes **`hitlReview`** on the run point; optional note; n8n merge/re-ingest **preserves** `hitlReview` when rewriting payload | **Shipped in repo** (web `POST /api/runs/review`, UI, n8n fragments + patched workflow) |
| **2** | **One impact story** per run — no “session vs database” confusion | After “Generate impact summary”, user sees **Saved on run** (or explicit merge path via n8n); reload shows same text | Planned |
| **3** | **Answer → evidence** in one click | From Agents answer, jump to cited chunk (or run) on Document / Live index tab | Planned |
| **4** | **Trust the pipe** — sources are not silently stale | Per URL: last ingest OK / last error / age (minimal health strip) | **Partial** — `sourceIngest` + HTTP metadata on run + digest card; full “health strip” per URL TBD |
| **5** | **Scoped answers** | Filter retrieval by product line / tag when metadata exists | Planned |
| **6** | Horizon / bills backlog | Cards + seeds + automation (UC3) — only after phases 1–4 feel solid | Deferred |

## Phase 1 — HITL + audit slice (XC-003 starter)

- **User story:** As a reviewer, when I acknowledge or flag an ingest run, I want that decision stored **on the run record** so my teammate sees the same state and I see it after refresh.
- **Notes:** POC has no signed-in user; `hitlReview.source` is `regulatory-web`. Optional `reason` for follow-up. Re-run n8n that **fully replaces** a run payload without merging can still drop fields — fragments were updated to re-attach `hitlReview` when possible.

## Phase 2 — UC1-005 single source of truth

- **User story:** As a reviewer, I want the materiality summary I generated to be **the** copy on the run, not a ghost in my browser tab.
- **Engineering options:** n8n upsert after SummaryAgent (already partially there) + UI refresh; or BFF POST to merge LLM fields (guardrails + auth if exposed).

## Phase 3 — UC2-002 + XC-002

- **User story:** As an analyst, when the agent cites chunk 7, I want to **open** chunk 7 in context without manual search.

## Phase 4 — XC-004

- **User story:** As a lead, I want to see **when** we last successfully fetched each canonical URL and whether the last run failed.

## References

- Feature matrix: `usecase.csv`
- Qdrant run payload shape: n8n `Build & Write Run Record` / `Code: Merge LLM Into Run`
