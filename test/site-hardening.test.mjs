import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadTelemetry({ online = false, fetchImpl } = {}) {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const window = {
    crypto: webcrypto,
    addEventListener(type, callback) {
      const callbacks = windowListeners.get(type) || [];
      callbacks.push(callback);
      windowListeners.set(type, callbacks);
    }
  };
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    addEventListener(type, callback) {
      const callbacks = documentListeners.get(type) || [];
      callbacks.push(callback);
      documentListeners.set(type, callbacks);
    },
    getElementById() { return null; }
  };
  class MutationObserver { observe() {} }
  const navigator = { onLine: online, sendBeacon() { return false; } };
  const context = {
    window, document, navigator, localStorage, sessionStorage,
    crypto: webcrypto, MutationObserver, Blob, Element: class Element {},
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() {},
    fetch: fetchImpl || (async () => ({ ok: true, async json() { return { acknowledgedIds: [] }; } }))
  };
  return { context, localStorage, sessionStorage, window, windowListeners, documentListeners };
}

test('telemetry keeps anonymous events queued offline and clears them only after acknowledgement', async () => {
  let failFirstRequest = true;
  const requests = [];
  const harness = loadTelemetry({
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (failFirstRequest) {
        failFirstRequest = false;
        throw new Error('temporary network failure');
      }
      return {
        ok: true,
        async json() { return { acknowledgedIds: requests.at(-1).events.map(event => event.eventId) }; }
      };
    }
  });
  vm.runInNewContext(await read('telemetry-client.js'), harness.context);
  const telemetry = harness.window.stankquilizerTelemetry;
  assert.ok(telemetry.getQueueSize() >= 2, 'startup events remain queued while offline');

  telemetry.emit('feature_use', 'player', 'mute', { feature: 'mute' });
  const queued = JSON.parse(harness.localStorage.getItem('sq_telemetry_queue_v1'));
  assert.ok(queued.length >= 3);
  assert.ok(queued.every(event => /^[a-f0-9]{32}$/i.test(event.eventId)));
  assert.ok(queued.every(event => !('email' in event) && !('ip' in event) && !('userAgent' in event)));
  assert.match(harness.localStorage.getItem('sq_telemetry_visitor_v1'), /^[a-f0-9]{32}$/i);

  await telemetry.flush();
  assert.equal(requests.length, 0, 'offline flush does not discard or send events');

  harness.context.navigator.onLine = true;
  await telemetry.flush();
  assert.equal(telemetry.getQueueSize(), queued.length, 'failed request keeps the durable queue intact');
  await telemetry.flush();
  assert.equal(telemetry.getQueueSize(), 0, 'acknowledged event IDs are removed');
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('sq_telemetry_queue_v1')), []);
});

test('public site hardening remains additive and mobile-safe', async () => {
  const html = await read('index.html');
  assert.match(html, /<audio id="playerAudio" preload="none"><\/audio>/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /function runVisibleAnimation\(step\)/);
  assert.match(html, /reducedMotionQuery\.addEventListener\?\.\("change"/);
  assert.match(html, /barCount = window\.matchMedia\("\(max-width: 650px\)"\)\.matches \? 48 : 80/);
  assert.match(html, /const MAX_PARTICLES = 200/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /role="button" tabindex="0" aria-label="open fullscreen player"/);
  assert.match(html, /transitionSequence/);
  assert.match(html, /consecutivePlaybackErrors/);
  assert.match(html, /Array\.from\(new Set\(raw\.albumsVisited/);
  assert.match(html, /focusable = Array\.from\(fsPlayer\.querySelectorAll/);
  assert.match(html, /getComputedStyle\(element\)\.visibility !== "hidden"/);
  assert.match(html, /aria-labelledby","c5ResetTitle"/);
  assert.match(html, /closeResetPanel=\(\)=>/);
  assert.match(html, /knownTracks = new Set\(trackCatalog\.map/);
  assert.match(html, /function runVisibleAnimation\(step\)/);

  const audioFiles = await readdir(new URL('../audio/', import.meta.url));
  const referencedFiles = [...html.matchAll(/file:\s*"(audio\/[^\"]+\.mp3)"/g)].map(match => match[1]);
  assert.equal(referencedFiles.length, 12, 'radio keeps all twelve catalog entries');
  assert.equal(new Set(referencedFiles).size, referencedFiles.length, 'radio catalog has no duplicate audio paths');
  for (const file of referencedFiles) assert.ok(audioFiles.includes(file.slice('audio/'.length)), `${file} exists`);
});
