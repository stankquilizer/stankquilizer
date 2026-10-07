const COOKIE = 'sq_obs';
const enc = new TextEncoder();
const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const QA_SCENARIOS = new Set([
  'session_start', 'track_started', 'meaningful_play', 'track_completed', 'track_skipped',
  'album_entered', 'release_clicked', 'rediscovery', 'memory_snapshot', 'memory_ghost',
  'milestone', 'unlock', 'completion', 'soft-reset', 'full-reset', 'rebirth', 'page_hidden'
]);

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
       'affinity_change','decay','memory_ghost','memory_corruption','milestone','unlock','completion','reset_action','rebirth')
     GROUP BY type ORDER BY count DESC`, since);
  const recent = await rows(db,
    `SELECT ts,session_id,type,subject,meta_json FROM events WHERE ts >= ? AND type IN
      ('site_state','temperature_change','archetype_change','rediscovery','milestone','unlock','completion','reset_action','rebirth')
     ORDER BY ts DESC LIMIT 100`, since);
  return { counts, recent };
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
    return json({ counts: await featureCounts(env.DB, since), days });
  }
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
    return json(await rows(env.DB,
      "SELECT id,session_id,ts,type,surface,subject,meta_json FROM events WHERE type='qa_event' ORDER BY ts DESC LIMIT ?", limit));
  }
  if (path === '/api/qa' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
    const scenario = String(body.scenario || 'session_start').slice(0, 60);
    if (!QA_SCENARIOS.has(scenario)) return json({ error: 'unknown scenario' }, 400);
    const sessionId = crypto.randomUUID().replaceAll('-', '');
    const visitorKey = crypto.randomUUID().replaceAll('-', '');
    const eventId = crypto.randomUUID().replaceAll('-', '');
    const now = Date.now();
    const statements = [
      env.DB.prepare('INSERT INTO telemetry_dedupe(event_id,session_id,accepted_at) VALUES(?,?,?)').bind(eventId, sessionId, now),
      env.DB.prepare('INSERT INTO sessions(id,visitor_key,started_at,last_seen,build,event_count) VALUES(?,?,?,?,?,1)').bind(sessionId, visitorKey, now, now, 'observatory-qa'),
      env.DB.prepare("INSERT INTO events(session_id,ts,type,surface,subject,meta_json) VALUES(?,?, 'qa_event','system',?,?)")
        .bind(sessionId, now, scenario, JSON.stringify({ synthetic: true, scenario }))
    ];
    await env.DB.batch(statements);
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
