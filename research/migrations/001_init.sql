-- 001_init.sql
-- POC state + audit schema for the GLI Regulatory Change Monitor.
-- Canonical owner: research/poc_low_level_architecture.md (sections 4.1, 7.2, 7.3).
-- Target runtime: SQLite inside the n8n container at /home/node/.n8n/state.db.
-- Apply via:
--   docker exec -it n8n sh -lc 'mkdir -p /home/node/.n8n/migrations'
--   docker cp research/migrations/001_init.sql n8n:/home/node/.n8n/migrations/001_init.sql
--   docker exec -it n8n sh -lc 'sqlite3 /home/node/.n8n/state.db ".read /home/node/.n8n/migrations/001_init.sql"'

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Documents and versions ------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id                  TEXT PRIMARY KEY,            -- "<jurisdiction>:<doc_slug>"
  jurisdiction        TEXT NOT NULL,               -- e.g. NV, NY
  source_url          TEXT NOT NULL,
  current_version_id  TEXT,                        -- FK -> document_versions.id
  product_lines       TEXT,                        -- JSON array (UC2-003)
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id              TEXT PRIMARY KEY,                -- ulid or content_hash
  document_id     TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  snapshot_path   TEXT NOT NULL,                   -- under n8n_data/snapshots/
  effective_date  TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_hash     ON document_versions(content_hash);

-- Change events ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS change_events (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL,
  from_version      TEXT,
  to_version        TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN (
                      'NEW',
                      'PENDING_REVIEW',
                      'APPROVED',
                      'DISMISSED',
                      'PUBLISHED',
                      'FAILED',
                      'NEEDS_HUMAN_REASON'
                    )),
  relevance_score   REAL CHECK (relevance_score IS NULL
                                OR (relevance_score BETWEEN 0 AND 1)),
  summary_md        TEXT,
  citations_json    TEXT,                          -- JSON array of {chunk_id, doc_id, span}
  reviewer          TEXT,
  reviewed_at       TEXT,
  draft_package_md  TEXT,                          -- UC1-007
  sp_file_id        TEXT,                          -- UC1-008
  sp_version        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id)  REFERENCES documents(id),
  FOREIGN KEY (from_version) REFERENCES document_versions(id),
  FOREIGN KEY (to_version)   REFERENCES document_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_change_events_status ON change_events(status);
CREATE INDEX IF NOT EXISTS idx_change_events_doc    ON change_events(document_id);

-- Audit trail (XC-003): append-only, enforced by triggers --------------------

CREATE TABLE IF NOT EXISTS audit_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL DEFAULT (datetime('now')),
  actor           TEXT NOT NULL,                   -- 'system' or reviewer email
  kind            TEXT NOT NULL CHECK (kind IN (
                    'DETECTED',
                    'APPROVED',
                    'DISMISSED',
                    'DRAFTED',
                    'PUBLISHED',
                    'NOTIFIED',
                    'TRANSLATED',
                    'FETCH_FAIL',
                    'PUBLISH_FAIL'
                  )),
  change_event_id TEXT,
  payload_json    TEXT,                            -- includes content_hash, model_id, prompt_version
  FOREIGN KEY (change_event_id) REFERENCES change_events(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ts   ON audit_events(ts);
CREATE INDEX IF NOT EXISTS idx_audit_events_kind ON audit_events(kind);
CREATE INDEX IF NOT EXISTS idx_audit_events_chg  ON audit_events(change_event_id);

CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

-- Source health (XC-004) ------------------------------------------------------

CREATE TABLE IF NOT EXISTS source_health (
  source_url           TEXT PRIMARY KEY,
  last_success_at      TEXT,
  last_http_code       INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  parse_success_rate   REAL CHECK (parse_success_rate IS NULL
                                   OR (parse_success_rate BETWEEN 0 AND 1)),
  last_hash            TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Horizon scanning (UC3) ------------------------------------------------------

CREATE TABLE IF NOT EXISTS bills (
  id            TEXT PRIMARY KEY,
  jurisdiction  TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('introduced','committee','enacted','other')),
  external_url  TEXT,
  seeded_by     TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notifications (UC1-009) -----------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  change_event_id TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('teams','email')),
  recipient       TEXT NOT NULL,
  template        TEXT NOT NULL CHECK (template IN ('staff','operator','regulator')),
  sent_at         TEXT,
  result          TEXT,
  FOREIGN KEY (change_event_id) REFERENCES change_events(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_chg ON notifications(change_event_id);
