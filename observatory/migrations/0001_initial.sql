-- The base tables already exist in the deployed Observatory database. IF NOT EXISTS
-- keeps this migration safe for that database while making fresh installs complete.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  visitor_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  build TEXT NOT NULL DEFAULT 'unknown',
  event_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'site',
  subject TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts DESC);

CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  build TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS feature_flags (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_dedupe (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  accepted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_dedupe_accepted_at ON telemetry_dedupe(accepted_at);
