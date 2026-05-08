Phase 3 UI (Streamlit)

This folder provides a simple reviewer UI and a chat UI:
- Review Inbox: reads change-log entries from Qdrant and lets you Approve/Dismiss.
- Chat: calls the n8n Chat Trigger webhook (RAG backend).

Prereqs
- Qdrant running locally (from this repo's docker-compose)
- n8n workflow imported + ingestion run executed at least once (so change logs exist)
- Your n8n workflow activated (for production chat trigger URL)

Setup
1) Create local config
   cp .env.example .env
   # edit .env and set N8N_CHAT_WEBHOOK_URL

2) Run (auto-creates venv + installs deps via uv)
   chmod +x run.sh
   ./run.sh

Run
  streamlit run app.py

Notes
- Review actions write back to Qdrant under payload.metadata.review = { status, at }.
- For a cleaner demo, generate at least 2 change-log entries by updating the PDF and re-running ingestion.

Chat URL note
- This Streamlit app uses its own chat UI and calls n8n as a backend API.
- In n8n, import the latest workflow and activate it, then use the Production URL for the node:
  `RAG API (Webhook)` (path: `/webhook/rag-chat`)
- Paste that URL into `N8N_CHAT_WEBHOOK_URL` in `ui/.env`.
