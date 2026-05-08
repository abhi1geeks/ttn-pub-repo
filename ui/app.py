import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
import streamlit as st


@dataclass(frozen=True)
class Settings:
    qdrant_url: str
    changelog_collection: str
    n8n_chat_webhook_url: str


def load_settings() -> Settings:
    qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333").rstrip("/")
    changelog_collection = os.environ.get("QDRANT_CHANGELOG_COLLECTION", "regulatory_change_log")
    n8n_chat_webhook_url = os.environ.get("N8N_CHAT_WEBHOOK_URL", "").strip()
    return Settings(
        qdrant_url=qdrant_url,
        changelog_collection=changelog_collection,
        n8n_chat_webhook_url=n8n_chat_webhook_url,
    )


def qdrant_scroll_change_logs(
    settings: Settings, limit: int = 50, offset: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    url = f"{settings.qdrant_url}/collections/{settings.changelog_collection}/points/scroll"
    payload: Dict[str, Any] = {
        "limit": limit,
        "with_payload": True,
        "with_vector": False,
    }
    if offset:
        payload["offset"] = offset
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    points = (data.get("result") or {}).get("points") or []
    next_page = (data.get("result") or {}).get("next_page_offset")
    return points, next_page


def qdrant_set_review_status(settings: Settings, point_id: str, status: str) -> None:
    url = f"{settings.qdrant_url}/collections/{settings.changelog_collection}/points/payload?wait=true"
    payload = {
        "points": [point_id],
        "payload": {"metadata": {"review": {"status": status, "at": datetime.utcnow().isoformat() + "Z"}}},
    }
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()


def extract_change_log_fields(point: Dict[str, Any]) -> Dict[str, Any]:
    payload = point.get("payload") or {}
    meta = (payload.get("metadata") or {}) if isinstance(payload, dict) else {}
    review = (meta.get("review") or {}) if isinstance(meta, dict) else {}
    changes = meta.get("changes") if isinstance(meta, dict) else None
    return {
        "id": str(point.get("id")),
        "documentUrl": meta.get("documentUrl", ""),
        "versionId": meta.get("versionId", ""),
        "content": payload.get("content", ""),
        "reviewStatus": review.get("status", "Pending"),
        "reviewAt": review.get("at", ""),
        "changes": changes or {},
    }


def call_n8n_chat(settings: Settings, message: str) -> Dict[str, Any]:
    if not settings.n8n_chat_webhook_url:
        raise RuntimeError("N8N_CHAT_WEBHOOK_URL is not set")
    r = requests.post(settings.n8n_chat_webhook_url, json={"chatInput": message}, timeout=120)
    r.raise_for_status()
    # n8n chat trigger responses vary; return raw and render safely
    return r.json() if r.headers.get("content-type", "").startswith("application/json") else {"text": r.text}


st.set_page_config(page_title="Regulatory Change Monitor - Phase 3 UI", layout="wide")
settings = load_settings()

st.title("Regulatory Change Monitor — Phase 3 UI")

tabs = st.tabs(["Review Inbox", "Chat (RAG)"])

with tabs[0]:
    st.subheader("Review Inbox")
    col_a, col_b, col_c = st.columns([2, 2, 1])
    with col_a:
        status_filter = st.selectbox("Status", ["Pending", "Approved", "Dismissed", "All"], index=0)
    with col_b:
        limit = st.slider("Items to load", min_value=10, max_value=100, value=50, step=10)
    with col_c:
        if st.button("Refresh", type="primary"):
            st.rerun()

    try:
        points, _ = qdrant_scroll_change_logs(settings, limit=limit)
        items = [extract_change_log_fields(p) for p in points]
        if status_filter != "All":
            items = [i for i in items if i["reviewStatus"] == status_filter]

        if not items:
            st.info("No change-log entries found for this filter. Run ingestion with a change to generate entries.")
        else:
            for item in items:
                header_left, header_right = st.columns([5, 2])
                with header_left:
                    st.markdown(
                        f"**Document:** `{item['documentUrl']}`  \n"
                        f"**Detected at:** `{item['versionId']}`  \n"
                        f"**Point ID:** `{item['id']}`"
                    )
                with header_right:
                    st.markdown(f"**Status:** `{item['reviewStatus']}`")
                    if item["reviewAt"]:
                        st.caption(item["reviewAt"])

                changes = item.get("changes") or {}
                if changes:
                    st.caption(
                        f"Chunks: total={changes.get('totalChunks')} | "
                        f"new={changes.get('newChunks')} | removed={changes.get('removedChunks')} | "
                        f"unchanged={changes.get('unchangedChunks')}"
                    )

                with st.expander("View change excerpt"):
                    st.text(item["content"])

                btn1, btn2, _sp = st.columns([1, 1, 6])
                if item["reviewStatus"] == "Pending":
                    if btn1.button("Approve", key=f"approve-{item['id']}"):
                        qdrant_set_review_status(settings, item["id"], "Approved")
                        st.success("Approved")
                        st.rerun()
                    if btn2.button("Dismiss", key=f"dismiss-{item['id']}"):
                        qdrant_set_review_status(settings, item["id"], "Dismissed")
                        st.warning("Dismissed")
                        st.rerun()
                st.divider()
    except Exception as e:
        st.error(f"Failed to load change logs from Qdrant. {e}")
        st.caption(
            f"Check QDRANT_URL={settings.qdrant_url} and collection={settings.changelog_collection} "
            f"(and that Qdrant is running)."
        )

with tabs[1]:
    st.subheader("Chat (RAG via n8n)")
    st.caption("This UI calls your n8n Chat Trigger webhook as the backend.")
    if not settings.n8n_chat_webhook_url:
        st.warning("Set N8N_CHAT_WEBHOOK_URL to the Chat Trigger Production URL from n8n.")
    if "messages" not in st.session_state:
        st.session_state.messages = []

    for m in st.session_state.messages:
        with st.chat_message(m["role"]):
            st.markdown(m["content"])

    user_msg = st.chat_input("Ask a question about the latest indexed regulation…")
    if user_msg:
        st.session_state.messages.append({"role": "user", "content": user_msg})
        with st.chat_message("user"):
            st.markdown(user_msg)
        with st.chat_message("assistant"):
            try:
                resp = call_n8n_chat(settings, user_msg)
                # Try common shapes
                answer = (
                    resp.get("answer")
                    or resp.get("output")
                    or resp.get("text")
                    or resp.get("response")
                    or str(resp)
                )
                st.markdown(answer)
                st.session_state.messages.append({"role": "assistant", "content": answer})
            except Exception as e:
                err = f"Chat call failed. {e}"
                st.error(err)
                st.session_state.messages.append({"role": "assistant", "content": err})
