CREATE TABLE IF NOT EXISTS sandbox_sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  profile_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sandbox_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  command TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_updated ON sandbox_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_events_ts ON sandbox_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_events_session_ts ON sandbox_events(session_id,ts DESC);
