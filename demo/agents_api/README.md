# Regulatory agents API (`agents_api`)

FastAPI service implementing **Supervisor**, **SummaryAgent**, **QnAAgent**, **CompareAgent**, and **Guardrails** for the UC1/UC2 demo. n8n calls this over Docker DNS `http://agents:8000`; the Node BFF can proxy `AGENTS_URL` at `/api/agents/*`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/v1/guardrails/validate` | Input/output policy checks |
| POST | `/v1/orchestrate` | Auto intent from `user_message` (Bedrock JSON when `AGENTS_STUB_LLM=0` and `SUPERVISOR_USE_LLM` not `rules`, else keyword rules) → `qna` / `summary` / `compare` / `blocked` |
| POST | `/v1/agents/summary` | UC1-005 ingest summary from chunk delta |
| POST | `/v1/agents/qna` | UC2-002 answer over provided chunks (caller retrieves) |
| POST | `/v1/agents/compare` | UC1-004 short narrative compare |
| POST | `/v1/workflow/agentic` | Supervisor → intent 1 summary / 2 comparison / 3 QnA (runs agent when inputs are present) |
| POST | `/v1/pipelines/chat` | Hosted n8n chat: guardrails → supervisor route → (unless `force_qna`) compare/summary short reply → else Qdrant scroll → rank → QnA → citations |

Optional body field **`force_qna`** (default `false`): when `true`, skips the compare/summary keyword short-circuit and always runs retrieve → QnA (useful for the web Agents tab demos).

**Agentic workflow** (`POST /v1/workflow/agentic`): if the supervisor picks **compare** or **summary** but `compare_context` / `summary_context` is missing and **`document_url`** is set, the service **falls back to QnA** (retrieve → answer) and sets **`fallback_from`** to `compare` or `summary` while keeping **`supervisor_route`** as the original branch. If the supervisor returns **`blocked`** but **`document_url`** is set (and the message is not empty), the workflow **still runs QnA** with **`fallback_from`:** `blocked` (LLM “ambiguous” blocks are overridden in `classify_intent` by keyword rules when possible).

When **`compare_context`** includes baseline + current full text, questions that clearly ask for a **side-by-side / page-wise / redline** style view still run **CompareAgent** even if **`force_qna`** is `true` (Agents tab default), so chat does not pretend a chunk-only answer is a full diff.

## Environment

| Variable | Default | Notes |
|----------|---------|--------|
| `AGENTS_STUB_LLM` | `1` | When `1`, Bedrock is skipped and stub text is returned. |
| `SUPERVISOR_USE_LLM` | `auto` | Intent from user query: `auto` uses Bedrock JSON routing when `AGENTS_STUB_LLM=0`, else keyword rules. `llm` / `1` always tries LLM first (falls back to rules if JSON invalid). `rules` / `0` forces keyword rules only. |
| `WORKFLOW_ENGINE` | `langgraph` | Orchestration engine for `POST /v1/workflow/agentic`. `langgraph` runs the LangGraph state graph (`app.agents.workflow_graph`); `legacy` runs the original hand-rolled async dispatcher. Both engines return the same `AgenticWorkflowResponse` (including `debug_trace`). |
| `AWS_REGION` | `us-east-1` | For boto3 Bedrock |
| `BEDROCK_CHAT_MODEL_ID` | `amazon.nova-pro-v1:0` | Override model id (Nova uses Converse API; `anthropic.*` uses Messages `invoke_model`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | (unset) | Optional explicit keys for local/Docker; same as standard boto3 credential chain. |

Do not commit AWS keys. Use IAM/instance role or standard AWS env vars when `AGENTS_STUB_LLM=0`. **Docker Compose** maps `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` into the `agents` service from your project `.env` when set.

## Local run

```bash
cd agents_api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
AGENTS_STUB_LLM=1 uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
cd agents_api && pytest
```

## n8n

Import [../n8n_workflow.json](../n8n_workflow.json). Ingest writes a deterministic Qdrant run id, then **HTTP: SummaryAgent** merges LLM fields. Chat uses **Response nodes** → `Code: Chat Scope` → `HTTP: ChatPipeline` → `Chat: Send Reply`.

The **orchestrate** webhook returns the raw `/v1/orchestrate` JSON (`route`, `reason`). Add your own **Switch** node in n8n if you want different HTTP branches per route (the committed workflow responds with the same JSON for all routes for simplicity).

Webhooks (after publish, base URL is your n8n host):

- `POST /webhook/regulatory-compare` — JSON body `{ "baseline_text": "...", "current_text": "..." }`
- `POST /webhook/regulatory-orchestrate` — JSON body `{ "user_message": "...", "document_url": "https://..." }`

## Re-applying workflow text / JS fragments

After editing [n8n_fragments/build_run_record.js](n8n_fragments/build_run_record.js) or [n8n_fragments/merge_llm_into_run.js](n8n_fragments/merge_llm_into_run.js):

```bash
python3 scripts/patch_n8n_workflow.py
```

Run from the `demo/` directory.
