Phase 3 UI (Streamlit)

This folder provides a simple reviewer UI and a chat UI:
- Review Inbox: reads change-log entries from Qdrant and lets you Approve/Dismiss.
- Chat: calls the n8n Chat Trigger webhook (RAG backend).

Prereqs
- Qdrant running locally (from this repo's docker-compose)
- n8n workflow imported + ingestion run executed at least once (so change logs exist)
- Your n8n workflow activated (for production chat trigger URL)

Setup
1) Create a virtualenv (optional but recommended)
   python3 -m venv .venv
   source .venv/bin/activate

2) Install deps
   pip install -r requirements.txt

3) Configure environment variables
   export QDRANT_URL="http://localhost:6333"
   export QDRANT_CHANGELOG_COLLECTION="regulatory_change_log"

   # Paste the Production URL from the `Chat Trigger` node panel in n8n
   # Example: http://localhost:5678/webhook/<your-chat-trigger>
   export N8N_CHAT_WEBHOOK_URL="http://localhost:5678/webhook/<CHAT_TRIGGER_PATH>"

Run
  streamlit run app.py

Notes
- Review actions write back to Qdrant under payload.metadata.review = { status, at }.
- For a cleaner demo, generate at least 2 change-log entries by updating the PDF and re-running ingestion.
