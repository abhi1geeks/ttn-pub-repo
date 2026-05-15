#!/usr/bin/env python3
"""Patch demo/n8n_workflow.json: agents wiring, deterministic run ids, chat pipeline."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / "n8n_workflow.json"
FRAG = ROOT / "n8n_fragments"


def main() -> None:
    wf = json.loads(WF.read_text())
    nodes = wf["nodes"]

    build_js = (FRAG / "build_run_record.js").read_text()
    merge_js = (FRAG / "merge_llm_into_run.js").read_text()
    chunk_js = (FRAG / "chunk_and_hash.js").read_text()
    compute_js = (FRAG / "compute_diff.js").read_text()
    build_point_js = (FRAG / "build_qdrant_point.js").read_text()
    provenance_js = (FRAG / "ingest_provenance.js").read_text()

    for n in nodes:
        if n.get("name") == "Build & Write Run Record":
            n["parameters"]["jsCode"] = build_js
        if n.get("name") == "Chunk + Hash":
            n["parameters"]["jsCode"] = chunk_js
        if n.get("name") == "Compute Diff":
            n["parameters"]["jsCode"] = compute_js
        if n.get("name") == "Build Qdrant Point":
            n["parameters"]["jsCode"] = build_point_js
        if n.get("name") == "Code: Ingest Provenance":
            n["parameters"]["jsCode"] = provenance_js
        if n.get("name") == "Download PDF":
            inner = (
                n.setdefault("parameters", {})
                .setdefault("options", {})
                .setdefault("response", {})
                .setdefault("response", {})
            )
            inner["responseFormat"] = "file"
            inner["fullResponse"] = True
        if n.get("name") == "Set Config":
            assigns = n["parameters"]["assignments"]["assignments"]
            names = {a["name"]: a for a in assigns}
            for key in ("awsAccessKeyId", "awsSecretAccessKey"):
                if key in names:
                    names[key]["value"] = ""
            extra = [
                {"id": "n-qr", "name": "qdrantRunsCollection", "value": "regulatory_docs_runs", "type": "string"},
                {"id": "n-qk", "name": "qdrantApiKey", "value": "", "type": "string"},
                {"id": "n-ag", "name": "agentsApiUrl", "value": "http://agents:8000", "type": "string"},
                {"id": "n-st", "name": "awsSessionToken", "value": "", "type": "string"},
                {"id": "n-pl", "name": "productLine", "value": "default", "type": "string"},
                {"id": "n-jd", "name": "jurisdiction", "value": "", "type": "string"},
                {"id": "n-ed", "name": "effectiveDate", "value": "", "type": "string"},
            ]
            existing = {a["name"] for a in assigns}
            for e in extra:
                if e["name"] not in existing:
                    assigns.append(e)
        if n.get("name") == "Chat Trigger":
            n["typeVersion"] = 1.3
            n["parameters"] = {
                "public": True,
                "mode": "hostedChat",
                "authentication": "none",
                "availableInChat": False,
                "options": {"responseMode": "responseNodes"},
            }
        if n.get("name") == "Section: RAG":
            n["parameters"]["content"] = (
                "## RAG CHAT (retrieve-then-agent)\n\n"
                "Hosted chat uses **Response nodes**: `Code: Chat Scope` → `HTTP: ChatPipeline` "
                "(POST /v1/pipelines/chat on the agents service) → **Chat** node.\n"
                "Legacy LangChain nodes below are **disconnected**; keep for reference or delete in UI.\n\n"
                "**Webhooks**: `POST /webhook/regulatory-compare` and `POST /webhook/regulatory-orchestrate` "
                "call the agents service (compare + orchestrate); orchestrate response is the JSON body from `/v1/orchestrate`."
            )

    by_name = {n["name"]: n for n in nodes}

    def add_node(node: dict) -> None:
        if node["name"] not in by_name:
            nodes.append(node)
            by_name[node["name"]] = node

    add_node(
        {
            "parameters": {
                "method": "POST",
                "url": "http://agents:8000/v1/agents/summary",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": '={{ JSON.stringify({ run_point_id: $json.runPointId, document_url: $json.runRecord.documentUrl, version_id: $json.runRecord.versionId || $json.runRecord.timestamp, document_hash: $json.runRecord.documentHash, summary: $json.runRecord.summary, added_preview: ($json.runRecord.added || []).slice(0,5).map(a => String(a.chunkText || "")), removed_preview: ($json.runRecord.removed || []).slice(0,5).map(r => String(r.chunkText || "")) }) }}',
                "options": {"response": {"response": {"neverError": True}}},
            },
            "id": "9f0e1a2b-3c4d-5678-9abc-def012345678",
            "name": "HTTP: SummaryAgent",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [80, 1024],
        }
    )
    add_node(
        {
            "parameters": {"jsCode": merge_js, "mode": "runOnceForAllItems"},
            "id": "8e7d6c5b-4a39-2187-6543-10fedcba9876",
            "name": "Code: Merge LLM Into Run",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [300, 1024],
        }
    )
    add_node(
        {
            "parameters": {"jsCode": provenance_js, "mode": "runOnceForEachItem"},
            "id": "a1b2c3d4-e5f6-7890-abcd-ingestprov01",
            "name": "Code: Ingest Provenance",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-1184, 1024],
        }
    )
    doc_url = "https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf"
    scope_js = f"""const doc = {json.dumps(doc_url)};
const i = $input.first().json || {{}};
return {{
  json: {{
    ...i,
    documentUrl: doc,
    qdrantUrl: 'http://qdrant:6333',
    qdrantCollection: 'regulatory_docs',
    qdrantApiKey: '',
    agentsApiUrl: 'http://agents:8000',
  }},
}};"""
    add_node(
        {
            "parameters": {"jsCode": scope_js, "mode": "runOnceForAllItems"},
            "id": "1a2b3c4d-5e6f-7890-abcd-ef1234567891",
            "name": "Code: Chat Scope",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-1520, 496],
        }
    )
    add_node(
        {
            "parameters": {
                "method": "POST",
                "url": "http://agents:8000/v1/pipelines/chat",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": '={{ JSON.stringify({ message: $json.chatInput || $json.text || $json.message || "", document_url: $json.documentUrl, qdrant_url: $json.qdrantUrl, qdrant_collection: $json.qdrantCollection, qdrant_api_key: $json.qdrantApiKey, top_k: 8 }) }}',
                "options": {
                    "response": {
                        "response": {
                            "responseFormat": "json",
                        }
                    }
                },
            },
            "id": "2b3c4d5e-6f70-89ab-cdef-123456789012",
            "name": "HTTP: ChatPipeline",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-1280, 496],
        }
    )
    add_node(
        {
            "parameters": {
                "operation": "send",
                "message": "={{ $json.reply || $json.data?.reply || $json.body?.reply }}",
                "options": {},
            },
            "id": "3c4d5e6f-7081-92ab-cdef-234567890123",
            "name": "Chat: Send Reply",
            "type": "@n8n/n8n-nodes-langchain.chat",
            "typeVersion": 1.2,
            "position": [-1040, 496],
        }
    )
    add_node(
        {
            "parameters": {
                "path": "regulatory-compare",
                "httpMethod": "POST",
                "responseMode": "responseNode",
                "options": {},
            },
            "id": "4d5e6f70-8192-a3bc-def3456789012",
            "name": "Webhook: Compare",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-1760, 800],
            "webhookId": "c0ffee00-1111-2222-3333-444455556666",
        }
    )
    add_node(
        {
            "parameters": {
                "method": "POST",
                "url": "http://agents:8000/v1/agents/compare",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json.body) }}",
                "options": {},
            },
            "id": "5e6f7081-92a3-b4cd-ef45678901234",
            "name": "HTTP: CompareAgent",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-1520, 800],
        }
    )
    add_node(
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ $json }}",
                "options": {},
            },
            "id": "6f708192-a3b4-c5de-f567890123456",
            "name": "Respond: Compare",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [-1280, 800],
        }
    )
    add_node(
        {
            "parameters": {
                "path": "regulatory-orchestrate",
                "httpMethod": "POST",
                "responseMode": "responseNode",
                "options": {},
            },
            "id": "708192a3-b4c5-d6ef-6789012345678",
            "name": "Webhook: Orchestrate",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-1760, 1000],
            "webhookId": "d0ffee00-aaaa-bbbb-cccc-dddddddddddd",
        }
    )
    add_node(
        {
            "parameters": {
                "method": "POST",
                "url": "http://agents:8000/v1/orchestrate",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json.body) }}",
                "options": {},
            },
            "id": "8192a3b4-c5d6-e7f8-8901234567890",
            "name": "HTTP: Orchestrate",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-1520, 1000],
        }
    )
    add_node(
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ $json }}",
                "options": {},
            },
            "id": "a3b4c5d6-e7f8-9012-34567890abcd",
            "name": "Respond: Orchestrate",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [-1040, 940],
        }
    )

    con = wf.setdefault("connections", {})
    con["Build & Write Run Record"] = {
        "main": [
            [
                {"node": "HTTP: SummaryAgent", "type": "main", "index": 0},
            ]
        ]
    }
    con["HTTP: SummaryAgent"] = {
        "main": [
            [
                {"node": "Code: Merge LLM Into Run", "type": "main", "index": 0},
            ]
        ]
    }
    con["Code: Merge LLM Into Run"] = {
        "main": [
            [
                {"node": "Split: New Chunks", "type": "main", "index": 0},
                {"node": "If: Any Stale Chunks?", "type": "main", "index": 0},
            ]
        ]
    }
    con["Chat Trigger"] = {
        "main": [
            [
                {"node": "Code: Chat Scope", "type": "main", "index": 0},
            ]
        ]
    }
    con["Code: Chat Scope"] = {
        "main": [
            [
                {"node": "HTTP: ChatPipeline", "type": "main", "index": 0},
            ]
        ]
    }
    con["HTTP: ChatPipeline"] = {
        "main": [
            [
                {"node": "Chat: Send Reply", "type": "main", "index": 0},
            ]
        ]
    }
    con["Webhook: Compare"] = {
        "main": [
            [
                {"node": "HTTP: CompareAgent", "type": "main", "index": 0},
            ]
        ]
    }
    con["HTTP: CompareAgent"] = {
        "main": [
            [
                {"node": "Respond: Compare", "type": "main", "index": 0},
            ]
        ]
    }
    con["Webhook: Orchestrate"] = {
        "main": [
            [
                {"node": "HTTP: Orchestrate", "type": "main", "index": 0},
            ]
        ]
    }
    con["HTTP: Orchestrate"] = {
        "main": [
            [
                {"node": "Respond: Orchestrate", "type": "main", "index": 0},
            ]
        ]
    }
    con["Download PDF"] = {
        "main": [
            [
                {"node": "Code: Ingest Provenance", "type": "main", "index": 0},
            ]
        ]
    }
    con["Code: Ingest Provenance"] = {
        "main": [
            [
                {"node": "Extract PDF Text", "type": "main", "index": 0},
            ]
        ]
    }

    for name in ("Bedrock Chat Model", "Qdrant Vector Store (Tool)", "Bedrock Embeddings (Retrieval)"):
        if name in con:
            ent = con[name]
            for k in list(ent.keys()):
                ent[k] = []

    # --- Canvas layout: separate lanes so nodes do not overlap in n8n UI (connections unchanged) ---
    x0 = -2640
    gap_x, gap_y = 280, 220
    y_notes, y_chat, y_web1, y_web2, y_ingest = -80, 280, 520, 740, 1000
    y_embed_branch, y_embed_chain = 1280, 1500

    canvas_positions: dict[str, list[int]] = {
        "README": [x0, y_notes],
        "Section: RAG": [x0, y_notes + 160],
        "Section: Ingestion": [x0, y_ingest - 100],
        # Hosted chat
        "Chat Trigger": [x0, y_chat],
        "Code: Chat Scope": [x0 + gap_x, y_chat],
        "HTTP: ChatPipeline": [x0 + 2 * gap_x, y_chat],
        "Chat: Send Reply": [x0 + 3 * gap_x, y_chat],
        # Webhooks + agents HTTP
        "Webhook: Compare": [x0, y_web1],
        "HTTP: CompareAgent": [x0 + gap_x, y_web1],
        "Respond: Compare": [x0 + 2 * gap_x, y_web1],
        "Webhook: Orchestrate": [x0, y_web2],
        "HTTP: Orchestrate": [x0 + gap_x, y_web2],
        "Respond: Orchestrate": [x0 + 2 * gap_x, y_web2],
        # Scheduled PDF ingest (left → right)
        "Schedule Trigger": [x0, y_ingest],
        "Set Config": [x0 + gap_x, y_ingest],
        "Download PDF": [x0 + 2 * gap_x, y_ingest],
        "Code: Ingest Provenance": [x0 + 3 * gap_x, y_ingest],
        "Extract PDF Text": [x0 + 4 * gap_x, y_ingest],
        "Chunk + Hash": [x0 + 5 * gap_x, y_ingest],
        "Qdrant: Scroll Existing IDs": [x0 + 6 * gap_x, y_ingest],
        "Compute Diff": [x0 + 7 * gap_x, y_ingest],
        "Build & Write Run Record": [x0 + 8 * gap_x, y_ingest],
        "HTTP: SummaryAgent": [x0 + 9 * gap_x, y_ingest],
        "Code: Merge LLM Into Run": [x0 + 10 * gap_x, y_ingest],
        # Parallel branches from merge
        "Split: New Chunks": [x0 + 7 * gap_x, y_embed_branch],
        "If: Any Stale Chunks?": [x0 + 10 * gap_x, y_embed_branch],
        # Embed chain
        "Bedrock: Embed Chunk (SigV4)": [x0 + 7 * gap_x, y_embed_chain],
        "Build Qdrant Point": [x0 + 8 * gap_x, y_embed_chain],
        "Qdrant: Upsert Point": [x0 + 9 * gap_x, y_embed_chain],
        # Stale delete under If branch
        "Qdrant: Delete Stale Points": [x0 + 10 * gap_x, y_embed_chain],
        # Disconnected LangChain reference (kept for docs; no main connections)
        "AI Agent": [1040, y_chat],
        "Bedrock Chat Model": [1040, y_chat + gap_y],
        "Qdrant Vector Store (Tool)": [1320, y_chat + gap_y],
        "Bedrock Embeddings (Retrieval)": [1040, y_chat + 2 * gap_y],
    }
    for n in nodes:
        nm = n.get("name")
        if nm in canvas_positions:
            n["position"] = canvas_positions[nm][:]

    WF.write_text(json.dumps(wf, indent=2))
    print("patched", WF)


if __name__ == "__main__":
    main()
