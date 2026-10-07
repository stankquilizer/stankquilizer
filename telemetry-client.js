(() => {
  'use strict';

  const endpoint = String(window.STANKQUILIZER_TELEMETRY_ENDPOINT || 'https://telemetry.stankquilizer.workers.dev/collect');
  const build = String(window.STANKQUILIZER_BUILD || 'unknown').slice(0, 60);
  const visitorKeyName = 'sq_telemetry_visitor_v1';
  const sessionKeyName = 'sq_telemetry_session_v1';
  const queueKeyName = 'sq_telemetry_queue_v1';
  const maxQueue = 500;
  const batchSize = 20;
  const knownTypes = new Set([
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
  const safeMetaKeys = new Set([
    'positionSec', 'durationSec', 'listenedSec', 'progressPct', 'reason', 'source',
    'generation', 'memoryState', 'temperatureBucket', 'relationship', 'archetype',
    'sessionCount', 'trackCount', 'albumCount', 'resetCount', 'repeatIndex', 'listeningMinutes', 'milestoneCount', 'decayDays',
    'queuePosition', 'wasRediscovered', 'radioMode', 'feature', 'milestone',
    'completed', 'visible', 'volumeBucket', 'build'
  ]);
  const surfaces = new Set(['site', 'player', 'radio', 'album', 'release', 'memory', 'theme', 'share', 'system']);
  const safeStorage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } },
    getSession(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } },
    setSession(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} }
  };

  function randomId(bytes = 16) {
    const values = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(values);
    else for (let i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 256);
    return Array.from(values, value => value.toString(16).padStart(2, '0')).join('');
  }

  function readId(storage, key) {
    let value = storage.get(key);
    if (!/^[a-f0-9]{32}$/i.test(value || '')) {
      value = randomId();
      storage.set(key, value);
    }
    return value;
  }

  const visitorKey = readId(safeStorage, visitorKeyName);
  let sessionId = safeStorage.getSession(sessionKeyName);
  if (!/^[a-f0-9]{32}$/i.test(sessionId || '')) {
    sessionId = randomId();
    safeStorage.setSession(sessionKeyName, sessionId);
  }

  let queue = [];
  try {
    const stored = JSON.parse(safeStorage.get(queueKeyName) || '[]');
    if (Array.isArray(stored)) queue = stored.filter(event => event && typeof event === 'object').slice(-maxQueue);
  } catch (_) {}

  function cleanSubject(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function cleanMeta(input) {
    const output = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
    for (const [key, value] of Object.entries(input)) {
      if (!safeMetaKeys.has(key)) continue;
      if (typeof value === 'boolean') output[key] = value;
      else if (typeof value === 'number' && Number.isFinite(value)) output[key] = Math.max(-1000000, Math.min(1000000, Math.round(value * 100) / 100));
      else if (typeof value === 'string') output[key] = cleanSubject(value).slice(0, 60);
    }
    return output;
  }

  function persist() {
    safeStorage.set(queueKeyName, JSON.stringify(queue.slice(-maxQueue)));
  }

  function emit(type, surface = 'site', subject = '', meta = {}) {
    if (!knownTypes.has(type)) return;
    const event = {
      eventId: randomId(),
      sessionId,
      visitorKey,
      ts: Date.now(),
      type,
      surface: surfaces.has(surface) ? surface : 'site',
      subject: cleanSubject(subject),
      meta: cleanMeta(meta),
      build
    };
    queue.push(event);
    if (queue.length > maxQueue) queue = queue.slice(-maxQueue);
    persist();
    scheduleFlush(0);
  }

  function scheduleFlush(delay) {
    clearTimeout(scheduleFlush.timer);
    scheduleFlush.timer = setTimeout(flush, delay);
  }

  let sending = false;
  let failures = 0;
  async function flush() {
    if (sending || !queue.length || !navigator.onLine) return;
    sending = true;
    const batch = queue.slice(0, batchSize);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch })
      });
      if (!response.ok) throw new Error('collector rejected batch');
      const result = await response.json();
      const acknowledged = new Set(Array.isArray(result.acknowledgedIds) ? result.acknowledgedIds : []);
      if (acknowledged.size) {
        queue = queue.filter(event => !acknowledged.has(event.eventId));
        persist();
      }
      failures = 0;
      if (queue.length) scheduleFlush(0);
    } catch (_) {
      failures = Math.min(8, failures + 1);
      scheduleFlush(Math.min(60000, 1000 * (2 ** failures)));
    } finally {
      sending = false;
    }
  }

  function beaconFlush() {
    if (!queue.length || !navigator.sendBeacon) return;
    const batch = queue.slice(0, batchSize);
    try {
      navigator.sendBeacon(endpoint, new Blob([JSON.stringify({ events: batch })], { type: 'application/json' }));
    } catch (_) {}
  }

  function currentTrack() {
    return {
      title: cleanSubject(document.getElementById('playerTrack')?.textContent),
      album: cleanSubject(document.getElementById('playerAlbum')?.textContent)
    };
  }

  function profileSnapshot() {
    try {
      const profile = window.stankquilizerMemory?.getProfile?.();
      if (!profile || typeof profile !== 'object') return {};
      return {
        sessionCount: Number(profile.sessions) || 0,
        trackCount: profile.track && typeof profile.track === 'object' ? Object.keys(profile.track).length : 0,
        albumCount: profile.album && typeof profile.album === 'object' ? Object.keys(profile.album).length : 0,
        listeningMinutes: Math.round((Number(profile.totalListeningMs) || 0) / 60000),
        milestoneCount: profile.milestones && typeof profile.milestones === 'object' ? Object.keys(profile.milestones).length : 0,
        decayDays: Number(profile.lastDecayDays) || 0,
        generation: Number(profile.generation) || 1,
        resetCount: Number(profile.resetCount) || 0,
        temperatureBucket: Math.round((Number(profile.temperature) || 0) / 10) * 10,
        memoryState: cleanSubject(profile.state),
        relationship: cleanSubject(profile.relationship),
        completed: !!profile.completed
      };
    } catch (_) { return {}; }
  }

  emit('session_start', 'system', '', { source: 'site' });
  const initialSnapshot = profileSnapshot();
  emit('memory_snapshot', 'memory', '', initialSnapshot);
  emit('site_state', 'memory', '', initialSnapshot);
  if (initialSnapshot.decayDays > 0) emit('decay', 'memory', '', { decayDays: initialSnapshot.decayDays });

  let trackKey = '';
  let trackSeconds = 0;
  let lastCurrentTime = 0;
  let meaningfulSent = false;
  let trackFinished = false;
  const progressSent = new Set();
  const lastState = { state: '', relationship: '', generation: '' };
  let lastTemperatureBucket = null;
  let activeRadioSession = false;

  function startTrack() {
    const track = currentTrack();
    if (!track.title || /^(reconnecting|silent until)/i.test(track.title)) return;
    const key = track.title + '\u0000' + track.album;
    if (key === trackKey) return;
    if (trackKey && !trackFinished) emit('track_skipped', 'radio', track.title, { listenedSec: Math.round(trackSeconds), reason: 'changed-before-end' });
    trackKey = key;
    trackSeconds = 0;
    lastCurrentTime = 0;
    meaningfulSent = false;
    trackFinished = false;
    progressSent.clear();
    emit('track_started', 'radio', track.title, { source: 'radio' });
    if (!activeRadioSession) {
      activeRadioSession = true;
      emit('radio_play', 'radio', track.album, { radioMode: 'adaptive' });
    }
  }

  const audio = document.getElementById('playerAudio');
  if (audio) {
    audio.addEventListener('play', startTrack);
    audio.addEventListener('timeupdate', () => {
      if (audio.paused || !trackKey) { lastCurrentTime = audio.currentTime || 0; return; }
      const currentTime = Number(audio.currentTime) || 0;
      const delta = currentTime - lastCurrentTime;
      lastCurrentTime = currentTime;
      if (delta <= 0 || delta > 2) return;
      trackSeconds += delta;
      const track = currentTrack();
      const duration = Number(audio.duration) || 0;
      if (!meaningfulSent && trackSeconds >= 10) {
        meaningfulSent = true;
        emit('meaningful_play', 'radio', track.title, { listenedSec: Math.round(trackSeconds), durationSec: Math.round(duration) });
      }
      if (duration > 0) {
        const progress = Math.floor((currentTime / duration) * 100);
        for (const threshold of [25, 50, 75]) {
          if (progress >= threshold && !progressSent.has(threshold)) {
            progressSent.add(threshold);
            emit('track_progress', 'radio', track.title, { positionSec: Math.round(currentTime), durationSec: Math.round(duration), progressPct: threshold });
          }
        }
      }
    });
    audio.addEventListener('ended', () => {
      if (!trackKey || trackFinished) return;
      trackFinished = true;
      const track = currentTrack();
      emit('track_completed', 'radio', track.title, { listenedSec: Math.round(trackSeconds), durationSec: Math.round(Number(audio.duration) || 0), progressPct: 100 });
    });
    audio.addEventListener('error', () => emit('playback_error', 'player', currentTrack().title, { reason: 'media-error' }));
    let volumeTimer;
    audio.addEventListener('volumechange', () => {
      clearTimeout(volumeTimer);
      volumeTimer = setTimeout(() => emit('volume_change', 'player', '', { volumeBucket: Math.round((audio.volume || 0) * 10) * 10 }), 500);
    });
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest('button');
    if (button?.id === 'playerNext' || button?.id === 'fsNext') {
      if (trackKey && !trackFinished) emit('track_skipped', 'radio', currentTrack().title, { listenedSec: Math.round(trackSeconds), reason: 'skip-control' });
      trackFinished = true;
    }
    if (button?.id === 'shuffleBtn') emit('shuffle', 'album', '', { source: 'shuffle-tile' });
    if (button?.id === 'themeToggle') emit('theme_toggle', 'theme', document.documentElement.dataset.theme || 'dark', {});
    if (button?.id === 'playerToggle' || button?.id === 'fsToggle') emit('player_toggle', 'player', '', { source: button.id });
    if (button?.id === 'playerMute') emit('feature_use', 'player', 'mute');
    if (button?.id === 'fsLogToggle') emit('feature_use', 'player', 'transmission-log');
    if (button?.id === 'fsLogCopy') emit('share', 'share', 'setlist');

    const heading = target.closest('h1,h2,h3,.site-title,.brand-title');
    if (heading) emit('title_interaction', 'site', cleanSubject(heading.textContent));

    const album = target.closest('.album:not(.shuffle-album)');
    if (album) {
      const subject = cleanSubject(album.querySelector('h3')?.textContent);
      if (subject) {
        emit('album_entered', 'album', subject);
        if (target.closest('.album-link[href]')) emit('release_clicked', 'release', subject, { source: 'release-link' });
      }
    }

    const resetAction = target.closest('[data-c5-soft],[data-c5-full],[data-c5-rebirth]');
    if (resetAction) {
      const action = resetAction.hasAttribute('data-c5-rebirth') ? 'rebirth' : resetAction.hasAttribute('data-c5-full') ? 'full-reset' : 'soft-reset';
      emit('reset_action', 'memory', action, { reason: action, ...profileSnapshot() });
      if (action === 'rebirth') emit('rebirth', 'memory', '', profileSnapshot());
    }
    if (target.closest('#c5ResetPortal')) emit('completion', 'memory', '', profileSnapshot());
  }, true);

  const fullscreen = document.getElementById('fullscreenPlayer');
  if (fullscreen && window.MutationObserver) {
    let wasOpen = fullscreen.classList.contains('is-open');
    new MutationObserver(() => {
      const isOpen = fullscreen.classList.contains('is-open');
      if (isOpen !== wasOpen) emit(isOpen ? 'fullscreen_open' : 'fullscreen_close', 'player');
      wasOpen = isOpen;
    }).observe(fullscreen, { attributes: true, attributeFilter: ['class'] });
  }

  const stateObserver = new MutationObserver(() => {
    const root = document.documentElement;
    const state = String(root.dataset.c5State || '');
    const relationship = String(root.dataset.c5Relationship || '');
    const generation = String(root.dataset.c5Generation || '');
    if (state && (state !== lastState.state || relationship !== lastState.relationship || generation !== lastState.generation)) {
      lastState.state = state;
      lastState.relationship = relationship;
      lastState.generation = generation;
      emit('site_state', 'memory', state, { memoryState: state, relationship, generation: Number(generation) || 1 });
    }
  });
  stateObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-c5-state', 'data-c5-relationship', 'data-c5-generation'] });

  window.addEventListener('stankquilizer:telemetry', event => {
    const detail = event.detail || {};
    if (typeof detail.type !== 'string') return;
    emit(detail.type, detail.surface || 'memory', detail.subject || '', detail.meta || {});
  });

  let hiddenSent = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!hiddenSent) emit('page_hidden', 'system', '', { visible: false });
      hiddenSent = true;
      emit('memory_snapshot', 'memory', '', profileSnapshot());
      beaconFlush();
    } else {
      hiddenSent = false;
      emit('page_visible', 'system', '', { visible: true });
      scheduleFlush(0);
    }
  });

  let departureSent = false;
  window.addEventListener('pagehide', () => {
    if (!departureSent) {
      emit('session_end', 'system', '', { source: 'pagehide' });
      departureSent = true;
    }
    emit('memory_snapshot', 'memory', '', profileSnapshot());
    persist();
    beaconFlush();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) departureSent = false;
  });
  window.addEventListener('online', () => scheduleFlush(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleFlush(0); });
  setInterval(flush, 15000);
  scheduleFlush(0);

  window.stankquilizerTelemetry = Object.freeze({
    emit(type, surface, subject, meta) { emit(type, surface, subject, meta); },
    flush,
    getQueueSize() { return queue.length; }
  });
})();
