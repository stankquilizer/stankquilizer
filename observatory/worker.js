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
  'rediscover', 'milestone', 'complete', 'reset', 'rebirth', 'storm',
  'toggle_terminal', 'toggle_do_not_click', 'toggle_specimen', 'toggle_archive', 'toggle_mutation', 'toggle_crt'
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
    completed: raw.completed === true,
    secrets: Object.fromEntries(['terminal','do_not_click','specimen','archive','mutation','crt'].map(key => [key, !raw.secrets || raw.secrets[key] !== false]))
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
  if (command.startsWith('toggle_')) {
    const key = command.slice(7);
    profile.secrets[key] = !profile.secrets[key];
    detail = `${key} secret ${profile.secrets[key] ? 'enabled' : 'disabled'} in this synthetic session`;
  }
  else if (command === 'play') { profile.plays++; profile.state = 'active'; profile.track = SANDBOX_TRACKS[(SANDBOX_TRACKS.indexOf(profile.track) + 1) % SANDBOX_TRACKS.length]; detail = 'radio advanced to the next synthetic track'; }
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
  if (path === '/api/releases' && request.method === 'GET') {
    return json(await rows(env.DB, 'SELECT * FROM releases ORDER BY display_order,id'));
  }
  if (path === '/api/releases' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
    const title = String(body.title || '').trim().slice(0,120);
    const slug = String(body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).slice(0,80);
    const kind = ['album','ep','single','other'].includes(body.releaseType) ? body.releaseType : 'album';
    if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: 'valid title and slug required' }, 400);
    const now = Date.now(), id = 'rel-' + crypto.randomUUID().replaceAll('-','');
    const genres = Array.isArray(body.genres) ? body.genres.map(x=>String(x).trim().toLowerCase().slice(0,32)).filter(Boolean).slice(0,12) : [];
    await env.DB.prepare(`INSERT INTO releases(id,slug,title,release_type,release_date,release_year,genres_json,description,accent,producer,featured_artists_json,credits_json,label,catalogue_number,badges_json,featured,display_order,template,visibility,published,untitled_url,destination,card_json,features_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,slug,title,kind,String(body.releaseDate||'').slice(0,20),Number(body.releaseYear)||null,JSON.stringify(genres),String(body.description||'').slice(0,2000),/^#[0-9a-f]{6}$/i.test(body.accent||'')?body.accent:'#777777',String(body.producer||'').slice(0,120),JSON.stringify(Array.isArray(body.featuredArtists)?body.featuredArtists.map(x=>String(x).slice(0,80)).slice(0,12):[]),JSON.stringify(body.credits&&typeof body.credits==='object'?body.credits:{}),String(body.label||'').slice(0,120),String(body.catalogueNumber||'').slice(0,80),JSON.stringify(Array.isArray(body.badges)?body.badges.map(x=>String(x).slice(0,32)).slice(0,8):[]),body.featured?1:0,Number(body.displayOrder)||100,['standard','featured','upcoming','mystery','ep','single'].includes(body.template)?body.template:'standard','public',0,String(body.untitledUrl||'').startsWith('https://untitled.stream/')?body.untitledUrl:'','untitled','{}',JSON.stringify({shuffle:true,keyboard:true,portal:true,glitch:true,memory:true,radioEligible:false}),now,now).run();
    await env.DB.batch([env.DB.prepare('UPDATE album_config SET version=version+1,updated_at=? WHERE id=1').bind(now),env.DB.prepare('INSERT INTO release_revisions(release_id,created_at,action,snapshot_json) VALUES(?,?,?,?)').bind(id,now,'created',JSON.stringify({title,slug}))]);
    return json({ ok:true,id },201);
  }
  const releaseMatch = path.match(/^\/api\/releases\/([a-z0-9-]+)\/(publish|archive|restore)$/);
  if (releaseMatch && request.method === 'POST') {
    const [,id,action]=releaseMatch, now=Date.now();
    const field = action==='publish' ? 'published=1,archived_at=NULL' : action==='archive' ? 'archived_at=?' : 'archived_at=NULL';
    const result = action==='archive' ? await env.DB.prepare(`UPDATE releases SET ${field},updated_at=?,version=version+1 WHERE id=?`).bind(now,now,id).run() : await env.DB.prepare(`UPDATE releases SET ${field},updated_at=?,version=version+1 WHERE id=?`).bind(now,id).run();
    if (!result.meta?.changes) return json({error:'release not found'},404);
    await env.DB.prepare('UPDATE album_config SET version=version+1,updated_at=? WHERE id=1').bind(now).run();
    return json({ok:true});
  }
  const releaseEdit = path.match(/^\/api\/releases\/([a-z0-9-]+)$/);
  if (releaseEdit && request.method === 'PUT') {
    let body; try { body = await request.json(); } catch (_) { return json({error:'bad json'},400); }
    const id=releaseEdit[1], prior=await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first();
    if (!prior) return json({error:'release not found'},404);
    const title=String(body.title??prior.title).trim().slice(0,120);
    const slug=String(body.slug??prior.slug).trim().toLowerCase().slice(0,80);
    if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({error:'invalid title or slug'},400);
    const artwork=String(body.artworkUrl??prior.artwork_url??'').trim();
    if (artwork && !/^https:\/\/raw\.githubusercontent\.com\/stankquilizer\/stankquilizer\/(?:main|codex\/site-hardening)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif)$/i.test(artwork)) return json({error:'artwork must be an image in the stankquilizer GitHub repository'},400);
    const untitled=String(body.untitledUrl??prior.untitled_url).trim();
    if (untitled && !/^https:\/\/untitled\.stream\/library\/project\/[A-Za-z0-9]+$/.test(untitled)) return json({error:'invalid Untitled release link'},400);
    const genres=Array.isArray(body.genres)?body.genres.map(x=>String(x).trim().toLowerCase().slice(0,32)).filter(Boolean).slice(0,12):JSON.parse(prior.genres_json);
    const listField=(value,fallback,maxItems,maxLength)=>Array.isArray(value)?value.map(x=>String(x).trim().slice(0,maxLength)).filter(Boolean).slice(0,maxItems):fallback;
    const releaseType=['album','ep','single','other'].includes(body.releaseType)?body.releaseType:prior.release_type;
    const priorFeatures=JSON.parse(prior.features_json||'{}');
    const featureKeys=['shuffle_enabled','keyboard_enabled','portal_enabled','glitch_enabled','memory_enabled','artwork_reveal_enabled','cursor_tint_enabled','vhs_enabled'];
    const nextFeatures={...priorFeatures};
    nextFeatures.radio_eligible=false;
    if(body.features&&typeof body.features==='object')for(const key of featureKeys)if(typeof body.features[key]==='boolean')nextFeatures[key]=body.features[key];
    const fields={release_type:releaseType,release_date:String(body.releaseDate??prior.release_date).slice(0,20),release_year:Number(body.releaseYear??prior.release_year)||null,genres_json:JSON.stringify(genres),description:String(body.description??prior.description).slice(0,2000),accent:/^#[0-9a-f]{6}$/i.test(body.accent??prior.accent)?(body.accent??prior.accent):'#777777',producer:String(body.producer??prior.producer).slice(0,120),featured_artists_json:JSON.stringify(listField(body.featuredArtists,JSON.parse(prior.featured_artists_json),20,100)),credits_json:JSON.stringify(listField(body.credits,JSON.parse(prior.credits_json),40,200)),badges_json:JSON.stringify(listField(body.badges,JSON.parse(prior.badges_json),12,40)),label:String(body.label??prior.label).slice(0,120),catalogue_number:String(body.catalogueNumber??prior.catalogue_number).slice(0,80),artwork_url:artwork,untitled_url:untitled,destination:body.destination==='native'&&prior.published?'native':'untitled',template:['standard','featured','upcoming','mystery','ep','single'].includes(body.template)?body.template:prior.template,featured:body.featured===undefined?prior.featured:(body.featured?1:0),display_order:Number.isFinite(Number(body.displayOrder))?Math.max(0,Math.min(10000,Number(body.displayOrder))):prior.display_order,track_count_override:body.trackCountOverride===''||body.trackCountOverride==null?null:Math.max(0,Math.min(500,Number(body.trackCountOverride)||0)),runtime_override:body.runtimeOverride===''||body.runtimeOverride==null?null:Math.max(0,Math.min(86400000,Number(body.runtimeOverride)||0)),card_json:JSON.stringify(body.card&&typeof body.card==='object'?body.card:JSON.parse(prior.card_json)),features_json:JSON.stringify(nextFeatures)};
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO release_revisions(release_id,created_at,action,snapshot_json) VALUES(?,?,?,?)').bind(id,now,'edited',JSON.stringify(prior)),
      env.DB.prepare(`UPDATE releases SET title=?,slug=?,release_type=?,release_date=?,release_year=?,genres_json=?,description=?,accent=?,producer=?,featured_artists_json=?,credits_json=?,badges_json=?,label=?,catalogue_number=?,artwork_url=?,untitled_url=?,destination=?,template=?,featured=?,display_order=?,track_count_override=?,runtime_override=?,card_json=?,features_json=?,updated_at=?,version=version+1 WHERE id=?`).bind(title,slug,fields.release_type,fields.release_date,fields.release_year,fields.genres_json,fields.description,fields.accent,fields.producer,fields.featured_artists_json,fields.credits_json,fields.badges_json,fields.label,fields.catalogue_number,fields.artwork_url,fields.untitled_url,fields.destination,fields.template,fields.featured,fields.display_order,fields.track_count_override,fields.runtime_override,fields.card_json,fields.features_json,now,id),
      env.DB.prepare('UPDATE album_config SET version=version+1,updated_at=? WHERE id=1').bind(now)
    ]);
    return json({ok:true,id,updatedAt:now});
  }
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

async function publicAlbumApi(request, env, url) {
  const origin = request.headers.get('origin') || '';
  const cors = origin === 'https://stankquilizer.stankquilizer.workers.dev'
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'if-none-match', vary: 'Origin' }
    : {};
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
  if (url.pathname === '/public-api/albums/version') {
    const row = await env.DB.prepare('SELECT version FROM album_config WHERE id=1').first();
    const version = Number(row?.version || 1);
    const headers = { ...cors, etag: '"albums-' + version + '"', 'cache-control': 'public, max-age=15' };
    if (request.headers.get('if-none-match') === headers.etag) return new Response(null, { status: 304, headers });
    return json({ version }, 200, headers);
  }
  if (url.pathname === '/public-api/albums') {
    const releases = await rows(env.DB, `SELECT id,slug,title,release_type,release_date,release_year,genres_json,description,accent,artwork_url,featured_artists_json,badges_json,featured,display_order,template,untitled_url,destination,card_json,features_json,track_count_override,runtime_override
      FROM releases WHERE published=1 AND archived_at IS NULL AND visibility='public' ORDER BY display_order,id`);
    const ids = releases.map(item => item.id);
    let tracks = [];
    if (ids.length) tracks = await rows(env.DB, `SELECT id,release_id,title,position,duration_ms,stream_type,stream_bytes FROM release_tracks WHERE published=1 AND release_id IN (${ids.map(() => '?').join(',')}) ORDER BY release_id,position`, ...ids);
    const headers = { ...cors, 'cache-control': 'public, max-age=15', etag: '"albums-' + (Number((await env.DB.prepare('SELECT version FROM album_config WHERE id=1').first())?.version || 1)) + '"' };
    if (request.headers.get('if-none-match') === headers.etag) return new Response(null, { status: 304, headers });
    return json({ releases: releases.map(release => ({ ...release, genres: JSON.parse(release.genres_json), badges: JSON.parse(release.badges_json), featuredArtists: JSON.parse(release.featured_artists_json), card: JSON.parse(release.card_json), features: { ...JSON.parse(release.features_json), radio_eligible: false }, tracks: tracks.filter(track => track.release_id === release.id) })) }, 200, headers);
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/public-api/albums')) {
      try { return await publicAlbumApi(request, env, url); }
      catch (_) { return json({ error: 'album catalog unavailable' }, 503, { 'access-control-allow-origin': 'https://stankquilizer.stankquilizer.workers.dev' }); }
    }
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
