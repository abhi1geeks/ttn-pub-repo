How to Start the Services

Install Docker: Ensure you have Docker Desktop or Docker Engine installed.
Run the Command: Open your terminal in the directory where you saved the file and run:
    docker-compose up -d
Access the Dashboards:
    n8n: Visit http://localhost:5678 to start building workflows.
    Qdrant Dashboard: Visit http://localhost:6333/dashboard to view your vector collections.

Connecting n8n to QdrantTo make them talk to each other within n8n:
    Host: Use qdrant (the service name in the Docker file) instead of localhost if you are connecting them via the internal Docker network.
    
    Port: Use 6333.API Key: By default, the local setup doesn't require an API key unless you manually add one to the Qdrant environment variables.

Restart the container for changes to take effect:
    docker-compose down
    docker-compose up -d



https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/e5f478ac7bd82405b0b1a8ed0862e8316ddc68eb/regulation-14-as-of-02-26.pdf

https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf
https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf


https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/web-site-report-batavia-downs-casino.pdf



curl -X PUT http://localhost:6333/collections/regulatory_docs \
     -H 'api-key: YOUR_KEY' -H 'Content-Type: application/json' \
     -d '{"vectors":{"size":1024,"distance":"Cosine"}}'


curl -X PUT http://localhost:6333/collections/regulatory_docs/index \
     -H 'api-key: YOUR_KEY' -H 'Content-Type: application/json' \
     -d '{"field_name":"metadata.documentUrl","field_schema":"keyword"}'


Change-log collection (optional, for "what changed?" chat)

This workflow can store a short per-run change summary in a second Qdrant collection.
Create it once (same vector size as your embedding model, default 1024):

curl -X PUT http://localhost:6333/collections/regulatory_change_log \
     -H 'Content-Type: application/json' \
     -d '{"vectors":{"size":1024,"distance":"Cosine"}}'



git checkout main
git reset --hard checkpoint/demo-ready




Commit: 0c449ee
Tag: checkpoint/change-log-tool-embeddings

Recommended demo flow (3 minutes)
Baseline ingest (don’t show change-log yet)
Update the PDF on GitHub (same URL), rerun ingestion
Ask in chat:
“What changed since the last run? Quote the change-log excerpt and summarize in 5 bullets.”
You’ll get a compact “diff-like” summary with quoted excerpts.

If you want the bullets to be safer/cleaner
Use this prompt (it forces “only what’s in excerpt” and avoids over-claiming):

“Using only the change-log excerpt, summarize the changes in 5 bullets. If the excerpt doesn’t clearly indicate a change type, say ‘not specified’.”




Summary (Completed vs Remaining)

Completed (tasks/features)

- Dockerized local stack: n8n + Qdrant running together (docker-compose.yml), with AWS env wiring for Bedrock signing.
- Single-source PDF ingestion (GitHub raw URL):
  - Download PDF → extract text → chunk → deterministic chunk IDs → embed (Bedrock Titan v2) → upsert to Qdrant.
- Change detection:
  - Computes totalChunks / newChunks / removedChunks / unchangedChunks.
  - Upserts only changed chunks and deletes stale chunks (cost-efficient).
- RAG chat over latest regulation:
  - Chat Trigger + AI Agent + Qdrant retrieval tool (regulatory_documents_search) with Bedrock embeddings.
  - Qdrant URL credential set to http://qdrant:6333 so retrieval works inside Docker.
- “What changed since last run?”:
  - Stores per-run change summaries in Qdrant collection regulatory_change_log.
  - Adds a second chat tool: regulatory_changes_search.
- Checkpoints created:
  - checkpoint/demo-ready
  - checkpoint/change-log-working
  - checkpoint/change-log-tool-embeddings

Remaining (next steps)

- Better diff display (Phase 3 UI):
  - Show previous text vs new text per changed section/chunk (today we show new/changed excerpts + removed count).
  - Optional: side-by-side PDF viewer with highlights.
- Human-in-the-loop workflow (Phase 3):
  - Reviewer approves/dismisses each detected change.
  - Persist review status (e.g., Qdrant payload, DB, or simple sheet).
- SharePoint integration (Phase 4):
  - On approval, push updates into SharePoint (via MCP tools as per requirement).
- Multi-jurisdiction scaling:
  - Add jurisdiction metadata, multiple URLs, scheduling per jurisdiction, retry/error handling, and crawl support for non-direct PDF pages.
- Demo hardening:
  - Ensure the change-log only summarizes delta (not baseline) when presenting “what changed”.
  - Add notifications (email/Slack) for new changes.

Phase 3 UI (Human-in-the-loop review)

This demo includes a minimal review UI implemented as n8n webhooks:

- Review page (GET): /webhook/regulatory-review
- Action endpoint (POST): /webhook/regulatory-review-action

How to use:

1. Ensure you have at least one entry in `regulatory_change_log` (run ingestion with a change).
2. Open the review page in your browser:
   http://localhost:5678/webhook/regulatory-review
3. Approve or dismiss items. The decision is saved back into Qdrant under:
   payload.metadata.review = { status, at }
