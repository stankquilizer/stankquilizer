import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const importWorker = async path => {
  const source = await read(path);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

function mockD1() {
  const state = { dedupe: new Set(), events: [], sessions: new Map(), probes: [] };
  const prepare = sql => ({
    sql,
    values: [],
    bind(...values) { this.values = values; return this; },
    async all() { return { results: [] }; },
    async first() { return { n: 1 }; },
    async run() { return { success: true }; }
  });
  const db = {
    prepare,
    async batch(statements) {
      if (statements.some(statement => statement.sql.includes("'qa_event'"))) {
        state.probes.push(...statements.map(statement => ({ sql: statement.sql, values: statement.values })));
        return statements.map(() => ({ meta: { changes: 1 } }));
      }
      const results = [];
      for (let index = 0; index < statements.length; index += 3) {
        const [dedupe, event, session] = statements.slice(index, index + 3);
        const [eventId, sessionId, acceptedAt] = dedupe.values;
        const fresh = !state.dedupe.has(eventId);
        if (fresh) {
          state.dedupe.add(eventId);
          state.events.push({ sessionId, ...event.values });
          const [id, visitorKey, startedAt, lastSeen, build] = session.values;
          const previous = state.sessions.get(id);
          state.sessions.set(id, previous
            ? { ...previous, lastSeen: Math.max(previous.lastSeen, lastSeen), eventCount: previous.eventCount + 1 }
            : { visitorKey, startedAt, lastSeen, build, eventCount: 1 });
        }
        results.push({ meta: { changes: fresh ? 1 : 0 } }, { meta: { changes: fresh ? 1 : 0 } }, { meta: { changes: fresh ? 1 : 0 } });
      }
      return results;
    }
  };
  return { db, state };
}

const origin = 'https://stankquilizer.stankquilizer.workers.dev';
const id = 'a'.repeat(32);
const telemetryEvent = (overrides = {}) => ({
  eventId: id,
  sessionId: 'b'.repeat(32),
  visitorKey: 'c'.repeat(32),
  ts: Date.now(),
  type: 'track_started',
  surface: 'radio',
  subject: '01 - Track',
  meta: { source: 'radio' },
  build: 'test',
  ...overrides
});

test('collector accepts an event once and acknowledges retries without duplicate D1 writes', async () => {
  const worker = (await importWorker('collector/worker.js')).default;
  const { db, state } = mockD1();
  const send = () => worker.fetch(new Request('https://collector.example/collect', {
    method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' },
    body: JSON.stringify({ events: [telemetryEvent()] })
  }), { DB: db });

  const first = await send();
  const firstBody = await first.json();
  assert.equal(first.status, 202);
  assert.equal(firstBody.accepted, 1);
  assert.deepEqual(firstBody.acknowledgedIds, [id]);
  const retryBody = await (await send()).json();
  assert.equal(retryBody.accepted, 0);
  assert.equal(state.events.length, 1);
  assert.equal(state.sessions.get('b'.repeat(32)).eventCount, 1);
});

test('migration schema and collector SQL deduplicate against SQLite', async () => {
  const worker = (await importWorker('collector/worker.js')).default;
  const database = new DatabaseSync(':memory:');
  database.exec(await read('observatory/migrations/0001_initial.sql'));
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...nextValues) { values = nextValues; return this; },
        all() { return { results: database.prepare(sql).all(...values) }; },
        first() { return database.prepare(sql).get(...values) || null; },
        run() { return database.prepare(sql).run(...values); }
      };
    },
    batch(statements) {
      database.exec('BEGIN');
      try {
        const results = statements.map(statement => ({ meta: { changes: statement.run().changes } }));
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const request = () => worker.fetch(new Request('https://collector.example/collect', {
    method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' },
    body: JSON.stringify({ events: [telemetryEvent()] })
  }), { DB: db });
  assert.equal((await (await request()).json()).accepted, 1);
  assert.equal((await (await request()).json()).accepted, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
  assert.equal(database.prepare('SELECT event_count FROM sessions').get().event_count, 1);
  database.close();
});

test('collector rejects unexpected fields and disallowed origins', async () => {
  const worker = (await importWorker('collector/worker.js')).default;
  const { db } = mockD1();
  const request = (body, requestOrigin = origin) => worker.fetch(new Request('https://collector.example/collect', {
    method: 'POST', headers: { Origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body)
  }), { DB: db });
  const rejected = await (await request({ events: [telemetryEvent({ email: 'person@example.com' })] })).json();
  assert.equal(rejected.accepted, 0);
  assert.equal(rejected.rejected, 1);
  assert.equal((await request({ events: [telemetryEvent()], debug: true })).status, 400);
  assert.equal((await request({ events: [telemetryEvent()] }, 'https://attacker.example')).status, 403);
});

test('Observatory API stays protected and records QA probes as synthetic', async () => {
  const worker = (await importWorker('observatory/worker.js')).default;
  const { db, state } = mockD1();
  const env = { DB: db, OBSERVATORY_PASSWORD: 'test-secret' };
  const denied = await worker.fetch(new Request('https://observatory.example/api/health'), env);
  assert.equal(denied.status, 401);

  const login = await worker.fetch(new Request('https://observatory.example/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test-secret' })
  }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const probe = await worker.fetch(new Request('https://observatory.example/api/qa', {
    method: 'POST', headers: { Cookie: cookie, 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'track_started' })
  }), env);
  assert.equal(probe.status, 201);
  assert.deepEqual((await probe.json()).synthetic, true);
  assert.equal(state.probes.length, 3);
  assert.match(state.probes[2].values[3], /"synthetic":true/);
});

test('HTML scripts parse and telemetry selectors exist in the preserved site', async () => {
  const [site, dashboard] = await Promise.all([read('index.html'), read('observatory/public/index.html')]);
  for (const [file, html] of [['index.html', site], ['observatory/public/index.html', dashboard]]) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(text => text.trim());
    assert.ok(scripts.length, `${file} should contain inline scripts`);
    scripts.forEach((source, index) => assert.doesNotThrow(() => new vm.Script(source, { filename: `${file}#${index + 1}` })));
  }
  for (const selector of ['playerAudio', 'playerTrack', 'playerAlbum', 'playerToggle', 'playerNext', 'playerMute', 'playerVolume', 'themeToggle', 'shuffleBtn', 'fullscreenPlayer', 'fsToggle', 'fsNext', 'fsLogToggle', 'fsLogCopy']) {
    assert.ok(site.includes(`id="${selector}"`), `public site integration selector #${selector} must exist`);
  }
  assert.ok(site.includes('/telemetry-client.js'));
});
