CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  release_type TEXT NOT NULL DEFAULT 'album', release_date TEXT NOT NULL DEFAULT '',
  release_year INTEGER, genres_json TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#777777', producer TEXT NOT NULL DEFAULT '',
  featured_artists_json TEXT NOT NULL DEFAULT '[]', credits_json TEXT NOT NULL DEFAULT '{}',
  label TEXT NOT NULL DEFAULT '', catalogue_number TEXT NOT NULL DEFAULT '',
  badges_json TEXT NOT NULL DEFAULT '[]', featured INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0, template TEXT NOT NULL DEFAULT 'standard',
  visibility TEXT NOT NULL DEFAULT 'public', published INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER, untitled_url TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL DEFAULT 'untitled',
  card_json TEXT NOT NULL DEFAULT '{}', features_json TEXT NOT NULL DEFAULT '{}',
  track_count_override INTEGER, runtime_override INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS release_tracks (
  id TEXT PRIMARY KEY, release_id TEXT NOT NULL, title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER, stream_key TEXT, master_key TEXT,
  stream_type TEXT NOT NULL DEFAULT '', master_type TEXT NOT NULL DEFAULT '',
  stream_bytes INTEGER NOT NULL DEFAULT 0, master_bytes INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_releases_public_order ON releases(published,archived_at,display_order);
CREATE INDEX IF NOT EXISTS idx_release_tracks_order ON release_tracks(release_id,position);
CREATE TABLE IF NOT EXISTS release_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, release_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  action TEXT NOT NULL, snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_release_revisions_release ON release_revisions(release_id,created_at DESC);
CREATE TABLE IF NOT EXISTS album_config (
  id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO album_config(id,version,settings_json,updated_at) VALUES(1,1,'{}',0);
INSERT OR IGNORE INTO releases(id,slug,title,release_type,release_date,release_year,genres_json,featured,display_order,template,visibility,published,untitled_url,destination,track_count_override,created_at,updated_at) VALUES
('rel-stnkqlzr','stnkqlzr','STNKQLZR','album','2026-07-01',2026,'["instrumental","experimental","alternative","edm","industrial","electropop","hyperpop"]',1,1,'featured','public',1,'https://untitled.stream/library/project/OPgCT2BgNTBrrKePJIsNX','untitled',12,0,0),
('rel-summer-two-six','summer-two-six-ep','summer two six ep','ep','2026-08-31',2026,'["experimental","alternative","edm","rage","hyperpop","lo-fi","glitch-hop","wonky"]',0,2,'ep','public',1,'https://untitled.stream/library/project/G465X2D869UJpOWI4dIBQ','untitled',7,0,0),
('rel-from-now-on','from-now-on','from now on...','album','2026-09-03',2026,'["vaporwave","sample ambient","plunderphonics","electronic","ambient techno"]',0,3,'standard','public',1,'https://untitled.stream/library/project/mBKVJxCc8qqDsZfmdB9Jw','untitled',8,0,0),
('rel-u-with-me','u-with-me','u with me?','album','2026-09-10',2026,'["ambient","abstract hip-hop","cloud rap","drone","plunderphonics","sample-based","experimental","electronic","instrumental"]',0,4,'standard','public',1,'https://untitled.stream/library/project/mWyUU0MZxGXJ9i69dh8t6','untitled',8,0,0),
('rel-ultimate-lie','ultimate-lie','ultimate lie','album','2026-09-17',2026,'["dark ambient","hypnagogic","ethereal","experimental","lo-fi","instrumental","cloud rap","drone","sample-ambient","plunderphonics","electronic"]',0,5,'standard','public',1,'https://untitled.stream/library/project/m6W748e3pLY4AoFSfXpoJ','untitled',8,0,0),
('rel-mystery','mystery','???','album','',NULL,'[]',0,6,'mystery','public',0,'','untitled',NULL,0,0);
