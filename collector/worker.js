const DEFAULT_PUBLIC_ORIGIN = 'https://stankquilizer.stankquilizer.workers.dev';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 25;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PAYLOAD_FIELDS = new Set(['events']);
const EVENT_FIELDS = new Set(['eventId', 'sessionId', 'visitorKey', 'ts', 'type', 'surface', 'subject', 'meta', 'build']);
const EVENT_TYPES = new Set([
  'session_start', 'session_end', 'radio_play', 'track_started', 'track_changed',
  'meaningful_play', 'track_completed', 'track_skipped', 'track_progress',
  'player_toggle', 'shuffle', 'theme_toggle', 'share', 'feature_use',
  'fullscreen_open', 'fullscreen_close', 'album_entered', 'release_clicked',
  'title_interaction', 'reset_action', 'rebirth', 'page_hidden', 'page_visible',
  'memory_snapshot', 'site_state', 'temperature_change', 'archetype_change',
  'rediscovery', 'avoidance_change', 'affinity_change', 'decay', 'memory_ghost',
  'memory_corruption', 'milestone', 'unlock', 'completion', 'session_evolution',
  'late_night', 'analyser_state', 'gain_change', 'media_session', 'volume_change',
  'playback_error', 'qa_event'
]);
const SURFACES = new Set(['site', 'player', 'radio', 'album', 'release', 'memory', 'theme', 'share', 'system']);
const META_FIELDS = new Set([
  'positionSec', 'durationSec', 'listenedSec', 'progressPct', 'reason', 'source',
  'generation', 'memoryState', 'temperatureBucket', 'relationship', 'archetype',
  'sessionCount', 'trackCount', 'albumCount', 'resetCount', 'repeatIndex', 'listeningMinutes', 'milestoneCount', 'decayDays',
  'queuePosition', 'wasRediscovered', 'radioMode', 'feature', 'milestone',
  'completed', 'visible', 'volumeBucket', 'build'
]);
const META_TEXT_FIELDS = new Set(['reason', 'source', 'memoryState', 'relationship', 'archetype', 'radioMode', 'feature', 'milestone', 'build']);

const allowedOrigins = env => new Set(
  String(env.TELEMETRY_ALLOWED_ORIGINS || DEFAULT_PUBLIC_ORIGIN)
    .split(',').map(value => value.trim()).filter(Boolean)
);

function response(body, status, origin) {
  const headers = new Headers({ 'cache-control': 'no-store' });
  if (body !== null) headers.set('content-type', 'application/json; charset=utf-8');
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '86400');
    headers.set('vary', 'Origin');
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validateMeta(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!META_FIELDS.has(key)) return null;
    if (typeof item === 'boolean') result[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item)) result[key] = Math.max(-1000000, Math.min(1000000, Math.round(item * 100) / 100));
    else if (typeof item === 'string' && META_TEXT_FIELDS.has(key)) {
      result[key] = cleanText(item, 60);
    } else return null;
  }
  return result;
}

function validateEvent(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).some(key => !EVENT_FIELDS.has(key))) return null;
  const eventId = String(input.eventId || '');
  const sessionId = String(input.sessionId || '');
  const visitorKey = String(input.visitorKey || '');
  if (!/^[a-f0-9]{32}$/i.test(eventId) || !/^[a-f0-9]{32}$/i.test(sessionId) || !/^[a-f0-9]{32}$/i.test(visitorKey)) return null;
  const type = String(input.type || '');
  if (!EVENT_TYPES.has(type)) return null;
  const surface = String(input.surface || 'site');
  if (!SURFACES.has(surface)) return null;
  const timestamp = Number(input.ts);
  if (!Number.isFinite(timestamp)) return null;
  const ts = Math.max(now - MAX_AGE_MS, Math.min(now, Math.round(timestamp)));
  const subject = cleanText(input.subject || '', 100);
  const meta = validateMeta(input.meta);
  if (!meta) return null;
  const metaJson = JSON.stringify(meta);
  if (metaJson.length > 1600) return null;
  const build = cleanText(input.build || 'unknown', 60).replace(/[^a-zA-Z0-9._+-]/g, '').slice(0, 60) || 'unknown';
  return { eventId, sessionId, visitorKey, type, surface, subject, ts, metaJson, build };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originHeader = request.headers.get('Origin') || '';
    const origin = allowedOrigins(env).has(originHeader) ? originHeader : '';

    if (url.pathname === '/health' && request.method === 'GET') {
      return response({ ok: true, time: Date.now() }, 200);
    }
    if (url.pathname !== '/collect') return response({ error: 'not found' }, 404, origin);
    if (request.method === 'OPTIONS') {
      return origin ? response(null, 204, origin) : response({ error: 'forbidden origin' }, 403);
    }
    if (request.method !== 'POST') return response({ error: 'method not allowed' }, 405, origin);
    if (!origin) return response({ error: 'forbidden origin' }, 403);

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) return response({ error: 'payload too large' }, 413, origin);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return response({ error: 'payload too large' }, 413, origin);
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { return response({ error: 'bad json' }, 400, origin); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !PAYLOAD_FIELDS.has(key))) {
      return response({ error: 'invalid payload shape' }, 400, origin);
    }
    if (!Array.isArray(payload?.events) || payload.events.length === 0) return response({ error: 'events required' }, 400, origin);
    if (payload.events.length > MAX_EVENTS) return response({ error: 'too many events' }, 413, origin);

    const now = Date.now();
    const valid = payload.events.map(event => validateEvent(event, now)).filter(Boolean);
    if (!valid.length) return response({ ok: true, accepted: 0, rejected: payload.events.length, acknowledgedIds: [] }, 202, origin);

    const statements = [];
    for (const event of valid) {
      statements.push(env.DB.prepare(
        'INSERT INTO telemetry_dedupe(event_id,session_id,accepted_at) VALUES(?,?,?) ON CONFLICT(event_id) DO NOTHING'
      ).bind(event.eventId, event.sessionId, now));
      statements.push(env.DB.prepare(
        'INSERT INTO events(session_id,ts,type,surface,subject,meta_json) SELECT ?,?,?,?,?,? WHERE changes()=1'
      ).bind(event.sessionId, event.ts, event.type, event.surface, event.subject, event.metaJson));
      statements.push(env.DB.prepare(`
        INSERT INTO sessions(id,visitor_key,started_at,last_seen,build,event_count)
        SELECT ?,?,?,?,?,1 WHERE changes()=1
        ON CONFLICT(id) DO UPDATE SET
          visitor_key=excluded.visitor_key,
          started_at=MIN(sessions.started_at,excluded.started_at),
          last_seen=MAX(sessions.last_seen,excluded.last_seen),
          build=excluded.build,
          event_count=sessions.event_count+1
      `).bind(event.sessionId, event.visitorKey, event.ts, event.ts, event.build));
    }

    try {
      const results = await env.DB.batch(statements);
      const accepted = valid.reduce((count, _, index) => count + (Number(results[index * 3]?.meta?.changes) ? 1 : 0), 0);
      return response({
        ok: true,
        accepted,
        rejected: payload.events.length - valid.length,
        acknowledgedIds: valid.map(event => event.eventId)
      }, 202, origin);
    } catch (_) {
      return response({ error: 'storage unavailable' }, 503, origin);
    }
  }
};
