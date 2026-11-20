const COOKIE = 'sq_obs';
const enc = new TextEncoder();
const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const QA_SCENARIOS = new Set([
  'session_start', 'track_started', 'meaningful_play', 'track_completed', 'track_skipped',
  'album_entered', 'release_clicked', 'rediscovery', 'memory_snapshot', 'memory_ghost',
  'milestone', 'unlock', 'completion', 'soft-reset', 'full-reset', 'rebirth', 'page_hidden'
]);
const SANDBOX_TRACKS = [
  'i get high', 'i feel like you\'re the only one', 'in the sunken place', 'zzz...',
  'the seraphim', 'fake gifted', 'stankquilizer type beat', 'unimagineable probability',
  'ignantamus', 'the chops', 'life of the loop', 'the earth i scar'
];
const SANDBOX_COMMANDS = new Set([
  'play', 'skip', 'replay', 'haunt', 'glitch', 'heat', 'cooldown',
  'rediscover', 'milestone', 'complete', 'reset', 'rebirth', 'storm'
]);
const MAX_SANDBOX_SESSIONS = 12;
const MAX_SANDBOX_EVENTS = 2500;

const baseHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { ...baseHeaders, ...headers }
});
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));

async function mac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

async function makeCookie(secret) {
  const value = b64(crypto.getRandomValues(new Uint8Array(24)));
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const signature = b64(await mac(secret, value + '.' + expires));
  return `${value}.${expires}.${signature}`;
}

async function validCookie(secret, cookie) {
  if (!secret || !cookie) return false;
  try {
    const [value, expires, signature] = cookie.split('.');
    if (!value || !expires || !signature || Number(expires) < Date.now()) return false;
    const expected = new Uint8Array(await mac(secret, value + '.' + expires));
    const received = unb64(signature);
    if (received.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ received[index];
    return difference === 0;
  } catch (_) { return false; }
}

function cookieValue(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)sq_obs=([^;]+)/);
  return match?.[1] || '';
}

function boundedLimit(value, fallback, max) {
  const limit = Number.parseInt(value || '', 10);
  return Number.isFinite(limit) ? Math.min(max, Math.max(1, limit)) : fallback;
}

function boundedRange(url) {
  const days = boundedLimit(url.searchParams.get('days'), 30, 90);
  return { days, since: Date.now() - days * 24 * 60 * 60 * 1000 };
}

async function rows(db, sql, ...values) {
  return (await db.prepare(sql).bind(...values).all()).results || [];
}

function sandboxProfile(value) {
  let raw = {};
  try { raw = JSON.parse(value || '{}'); } catch (_) {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const count = key => Number.isFinite(Number(raw[key])) ? Math.max(0, Math.min(1000000, Math.floor(Number(raw[key])))) : 0;
  return {
    label: typeof raw.label === 'string' && /^echo-[a-f0-9]{4}$/i.test(raw.label) ? raw.label : 'echo-0000',
    track: SANDBOX_TRACKS.includes(raw.track) ? raw.track : SANDBOX_TRACKS[0],
    state: ['quiet','active','haunted','restless','complete'].includes(raw.state) ? raw.state : 'quiet',
    temperature: Math.max(0, Math.min(100, count('temperature'))),
    generation: Math.max(1, count('generation')),
    plays: count('plays'), skips: count('skips'), replays: count('replays'),
    ghosts: count('ghosts'), glitches: count('glitches'), rediscoveries: count('rediscoveries'),
    milestones: count('milestones'), rebirths: count('rebirths'), resets: count('resets'),
    completed: raw.completed === true
  };
}

async function sandboxSnapshot(db) {
  const [sessionRows, eventRows] = await Promise.all([
    rows(db, 'SELECT id,created_at,updated_at,profile_json FROM sandbox_sessions ORDER BY updated_at DESC LIMIT 12'),
    rows(db, "SELECT session_id,ts,command,detail FROM sandbox_events WHERE command NOT LIKE 'qa:%' ORDER BY id DESC LIMIT 60")
  ]);
  const sessions = sessionRows.map(row => ({
    id: row.id,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    ...sandboxProfile(row.profile_json)
  }));
  return { sessions, events: eventRows, isolated: true, maxSessions: MAX_SANDBOX_SESSIONS };
}

async function addSandboxEvent(db, sessionId, ts, command, detail) {
  await db.prepare('INSERT INTO sandbox_events(session_id,ts,command,detail) VALUES(?,?,?,?)')
    .bind(sessionId, ts, command.slice(0, 40), detail.slice(0, 120)).run();
  await db.prepare('DELETE FROM sandbox_events WHERE id NOT IN (SELECT id FROM sandbox_events ORDER BY id DESC LIMIT ?)')
    .bind(MAX_SANDBOX_EVENTS).run();
}

async function spawnSandboxSession(db, now) {
  const count = Number((await db.prepare('SELECT COUNT(*) AS n FROM sandbox_sessions').first())?.n || 0);
  if (count >= MAX_SANDBOX_SESSIONS) return null;
  const id = crypto.randomUUID().replaceAll('-', '');
  const profile = {
    label: 'echo-' + id.slice(0, 4),
    track: SANDBOX_TRACKS[Math.floor(Math.random() * SANDBOX_TRACKS.length)],
    state: 'quiet', temperature: 35, generation: 1, plays: 0, skips: 0,
    replays: 0, ghosts: 0, glitches: 0, rediscoveries: 0, milestones: 0,
    rebirths: 0, resets: 0, completed: false
  };
  await db.prepare('INSERT INTO sandbox_sessions(id,created_at,updated_at,profile_json) VALUES(?,?,?,?)')
    .bind(id, now, now, JSON.stringify(profile)).run();
  await addSandboxEvent(db, id, now, 'spawn', 'synthetic listener entered the isolated test room');
  return id;
}

async function sandboxApi(request, db) {
  if (request.method === 'GET') return json(await sandboxSnapshot(db));
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 4096) return json({ error: 'request too large' }, 413);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid request' }, 400);
  const action = String(body.action || '');
  const expectedKeys = action === 'command' ? new Set(['action','sessionId','command']) : new Set(['action']);
  if (Object.keys(body).some(key => !expectedKeys.has(key))) return json({ error: 'unknown field' }, 400);
  const now = Date.now();
  if (action === 'clear') {
    const events = await db.prepare("DELETE FROM sandbox_events WHERE command NOT LIKE 'qa:%'").run();
    const sessions = await db.prepare('DELETE FROM sandbox_sessions').run();
    return json({ ok: true, clearedSessions: Number(sessions.meta?.changes) || 0, clearedEvents: Number(events.meta?.changes) || 0 });
  }
  if (action === 'spawn' || action === 'crowd') {
    const total = action === 'crowd' ? 5 : 1;
    const created = [];
    for (let index = 0; index < total; index++) {
      const id = await spawnSandboxSession(db, now + index);
      if (!id) break;
      created.push(id);
    }
    if (!created.length) return json({ error: 'sandbox is at its 12 listener limit; clear a few first' }, 409);
    return json({ ok: true, created: created.length, sessionIds: created }, 201);
  }
  if (action !== 'command') return json({ error: 'unknown action' }, 400);
  const sessionId = String(body.sessionId || '');
  const command = String(body.command || '');
  if (!/^[a-f0-9]{32}$/i.test(sessionId)) return json({ error: 'invalid synthetic session' }, 400);
  if (!SANDBOX_COMMANDS.has(command)) return json({ error: 'unknown sandbox command' }, 400);
  const row = await db.prepare('SELECT profile_json FROM sandbox_sessions WHERE id=?').bind(sessionId).first();
  if (!row) return json({ error: 'synthetic session not found' }, 404);
  const recentCount = Number((await db.prepare('SELECT COUNT(*) AS n FROM sandbox_events WHERE session_id=? AND ts>=?').bind(sessionId, now - 60000).first())?.n || 0);
  if (recentCount >= 60) return json({ error: 'synthetic session command limit reached; wait a minute' }, 429);
  if (command === 'storm') {
    const lastStorm = Number((await db.prepare("SELECT MAX(ts) AS ts FROM sandbox_events WHERE session_id=? AND command='storm'").bind(sessionId).first())?.ts || 0);
    if (lastStorm && now - lastStorm < 10000) return json({ error: 'event storm cooldown; wait ten seconds' }, 429);
  }
  const profile = sandboxProfile(row.profile_json);
  let detail = '';
  if (command === 'play') { profile.plays++; profile.state = 'active'; profile.track = SANDBOX_TRACKS[(SANDBOX_TRACKS.indexOf(profile.track) + 1) % SANDBOX_TRACKS.length]; detail = 'radio advanced to the next synthetic track'; }
  else if (command === 'skip') { profile.skips++; profile.track = SANDBOX_TRACKS[(SANDBOX_TRACKS.indexOf(profile.track) + 1) % SANDBOX_TRACKS.length]; detail = 'synthetic listener skipped a track'; }
  else if (command === 'replay') { profile.replays++; profile.plays++; profile.state = 'active'; detail = 'current synthetic track replayed'; }
  else if (command === 'haunt') { profile.ghosts++; profile.state = 'haunted'; detail = 'memory ghost appeared in the simulation'; }
  else if (command === 'glitch') { profile.glitches++; detail = 'presentation glitch triggered in the simulation'; }
  else if (command === 'heat') { profile.temperature = Math.min(100, profile.temperature + 15); profile.state = 'restless'; detail = 'synthetic session temperature increased'; }
  else if (command === 'cooldown') { profile.temperature = Math.max(0, profile.temperature - 15); profile.state = profile.temperature < 45 ? 'quiet' : 'active'; detail = 'synthetic session temperature decreased'; }
  else if (command === 'rediscover') { profile.rediscoveries++; detail = 'a previously heard synthetic track returned'; }
  else if (command === 'milestone') { profile.milestones++; detail = 'synthetic listening milestone reached'; }
  else if (command === 'complete') { profile.completed = true; profile.state = 'complete'; detail = 'synthetic memory journey completed'; }
  else if (command === 'reset') {
    profile.resets++; profile.track = SANDBOX_TRACKS[0]; profile.state = 'quiet'; profile.temperature = 35;
    profile.plays = profile.skips = profile.replays = profile.ghosts = profile.glitches = profile.rediscoveries = profile.milestones = 0;
    profile.completed = false; detail = 'synthetic listener memory reset';
  } else if (command === 'rebirth') {
    profile.rebirths++; profile.resets++; profile.generation++;
    profile.track = SANDBOX_TRACKS[0]; profile.state = 'quiet'; profile.temperature = 35;
    profile.plays = profile.skips = profile.replays = profile.ghosts = profile.glitches = profile.rediscoveries = profile.milestones = 0;
    profile.completed = false; detail = 'synthetic listener began a new generation';
  } else if (command === 'storm') {
    profile.plays += 12; profile.skips += 4; profile.milestones += 2; profile.rediscoveries += 2;
    profile.state = 'restless'; profile.temperature = Math.min(100, profile.temperature + 25);
    for (let index = 0; index < 20; index++) await addSandboxEvent(db, sessionId, now + index, 'storm', `synthetic burst ${index + 1} of 20`);
    detail = '20 synthetic events added to this sandbox only';
  }
  await db.prepare('UPDATE sandbox_sessions SET updated_at=?,profile_json=? WHERE id=?')
    .bind(now, JSON.stringify(profile), sessionId).run();
  if (command !== 'storm') await addSandboxEvent(db, sessionId, now, command, detail);
  return json({ ok: true, sessionId, command, detail, profile });
}

async function overview(db) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const result = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ?').bind(since),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND type='meaningful_play'").bind(since),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND type='track_completed'").bind(since),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND type='track_skipped'").bind(since),
    db.prepare('SELECT COUNT(*) AS n FROM events WHERE ts >= ?').bind(since),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND type='rediscovery'").bind(since),
    db.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE ts >= ? AND type IN ('track_started','radio_play')").bind(since),
    db.prepare("SELECT COUNT(DISTINCT visitor_key) AS n FROM sessions WHERE last_seen >= ?").bind(since),
    db.prepare("SELECT CAST(strftime('%H',ts/1000,'unixepoch') AS INTEGER) AS hour,COUNT(*) AS count FROM events WHERE ts >= ? GROUP BY hour ORDER BY hour").bind(since)
  ]);
  const count = index => Number(result[index]?.results?.[0]?.n || 0);
  return {
    sessions: count(0), meaningfulPlays: count(1), completions: count(2), skips: count(3),
    events: count(4), rediscoveries: count(5), radioSessions: count(6), visitors: count(7),
    eventsByHour: result[8]?.results || []
  };
}

async function memorySummary(db, since) {
  const counts = await rows(db,
    `SELECT type, COUNT(*) AS count FROM events WHERE ts >= ? AND type IN
      ('memory_snapshot','site_state','temperature_change','archetype_change','rediscovery','avoidance_change',
       'affinity_change','decay','memory_ghost','memory_corruption','milestone','unlock','completion','reset_action','rebirth','feature_use')
     GROUP BY type ORDER BY count DESC`, since);
  const recent = await rows(db,
    `SELECT ts,session_id,type,subject,meta_json FROM events WHERE ts >= ? AND type IN
      ('site_state','temperature_change','archetype_change','rediscovery','milestone','unlock','completion','reset_action','rebirth','decay','memory_ghost','memory_corruption','feature_use')
     ORDER BY ts DESC LIMIT 100`, since);
  const states = await rows(db,
    `SELECT subject,COUNT(*) AS count,MAX(ts) AS last_seen FROM events WHERE ts >= ? AND type='site_state'
     GROUP BY subject ORDER BY count DESC,last_seen DESC`, since);
  const features = await rows(db,
    `SELECT subject AS feature,COUNT(*) AS count,MAX(ts) AS last_seen FROM events WHERE ts >= ?
     AND type='feature_use' AND surface='memory' GROUP BY subject ORDER BY count DESC,last_seen DESC`, since);
  const snapshotRow = await db.prepare("SELECT ts,meta_json FROM events WHERE type='memory_snapshot' ORDER BY ts DESC LIMIT 1").first();
  let rawSnapshot = {};
  try { rawSnapshot = JSON.parse(snapshotRow?.meta_json || '{}'); } catch (_) {}
  if (!rawSnapshot || typeof rawSnapshot !== 'object' || Array.isArray(rawSnapshot)) rawSnapshot = {};
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1000000000, Math.round(Number(value)))) : 0;
  const latestSnapshot = snapshotRow ? {
    capturedAt: number(snapshotRow.ts),
    sessionCount: number(rawSnapshot.sessionCount),
    trackCount: number(rawSnapshot.trackCount),
    albumCount: number(rawSnapshot.albumCount),
    listeningMinutes: number(rawSnapshot.listeningMinutes),
    milestoneCount: number(rawSnapshot.milestoneCount),
    decayDays: number(rawSnapshot.decayDays),
    generation: number(rawSnapshot.generation),
    resetCount: number(rawSnapshot.resetCount),
    temperatureBucket: Math.min(100, number(rawSnapshot.temperatureBucket)),
    memoryState: ['calm','active','restless','chaotic','dormant'].includes(rawSnapshot.memoryState) ? rawSnapshot.memoryState : 'unknown',
    relationship: ['first contact','learning','familiar','regular','old listener'].includes(rawSnapshot.relationship) ? rawSnapshot.relationship : 'unknown',
    completed: rawSnapshot.completed === true
  } : null;
  return { counts, recent, states, features, latestSnapshot };
}

async function radioSummary(db, since) {
  const tracks = await rows(db,
    `SELECT subject,
      SUM(CASE WHEN type='track_started' THEN 1 ELSE 0 END) AS starts,
      SUM(CASE WHEN type='meaningful_play' THEN 1 ELSE 0 END) AS meaningful,
      SUM(CASE WHEN type='track_completed' THEN 1 ELSE 0 END) AS completions,
      SUM(CASE WHEN type='track_skipped' THEN 1 ELSE 0 END) AS skips,
      SUM(CASE WHEN type='track_progress' THEN 1 ELSE 0 END) AS progressEvents
     FROM events WHERE ts >= ? AND subject <> '' AND type IN
      ('track_started','meaningful_play','track_completed','track_skipped','track_progress')
     GROUP BY subject ORDER BY starts DESC, meaningful DESC LIMIT 100`, since);
  const totals = await rows(db,
    `SELECT type,COUNT(*) AS count FROM events WHERE ts >= ? AND type IN
      ('radio_play','track_started','meaningful_play','track_completed','track_skipped','track_progress')
     GROUP BY type`, since);
  return { tracks, totals };
}

async function featureCounts(db, since) {
  return rows(db,
    'SELECT type,surface,COUNT(*) AS count FROM events WHERE ts >= ? GROUP BY type,surface ORDER BY count DESC,type', since);
}

async function fetchApi(request, env, url) {
  const path = url.pathname;
  if (path === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, time: Date.now(), database: 'online' });
  }
  if (path === '/api/overview') return json(await overview(env.DB));
  if (path === '/api/live') {
    const limit = boundedLimit(url.searchParams.get('limit'), 60, 100);
    const minutes = boundedLimit(url.searchParams.get('minutes'), 60, 1440);
    const since = Date.now() - minutes * 60 * 1000;
    const events = await rows(env.DB,
      'SELECT ts,session_id,type,surface,subject,meta_json FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT ?', since, limit);
    return json({ events, since, minutes });
  }
  if (path === '/api/events') {
    const limit = boundedLimit(url.searchParams.get('limit'), 50, 200);
    const { since } = boundedRange(url);
    return json(await rows(env.DB,
      'SELECT id,session_id,ts,type,surface,subject,meta_json FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT ?', since, limit));
  }
  if (path === '/api/sessions') {
    const limit = boundedLimit(url.searchParams.get('limit'), 50, 100);
    return json(await rows(env.DB,
      'SELECT id,visitor_key,started_at,last_seen,build,event_count FROM sessions ORDER BY last_seen DESC LIMIT ?', limit));
  }
  if (path === '/api/session-events') {
    const id = url.searchParams.get('id') || '';
    if (!/^[a-f0-9]{32}$/i.test(id)) return json({ error: 'invalid session id' }, 400);
    return json(await rows(env.DB,
      'SELECT id,session_id,ts,type,surface,subject,meta_json FROM events WHERE session_id=? ORDER BY ts LIMIT 500', id));
  }
  if (path === '/api/memory') {
    const { days, since } = boundedRange(url);
    return json({ ...(await memorySummary(env.DB, since)), days });
  }
  if (path === '/api/radio') {
    const { days, since } = boundedRange(url);
    return json({ ...(await radioSummary(env.DB, since)), days });
  }
  if (path === '/api/projects') {
    const { days, since } = boundedRange(url);
    const albums = await rows(env.DB,
      `SELECT subject,
        SUM(CASE WHEN type='album_entered' THEN 1 ELSE 0 END) AS visits,
        SUM(CASE WHEN type='release_clicked' THEN 1 ELSE 0 END) AS releases
       FROM events WHERE ts >= ? AND subject <> '' AND type IN ('album_entered','release_clicked')
       GROUP BY subject ORDER BY visits DESC,releases DESC LIMIT 100`, since);
    return json({ albums, days });
  }
  if (path === '/api/rediscoveries') {
    const { days, since } = boundedRange(url);
    const total = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND type='rediscovery'").bind(since).first())?.n || 0);
    const tracks = await rows(env.DB,
      "SELECT subject,COUNT(*) AS count,MAX(ts) AS last_seen FROM events WHERE ts >= ? AND type='rediscovery' AND subject <> '' GROUP BY subject ORDER BY count DESC,last_seen DESC LIMIT 100", since);
    const recent = await rows(env.DB,
      "SELECT ts,session_id,type,surface,subject,meta_json FROM events WHERE ts >= ? AND type='rediscovery' ORDER BY ts DESC LIMIT 100", since);
    return json({ tracks, recent, total, days });
  }
  if (path === '/api/feature-counts') {
    const { days, since } = boundedRange(url);
    const [counts, features] = await Promise.all([
      featureCounts(env.DB, since),
      rows(env.DB, `SELECT subject AS feature,COUNT(*) AS count,MAX(ts) AS last_seen FROM events
        WHERE ts >= ? AND type='feature_use' AND surface='memory'
        GROUP BY subject ORDER BY count DESC,last_seen DESC`, since)
    ]);
    return json({ counts, features, days });
  }
  if (path === '/api/sandbox') return sandboxApi(request, env.DB);
  if (path === '/api/deployments' && request.method === 'GET') {
    return json(await rows(env.DB, 'SELECT id,created_at,build,ref,note FROM deployments ORDER BY created_at DESC LIMIT 100'));
  }
  if (path === '/api/deployments' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
    const build = String(body.build || '').trim().slice(0, 80);
    const ref = String(body.ref || '').trim().slice(0, 120);
    const note = String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
    if (!build && !ref && !note) return json({ error: 'deployment details required' }, 400);
    await env.DB.prepare('INSERT INTO deployments(created_at,build,ref,note) VALUES(?,?,?,?)')
      .bind(Date.now(), build, ref, note).run();
    return json({ ok: true }, 201);
  }
  if (path === '/api/flags' && request.method === 'GET') {
    return json(await rows(env.DB, 'SELECT name,enabled,updated_at FROM feature_flags ORDER BY name'));
  }
  if (path === '/api/flags' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
    const name = String(body.name || '').trim().slice(0, 100);
    if (!/^[a-z0-9._-]+$/i.test(name)) return json({ error: 'invalid flag name' }, 400);
    await env.DB.prepare(`INSERT INTO feature_flags(name,enabled,updated_at) VALUES(?,?,?)
      ON CONFLICT(name) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at`)
      .bind(name, body.enabled ? 1 : 0, Date.now()).run();
    return json({ ok: true });
  }
  if (path === '/api/qa' && request.method === 'GET') {
    const limit = boundedLimit(url.searchParams.get('limit'), 50, 100);
    const probes = await rows(env.DB,
      "SELECT id,session_id,ts,command,detail FROM sandbox_events WHERE command LIKE 'qa:%' ORDER BY id DESC LIMIT ?", limit);
    return json(probes.map(row => {
      const scenario = row.command.slice(3);
      return { id: row.id, session_id: row.session_id, ts: row.ts, type: 'qa_event', surface: 'system',
        subject: scenario, meta_json: JSON.stringify({ synthetic: true, scenario, detail: row.detail }) };
    }));
  }
  if (path === '/api/qa' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
    const scenario = String(body.scenario || 'session_start').slice(0, 60);
    if (!QA_SCENARIOS.has(scenario)) return json({ error: 'unknown scenario' }, 400);
    const sessionId = crypto.randomUUID().replaceAll('-', '');
    const now = Date.now();
    await env.DB.prepare('INSERT INTO sandbox_events(session_id,ts,command,detail) VALUES(?,?,?,?)')
      .bind(sessionId, now, 'qa:' + scenario, 'synthetic QA probe').run();
    return json({ ok: true, sessionId, synthetic: true }, 201);
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/login' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }
      if (!env.OBSERVATORY_PASSWORD || body.password !== env.OBSERVATORY_PASSWORD) return json({ ok: false }, 401);
      const cookie = await makeCookie(env.OBSERVATORY_PASSWORD);
      return json({ ok: true }, 200, {
        'set-cookie': `${COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
      });
    }
    if (url.pathname === '/api/logout') {
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!(await validCookie(env.OBSERVATORY_PASSWORD, cookieValue(request)))) return json({ error: 'unauthorized' }, 401);
      try { return await fetchApi(request, env, url); }
      catch (_) { return json({ error: 'service unavailable' }, 503); }
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-frame-options', 'DENY');
    headers.set('referrer-policy', 'no-referrer');
    headers.set('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  }
};
