# Refined GLI stakeholder requirement (POC-ready)

| Field | Value |
| --- | --- |
| **Audience** | Sales, Business, Tech |
| **Version** | 1.1 |
| **Last updated** | Sunday, May 10, 2026 |
| **Workspace root** | `research/` — **self-contained**. Everything Tech needs to build the POC ships (or is shipped by Tech) under this folder. No dependency on any pre-existing repo file. |
| **Companion files** | [`refined_client_requirement_features.csv`](refined_client_requirement_features.csv) — row-aligned feature catalog (`feature_id` matches tables below) · [`poc_low_level_architecture.md`](poc_low_level_architecture.md) — low-level technical blueprint · [`poc_low_level_architecture.csv`](poc_low_level_architecture.csv) — component inventory mirror |
| **Research input** | [`regology_research.md`](regology_research.md) — competitive/inspiration analysis (Regology-style regulatory intelligence loop) |

**Sources of truth used.** This document synthesizes the authoritative **problem statement** supplied by stakeholders (710+ jurisdictions; Detect → Understand → Update GLIAccess → Notify) with implementation insights from [`regology_research.md`](regology_research.md).

**Explicitly excluded.** Earlier scope briefs that lived in the parent repo are **deprecated** for this artifact. The authoritative scope is the stakeholder problem statement summarized below; everything Tech needs is shipped under `research/`.

---

## Table of contents

1. [Executive summary](#1-executive-summary-read-by-salesbusiness-first)
2. [POC scope contract (2–3 days)](#2-poc-scope-contract-23-days)
3. [Use Case 1 — Regulatory Change Monitoring (spine)](#3-use-case-1--regulatory-change-monitoring-spine)
4. [Use Case 2 — Multi-jurisdiction knowledge & cited Q&A](#4-use-case-2--multi-jurisdiction-knowledge--cited-qa)
5. [Use Case 3 — Horizon scanning](#5-use-case-3--horizon-scanning)
6. [Cross-cutting requirements](#6-cross-cutting-requirements)
7. [Risks & mitigations](#7-risks--mitigations)
8. [Day 1 / Day 2 / Day 3 plan](#8-day-1--day-2--day-3-plan)
9. [One-page demo script](#9-one-page-demo-script)
10. [Roadmap (post-POC)](#10-roadmap-post-poc)
11. [CSV companion — column rationale](#11-csv-companion--column-rationale)
12. [References](#12-references)

---

## 1. Executive summary (read by Sales/Business first)

GLI operates across **710+ gaming jurisdictions**. Each jurisdiction publishes its own standards — device/software certification rules, submission formats, documentation expectations, and test criteria. When regulations change, GLI must **detect** the change, **interpret** what moved and what it means operationally, **update** the corresponding artifacts in **GLIAccess** (requirements, templates, documentation, test criteria), and **notify** the right audiences — GLI staff, operators, and regulators.

Today that loop is largely **manual**: specialists monitor sources, read diffs, interpret impact, and hand-edit GLIAccess content. Even if only **5–10%** of jurisdictions publish meaningful updates in a given quarter, that implies roughly **35–70 discrete change events per quarter** — each requiring reading, judgment, and downstream content edits. At that scale, latency and inconsistency become business risk: missed updates, delayed certifications, and reactive firefighting instead of proactive compliance alignment.

**Opportunity.** Automate the **core loop** using an agentic pipeline (scheduler + ingestion + change detection + human review + system-of-record sync + notifications), augmented by **retrieval-grounded GenAI** for summarization, relevance triage, and draft updates — following patterns validated by regulatory-intelligence platforms (see [`regology_research.md`](regology_research.md)), adapted for gaming specificity (GLI standards, product lines, GLIAccess artifact types).

**POC promise (2–3 days).** Deliver a **working end-to-end slice** for **two public jurisdictions** (default: **Nevada + New York**) that proves the loop on **ground-truth edits**: detect a simulated regulatory change, show a reviewer **what changed and why it matters**, produce a **cited draft update** aligned to GLIAccess-style artifacts, **push an approved package** to SharePoint via MCP (standing in for GLIAccess workflow storage), and **notify** stakeholders. Layer **thin demos** of cited internal Q&A and a **horizon-scanning card** so leadership sees the adjacent roadmap without blocking the spine.

**Pitch in under two minutes.** *"We shrink manual regulatory churn from dozens of multi-hour events per quarter into a tracked, reviewable pipeline — same-day detection and drafted updates with citations, instead of teams re-reading whole PDFs and guessing impact."*

---

## 2. POC scope contract (2–3 days)

### 2.1 Priority legend

| Priority | Meaning | Cut rule |
| --- | --- | --- |
| **Must** | Demo fails without it | Do not drop |
| **Should** | High value; include if Day 2–3 allows | Drop only if time-critical |
| **Stretch** | Shows roadmap depth | Drop first under pressure |

### 2.2 Definition of Done (POC)

- **UC1 spine:** For NV + NY baseline content, the system **detects** a change against stored baseline, presents a **human-readable diff**, attaches **AI-assisted relevance + summary** (with citations to source text), supports **approve/dismiss**, produces a **draft GLIAccess-aligned update package**, on approve performs **SharePoint MCP push** (idempotent where possible), emits **audit events**, and sends at least one **notification** (email or Teams webhook).
- **UC2:** At least one **natural-language question** answered from a **small curated corpus** with **mandatory inline citations** (Reggi-style pattern per research).
- **UC3:** At least one **horizon artifact** (e.g., a tracked bill or “coming soon” regulation card) visible in UI — **manual seed acceptable** for POC.

### 2.3 Out of scope for this POC

- Full **710-jurisdiction** coverage, continuous bill-tracking production feeds, **SOC 2** certification, **sales-intelligence / competitor scrapers**, **enterprise translation** pipelines, **90%+ accuracy** guarantees on chatbot answers — all **roadmap** (§10).

### 2.4 Tech implementation pointers (Day-1 start)

The POC is built **from scratch under `research/`**. Canonical low-level detail lives in [`poc_low_level_architecture.md`](poc_low_level_architecture.md) (component inventory, diagrams, Day-1 boot checklist) and [`poc_low_level_architecture.csv`](poc_low_level_architecture.csv) (sortable component mirror). The relational schema is shipped at [`migrations/001_init.sql`](migrations/001_init.sql). Tech may swap components with equivalent tools as long as new artifacts continue to live under `research/`.

| Area | Pointer |
| --- | --- |
| **Orchestration** | **n8n** container shipped via `research/infra/docker-compose.yml`; flows authored in the n8n UI (`http://localhost:5678`) and exported to `research/n8n/workflows/` (Day-1 step 6 in the architecture doc). |
| **Embeddings / vectors** | **Qdrant** container in the same compose file — dashboard `http://localhost:6333/dashboard`. Day-1 boot creates `regulatory_docs` and `regulatory_change_log` collections (1024-dim Cosine). |
| **Review UI** | **Streamlit** app shipped under `research/ui/` with tabs `Review`, `Draft Preview`, `Horizon`, `Health`, `Chat`; reads SQLite + Qdrant directly. |
| **Baseline sources (POC)** | Nevada statutes/regulations hub: `https://www.gaming.nv.gov/regulations/gaming-statutes-regulations/`. New York: any public gaming regulatory portal your team already trusts for demos. |
| **Ground-truth edits** | Place **baseline + amended** regulatory excerpts under `research/seeds/baseline/<jurisdiction>/` and `research/seeds/simulated/<jurisdiction>/` — deterministic demo without relying on live site changes. |
| **SharePoint** | Use **SharePoint MCP** from the approved Cursor/tooling stack; configure folder IDs / drive paths via `research/.env` (do not commit secrets). Push **Markdown or DOCX packages** produced from approved drafts. |
| **LLM** | **AWS Bedrock** (Titan Text Embeddings v2 + Claude 3.5 Sonnet) is the recommended default — auth via `research/.env` (`N8N_AWS_*`); log **model ID + prompt version** per XC-003. |

---

## 3. Use Case 1 — Regulatory Change Monitoring (spine)

### 3.1 Objective

Provide an automated **Detect → Understand → Update GLIAccess → Notify** pipeline that reduces manual monitoring and interpretation workload, accelerates consistent updates to certification artifacts, and creates an auditable trail for leadership and regulators.

### 3.2 Feature table

`feature_id` values tie each row to [`refined_client_requirement_features.csv`](refined_client_requirement_features.csv).

| Feature | Description | Business impact | POC depth (2–3 days) |
| --- | --- | --- | --- |
| **UC1-001** Scheduled ingest (orchestrator) | Run N8N (or equivalent) on a cadence per source; fetch regulator HTML/PDF; store raw snapshot + hash. | Eliminates ad-hoc manual checks; proves repeatable monitoring. | **Must** — Day 1 |
| **UC1-002** Baseline library + metadata | Versioned documents per jurisdiction with fields: source URL, fetched_at, content_hash, effective_date (if known). | Makes changes attributable and replayable for audits. | **Must** — Day 1 |
| **UC1-003** Change detection (embedding + diff signal) | Chunk text/embeddings vs prior baseline to flag *that* something moved; optional keyword flags. | Surfaces material updates without rereading entire libraries. | **Must** — Day 1 |
| **UC1-004** Readable structural diff | Section/clause-level side-by-side or redline view (not blob-vs-blob only). | Leaders see *exactly* what changed — faster trust and approval. | **Should** — Day 1–2 |
| **UC1-005** LLM relevance score + summary | Small model scores materiality to GLI; outputs plain-English “what changed / why it matters” with quotes. | Cuts reviewer queue noise — biggest daily savings vs naive diff lists. | **Should** — Day 2 |
| **UC1-006** HITL review queue | Approve / dismiss / assign; capture reviewer identity + timestamp + optional reason. | Keeps humans accountable; avoids blind automation (Regology-style HITL). | **Must** — Day 2 |
| **UC1-007** Draft GLIAccess update package | Generate proposed edits to certification requirements, submission templates, doc checklist, test criteria — **with citations** to source clauses. | Turns detection into **actionable artifact updates** instead of another email thread. | **Should** — Day 2 |
| **UC1-008** SharePoint MCP publish | On approval, push structured update package to designated folder/library via MCP; retry-safe. | Demonstrates **system-of-record handoff** without custom GLIAccess API in POC. | **Must** — Day 3 |
| **UC1-009** Stakeholder notifications | Email and/or Teams webhook with role-specific templates (staff vs operator vs regulator placeholders). | Right people learn fast — reduces operational lag and surprise audits. | **Should** — Day 3 |
| **UC1-010** Notification localization stub | Same templates with EN-only for POC; optional ES toggle if time (dictionary-driven static spans locked). | Shows path to global ops without blocking spine. | **Stretch** — Day 3 |

### 3.3 Numbered end-to-end flow (trigger → outcome)

Maps directly to the four problem-statement steps.

1. **Detect:** Scheduler runs → fetch regulator source → normalize text → compute hash; if hash differs from baseline, create **ChangeEvent** linked to jurisdiction + document IDs (**UC1-001–003**).
2. **Understand:** Run diff + optional LLM layer → produce **redline view**, **relevance score**, and **cited summary** of operational meaning (**UC1-004–005**).
3. **Update GLIAccess:** Reviewer opens queue → **approve** triggers draft generator → outputs **GLIAccess-aligned package** (requirements / templates / docs / test criteria sections) with citations → second human glance optional in POC → **SharePoint MCP push** stores approved package (**UC1-006–008**).
4. **Notify:** Notification service sends role-based messages referencing ChangeEvent ID + links to stored artifacts (**UC1-009–010**).
5. **Audit:** Every step emits structured audit events (who/when/what/hash) for demonstrability (**cross-cutting**).

---

## 4. Use Case 2 — Multi-jurisdiction knowledge & cited Q&A

### 4.1 Objective

Give compliance and lab staff **instant, trustworthy answers** across jurisdictions by combining regulatory text, GLI standards excerpts, and internal policy snippets — with **mandatory citations** (Reggi-style pattern from [`regology_research.md`](regology_research.md) §5–6).

### 4.2 Feature table

| Feature | Description | Business impact | POC depth (2–3 days) |
| --- | --- | --- | --- |
| **UC2-001** Curated mini-corpus | NV/NY regulatory excerpts + small GLI standard snippets + optional SharePoint sample PDFs. | Makes RAG demo trustworthy and bounded. | **Must** — Day 3 |
| **UC2-002** Retrieval + GenAI answer | User question → retrieve top chunks → LLM answer with **inline citation markers** linking to stored chunks. | Cuts research time; reduces wrong guidance risk. | **Should** — Day 3 |
| **UC2-003** Product-line filters | Tag chunks by product family (e.g., iGaming, VLT) for scoped queries. | Matches how teams actually work; improves precision. | **Stretch** — Day 3 |

### 4.3 Numbered end-to-end flow

1. User opens **Research / Ask** panel → enters natural-language question (e.g., testing obligations for Nevada slots).
2. System retrieves ranked chunks from curated stores (**UC2-001**).
3. LLM generates answer **only** with citations pointing to chunk IDs / URLs (**UC2-002**).
4. User expands citations to verify primary sources (trust loop).
5. Optional filter narrows by product line (**UC2-003**).

---

## 5. Use Case 3 — Horizon scanning

### 5.1 Objective

Provide **early warning** of forthcoming regulatory changes (bills, draft rules) so GLI can **pre-position** GLIAccess updates and customer communications before deadlines hit — mirroring Regology’s horizon-scanning pattern ([`regology_research.md`](regology_research.md) §5.2, §6.2).

### 5.2 Feature table

| Feature | Description | Business impact | POC depth (2–3 days) |
| --- | --- | --- | --- |
| **UC3-001** Horizon backlog UI | Single list/card showing “upcoming” items with status (introduced, committee, enacted). | Leadership sees proactive posture vs reactive scramble. | **Should** — Day 3 |
| **UC3-002** Seeded bill / proposal record | For POC, **manually seed** 1–2 representative bills or proposals with metadata + link-out. | Proves UX + notification wiring without building 50-state scrapers. | **Must** — Day 3 |
| **UC3-003** Automated bill ingestion | Scheduled scraper/API for bill status | At scale, removes manual bill tracking | **Stretch** — roadmap |

### 5.3 Numbered end-to-end flow

1. Compliance adds **seed horizon item** (bill ID, jurisdiction, title, status URL) (**UC3-002**).
2. Item appears in **Horizon** tab sorted by status (**UC3-001**).
3. When linked regulation changes later, user promotes item into UC1 ChangeEvent (manual link in POC).

---

## 6. Cross-cutting requirements

| Requirement | Description | POC handling |
| --- | --- | --- |
| **XC-001 Human-in-the-loop (HITL)** | No AI-only publish to SharePoint / external stakeholders; humans approve regulated artifacts. | Enforced in UC1 review gates (**UC1-006**). |
| **XC-002 Mandatory citations** | Any LLM-generated summary or draft must cite retrieved text spans or clause IDs. | UC1-005/007, UC2-002. |
| **XC-003 Audit trail & evidence locker** | Immutable-ish log: fetch hashes, model IDs, reviewer actions, SharePoint version IDs. | Minimal append-only log + export acceptable for POC. |
| **XC-004 Source-health monitoring** | Track last success per URL, HTTP codes, parse success rate. | Simple green/yellow/red dashboard or table — **Should** if time (else roadmap). |
| **XC-005 Security posture** | Directionally align with SOC 2 / Responsible AI patterns from research — document gaps honestly. | Narrative + checklist; full SOC 2 **roadmap**. |

---

## 7. Risks & mitigations

| Risk | Impact | Mitigation (POC) |
| --- | --- | --- |
| **False negatives** (missed change) | Compliance gap | Hash + embedding signals + manual seed tests each morning of demo |
| **False positives / noise** | Reviewer fatigue | LLM relevance scoring + thresholds (**UC1-005**) |
| **LLM hallucination in drafts** | Wrong certification guidance | Mandatory citations + HITL + restrict drafts to retrieved clauses (**XC-002**) |
| **SharePoint MCP failures** | Broken handoff | Retry + idempotent doc naming + surfaced error to reviewer |
| **Scope creep across UC2/UC3** | Miss spine demo | Must/should/stretch discipline (§2) |

---

## 8. Day 1 / Day 2 / Day 3 plan

| Day | Focus | Measurable outcome | Demo-ready artifact |
| --- | --- | --- | --- |
| **Day 1** | **Detect + baseline + diff** | Running ingest + stored baselines for NV + NY; ground-truth edit triggers ChangeEvent; readable diff renders | Change log UI / list with redline preview |
| **Day 2** | **Understand + HITL + draft package** | Relevance score + summary + cited draft GLIAccess sections; approve/dismiss captured | Review screen + draft preview JSON/Markdown |
| **Day 3** | **Update + notify + audit + thin UC2/UC3** | SharePoint MCP push succeeds; Teams/email fires; audit entries exist; one cited Q&A answer; one horizon card | Full scripted demo run |

---

## 9. One-page demo script

**Audience:** Business leadership + Tech leads — **10 minutes live**, **2 minutes narrated exec summary**.

| Step | Speaker cue | System action |
| --- | --- | --- |
| 1 | “A regulator updates language affecting slot certification.” | Show **ChangeEvent** fired from seeded NV/NY baseline modification (**UC1-003–004**). |
| 2 | “We instantly see what moved.” | Expand **redline** + **LLM summary** + relevance meter (**UC1-004–005**). |
| 3 | “Compliance stays in control.” | Open **HITL** queue → **Approve** with comment (**UC1-006**). |
| 4 | “We draft GLIAccess-ready updates, cited.” | Show **draft package** sections for requirements/templates/tests (**UC1-007**). |
| 5 | “Approved content lands in SharePoint.” | Trigger **SharePoint MCP** upload; show stored file + version (**UC1-008**). |
| 6 | “Stakeholders get targeted alerts.” | Show Teams/email preview referencing ChangeEvent ID (**UC1-009**). |
| 7 | “Staff can ask questions with citations.” | Ask UC2 panel question → answer lists **citations** (**UC2-002**). |
| 8 | “We monitor what’s coming.” | Show **Horizon** card for seeded bill (**UC3-001–002**). |
| 9 | “Everything is auditable.” | Export **audit trail** snippet (**XC-003**). |

Closing line: *“This is the automation path for the 35–70 quarterly manual events — starting with two jurisdictions and scaling the playbook.”*

---

## 10. Roadmap (post-POC)

Items below are **explicitly beyond** the 2–3 day POC but justified by [`regology_research.md`](regology_research.md) §8.

| Item | Effort | Business justification |
| --- | --- | --- |
| Full **standards-mapping graph** (clause ↔ GLI-11/13/19 ↔ product type) | **M/L** | Auto-impact analysis across GLIAccess surfaces |
| **Automated bill / agency feeds** at scale | **M** | True horizon scanning vs seeded cards |
| **Multi-channel stakeholder digests** + regulator portals | **M** | Matches enterprise notification maturity |
| **Localization** with gaming term dictionary | **M** | Non-English jurisdictions + operator communications |
| **Sales-signal agent** (market entrants) | **M** | Revenue intelligence — separate pipeline |
| **SOC 2 / formal AI governance** | **L** | Required before wide production + customer trust |
| **Expand sources toward 710 jurisdictions** with ops playbook | **L** | Core long-term ROI |

---

## 11. CSV companion — column rationale

The companion file [`refined_client_requirement_features.csv`](refined_client_requirement_features.csv) duplicates every **feature row** from the markdown tables for sorting/filtering in Excel/Sheets.

| Column | Purpose |
| --- | --- |
| `use_case` | UC1 / UC2 / UC3 / XC |
| `feature_id` | Stable ID matching bold IDs in §3–§6 (e.g., **UC1-001**) |
| `feature` | Short name |
| `description` | Engineering-ready scope note |
| `business_impact` | Non-technical value statement |
| `priority` | must / should / stretch |
| `poc_in_2_3_days` | yes / partial / no |
| `effort_S_M_L` | Relative build size |
| `dependencies` | Other feature IDs or external systems |
| `owner_team` | Sales / Business / Tech — **who cares most for sign-off** |
| `notes` | Demo tips, defaults, roadmap pointers |

---

## 12. References

- [`regology_research.md`](regology_research.md) — Regology platform patterns, pricing context, suggested GLI extras (§8), risks (§9).
- **Stakeholder problem statement (canonical):** GLI must **Detect**, **Understand**, **Update GLIAccess**, **Notify** across **710+ jurisdictions**; ~**35–70 manual change events per quarter** at 5–10% quarterly churn — automation path required.

---

**End of document.**
