CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, visitor_key TEXT NOT NULL, started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
 ended_at INTEGER, build TEXT NOT NULL, generation INTEGER, archetype TEXT, state TEXT, temperature REAL,
 duration_ms INTEGER DEFAULT 0, event_count INTEGER DEFAULT 0, tracks_heard INTEGER DEFAULT 0,
 tracks_completed INTEGER DEFAULT 0, tracks_skipped INTEGER DEFAULT 0, albums_entered INTEGER DEFAULT 0, rediscoveries INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL,
 surface TEXT NOT NULL, subject TEXT, value REAL, meta_json TEXT, FOREIGN KEY(session_id) REFERENCES sessions(id)
);
CREATE TABLE IF NOT EXISTS deployments (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, build TEXT NOT NULL, ref TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS feature_flags (name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id,ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type,ts);
