const COOKIE = "sq_obs";
const enc = new TextEncoder();
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extra } });
}
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function sign(secret, value) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}
async function makeSession(secret) {
  const value = b64(crypto.getRandomValues(new Uint8Array(18)));
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const sig = await sign(secret, `${value}.${exp}`);
  return `${value}.${exp}.${sig}`;
}
async function validSession(secret, token) {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || Number(parts[1]) < Date.now()) return false;
  const expected = await sign(secret, `${parts[0]}.${parts[1]}`);
  return expected === parts[2];
}
function cookieValue(req) {
  const raw = req.headers.get("cookie") || "";
  const match = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return match?.[1] || "";
}
async function authed(req, env) { return validSession(env.OBSERVATORY_PASSWORD, cookieValue(req)); }

async function api(req, env, url) {
  if (url.pathname === "/api/auth-status" && req.method === "GET") {
    return json({ worker: "RUNNING", version: "OBS-CLEAN-1", secretConfigured: !!env.OBSERVATORY_PASSWORD, d1Configured: !!env.DB });
  }
  if (url.pathname === "/api/login" && req.method === "POST") {
    let body = {}; try { body = await req.json(); } catch {}
    if (!env.OBSERVATORY_PASSWORD || body.password !== env.OBSERVATORY_PASSWORD) return json({ ok: false }, 401);
    const token = await makeSession(env.OBSERVATORY_PASSWORD);
    return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` });
  }
  if (url.pathname === "/api/logout") {
    return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }
  if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);

  if (url.pathname === "/api/health") return json({ ok: true, now: Date.now() });
  if (url.pathname === "/api/overview") {
    const since = Date.now() - 86400000;
    const q = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) n FROM sessions WHERE started_at >= ?").bind(since),
      env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts >= ? AND type = 'meaningful_play'").bind(since),
      env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts >= ? AND type = 'track_completed'").bind(since),
      env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts >= ? AND type = 'track_skipped'").bind(since),
      env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts >= ?").bind(since),
      env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts >= ? AND type = 'rediscovery'").bind(since)
    ]);
    return json({ sessions: q[0].results[0].n, meaningfulPlays: q[1].results[0].n, completions: q[2].results[0].n, skips: q[3].results[0].n, events: q[4].results[0].n, rediscoveries: q[5].results[0].n });
  }
  if (url.pathname === "/api/events") {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    return json((await env.DB.prepare("SELECT * FROM events ORDER BY ts DESC LIMIT ?").bind(limit).all()).results);
  }
  if (url.pathname === "/api/sessions") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    return json((await env.DB.prepare("SELECT * FROM sessions ORDER BY last_seen DESC LIMIT ?").bind(limit).all()).results);
  }
  if (url.pathname === "/api/deployments" && req.method === "GET") return json((await env.DB.prepare("SELECT * FROM deployments ORDER BY created_at DESC LIMIT 100").all()).results);
  if (url.pathname === "/api/deployments" && req.method === "POST") {
    let body = {}; try { body = await req.json(); } catch {}
    await env.DB.prepare("INSERT INTO deployments(created_at,build,ref,note) VALUES(?,?,?,?)").bind(Date.now(), String(body.build || "").slice(0, 80), String(body.ref || "").slice(0, 120), String(body.note || "").slice(0, 500)).run();
    return json({ ok: true }, 201);
  }
  if (url.pathname === "/api/flags" && req.method === "GET") return json((await env.DB.prepare("SELECT * FROM feature_flags ORDER BY name").all()).results);
  if (url.pathname === "/api/flags" && req.method === "POST") {
    let body = {}; try { body = await req.json(); } catch {}
    await env.DB.prepare("INSERT INTO feature_flags(name,enabled,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at").bind(String(body.name || "").slice(0, 100), body.enabled ? 1 : 0, Date.now()).run();
    return json({ ok: true });
  }
  if (url.pathname === "/api/qa" && req.method === "POST") {
    let body = {}; try { body = await req.json(); } catch {}
    const id = "qa" + crypto.randomUUID().replaceAll("-", "").slice(0, 30);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO sessions(id,visitor_key,started_at,last_seen,build,event_count) VALUES(?,?,?,?,?,1)").bind(id, id, now, now, "observatory-qa").run();
    await env.DB.prepare("INSERT INTO events(session_id,ts,type,surface,subject,meta_json) VALUES(?,?,?,?,?,?)").bind(id, now, "qa_event", "system", String(body.scenario || "scenario").slice(0, 120), JSON.stringify({ synthetic: true, scenario: body.scenario || "scenario" })).run();
    return json({ ok: true, sessionId: id }, 201);
  }
  if (url.pathname === "/api/session-events") {
    const id = url.searchParams.get("id") || "";
    return json((await env.DB.prepare("SELECT * FROM events WHERE session_id=? ORDER BY ts").bind(id).all()).results);
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api(req, env, url);
    const response = await env.ASSETS.fetch(req);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
    headers.set("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    return new Response(response.body, { status: response.status, headers });
  }
};
