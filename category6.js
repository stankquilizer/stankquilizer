(() => {
  'use strict';
  const STORAGE_KEY = 'stankquilizer_category6_archive_v1';
  const CRT_KEY = 'stankquilizer_category7_crt';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const specimens = [
    ['carrier-01','carrier tone','a narrow tone persists after the receiver is disconnected.'],
    ['room-02','room without walls','the room tone changes when no room is present.'],
    ['index-03','misfiled silence','a silent interval is listed as a complete recording.'],
    ['witness-04','second witness','two copies agree on the sound and disagree on its length.'],
    ['loop-05','unclosed loop','the ending arrives before the last note is played.'],
    ['weather-06','indoor weather','a faint hiss behaves like distant rain. no forecast was recorded.'],
    ['door-07','door number zero','the archive lists a door that opens into its own label.'],
    ['voice-08','unassigned voice','a voice is listed in the inventory. the track contains no voice.'],
    ['dust-09','magnetic dust','the oldest file is marked recently handled.']
  ];
  const mutations = [
    'the index moved while you were reading it',
    'one quiet interval has been filed under weather',
    'a second copy remembers a different ending',
    'the receiver was already warm'
  ];
  let ledger = readLedger();
  let restoreTimer = 0;
  let keyBuffer = '';
  let previousFocus = null;

  function readLedger() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { found: [], knocks: 0, doNotClick: 0, archiveOpen: false };
      return {
        found: Array.isArray(raw.found) ? raw.found.filter(id => specimens.some(item => item[0] === id)).slice(0, specimens.length) : [],
        knocks: Math.min(3, Math.max(0, Number(raw.knocks) || 0)),
        doNotClick: Math.min(1000, Math.max(0, Number(raw.doNotClick) || 0)),
        archiveOpen: raw.archiveOpen === true
      };
    } catch (_) { return { found: [], knocks: 0, doNotClick: 0, archiveOpen: false }; }
  }

  function saveLedger() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); } catch (_) {}
  }

  function emitFeature(subject) {
    try {
      window.dispatchEvent(new CustomEvent('stankquilizer:telemetry', {
        detail: { type: 'feature_use', surface: 'site', subject, meta: { source: 'category-6' } }
      }));
    } catch (_) {}
  }

  function applyCrt(enabled) {
    document.documentElement.classList.toggle('sq-crt-mode', enabled);
    try { localStorage.setItem(CRT_KEY, enabled ? '1' : '0'); } catch (_) {}
  }

  let crtEnabled = false;
  try { crtEnabled = localStorage.getItem(CRT_KEY) === '1'; } catch (_) {}
  applyCrt(crtEnabled);

  const style = document.createElement('style');
  style.textContent = [
    'html.sq-crt-mode::before {',
    'content:""; position:fixed; inset:0; z-index:9990; pointer-events:none;',
    'background:repeating-linear-gradient(to bottom,transparent 0 2px,rgba(0,0,0,.18) 3px 4px),radial-gradient(ellipse at center,transparent 58%,rgba(0,0,0,.42) 100%);opacity:.72;',
    '}',
    'html.sq-crt-mode h1,html.sq-crt-mode h2,html.sq-crt-mode .player-info,html.sq-crt-mode .album h3 { text-shadow:0 0 7px currentColor; }',
    '.sq-terminal { position:fixed; inset:0; z-index:10040; display:none; place-items:center; padding:14px;background:rgba(2,3,3,.92);color:#b9c9b5;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }',
    '.sq-terminal.is-open { display:grid; }',
    '.sq-terminal-window { width:min(720px,100%);max-height:min(78dvh,780px);display:grid;grid-template-rows:auto minmax(90px,1fr) auto auto;border:1px solid #52604d;background:rgba(7,10,8,.98);box-shadow:0 0 55px #000,0 0 35px rgba(116,150,109,.08); }',
    '.sq-terminal-head { display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 13px;border-bottom:1px solid #283126;color:#82937c;font-size:10px;letter-spacing:.12em;text-transform:lowercase; }',
    '.sq-terminal-close,.sq-terminal-submit,.sq-terminal-do-not { border:1px solid #394637;background:#101610;color:#c5d4bf;padding:8px 10px;font:inherit;text-transform:lowercase; }',
    '.sq-terminal-output { overflow:auto;min-height:120px;padding:15px;color:#aab8a4;white-space:pre-wrap; }',
    '.sq-terminal-form { display:flex;gap:8px;padding:10px 13px;border-top:1px solid #283126; }',
    '.sq-terminal-input { flex:1;min-width:0;border:1px solid #394637;background:#050705;color:#d1dfca;padding:10px;font:inherit; }',
    '.sq-terminal-input:focus,.sq-terminal button:focus-visible { outline:2px solid #899c80;outline-offset:2px; }',
    '.sq-terminal-foot { display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 13px 12px;color:#64705f;font-size:9px; }',
    '.sq-terminal-do-not { color:#9b9083;border-color:#51483d; }',
    '.sq-terminal button:hover { border-color:#82937c;color:#fff; }',
    'html.sq-crt-mode .sq-terminal-window { box-shadow:0 0 60px #000,0 0 30px rgba(132,180,122,.12); }',
    '@media(max-width:540px) { .sq-terminal{padding:0}.sq-terminal-window{width:100%;max-height:100dvh;min-height:100dvh;border-left:0;border-right:0}.sq-terminal-output{padding:13px}.sq-terminal-foot{align-items:flex-start;flex-direction:column} }',
    '@media(prefers-reduced-motion:reduce) { html.sq-crt-mode::before{opacity:.48}.sq-terminal-window{box-shadow:none} }'
  ].join('\n');
  document.head.appendChild(style);

  const terminal = document.createElement('section');
  terminal.className = 'sq-terminal';
  terminal.setAttribute('role','dialog');
  terminal.setAttribute('aria-modal','true');
  terminal.setAttribute('aria-label','hidden archive terminal');
  terminal.setAttribute('aria-hidden','true');
  terminal.innerHTML =
    '<div class="sq-terminal-window">' +
      '<div class="sq-terminal-head"><span>archive terminal / local instance</span><button type="button" class="sq-terminal-close" aria-label="close terminal">close</button></div>' +
      '<pre class="sq-terminal-output" aria-live="polite"></pre>' +
      '<form class="sq-terminal-form"><input class="sq-terminal-input" aria-label="terminal command" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type help"><button class="sq-terminal-submit">send</button></form>' +
    '<div class="sq-terminal-foot"><span>fixed commands · local discoveries · no network access</span><button type="button" class="sq-terminal-do-not" title="this button is a test of your judgment">do not click</button></div>' +
    '</div>';
  document.body.appendChild(terminal);

  const output = terminal.querySelector('.sq-terminal-output');
  const input = terminal.querySelector('.sq-terminal-input');
  const closeButton = terminal.querySelector('.sq-terminal-close');

  function write(lines) {
    output.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines);
    output.scrollTop = output.scrollHeight;
  }

  function openTerminal() {
    if (terminal.classList.contains('is-open')) return;
    previousFocus = document.activeElement;
    terminal.classList.add('is-open');
    terminal.setAttribute('aria-hidden','false');
    write([
      'receiver connected. archive state is stored on this device.',
      'type help to inspect the available commands.',
      'no command changes playback or contacts another visitor.'
    ]);
    input.focus();
    emitFeature('category-6-terminal');
  }

  function closeTerminal() {
    terminal.classList.remove('is-open');
    terminal.setAttribute('aria-hidden','true');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  function showMutation() {
    const text = mutations[Math.floor(Math.random() * mutations.length)];
    const flash = document.getElementById('memoryFlash');
    if (flash) {
      flash.textContent = text;
      flash.classList.add('is-visible');
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => flash.classList.remove('is-visible'), 2300);
    }
    if (!reducedMotion && typeof window.flashGlitch === 'function') window.flashGlitch();
    emitFeature('category-6-mutation');
    return text;
  }

  function runCommand(raw) {
    const command = String(raw || '').trim().toLowerCase().replace(/\s+/g,' ');
    if (!command) return ['no command received.'];
    if (command === 'help') return [
      'help        list commands',
      'stats       read this device’s local site memory',
      'scan        inspect the authored specimen index',
      'specimen    recover one fixed archive specimen',
      'knock       try the sealed archive door',
      'archive     read the hidden layer after three specimens',
      'crt on/off  toggle optional VHS / CRT mode',
      'mutation    test one brief authored signal mutation',
      'clear       clear this terminal output',
      'close       return to the receiver'
    ];
    if (command === 'stats') {
      let memory = {};
      try { memory = JSON.parse(localStorage.getItem('stankquilizer_memory') || '{}') || {}; } catch (_) {}
      const tracks = Math.max(0, Number(memory.tracksHeard) || 0);
      const albums = Array.isArray(memory.albumsVisited) ? memory.albumsVisited.length : 0;
      const sessions = Math.max(0, Number(memory.radioSessions) || 0);
      const visits = Math.max(0, Number(memory.visits) || 0);
      return ['local site record', 'visits: ' + visits, 'tracks heard: ' + tracks, 'releases visited: ' + albums, 'radio sessions: ' + sessions, 'specimens indexed: ' + ledger.found.length + ' / ' + specimens.length];
    }
    if (command === 'scan') {
      if (ledger.found.length >= 3) ledger.archiveOpen = true;
      saveLedger();
      return ['scan complete', 'authored records indexed: ' + specimens.length, 'recovered on this device: ' + ledger.found.length, ledger.archiveOpen ? 'sealed channel: open' : 'sealed channel: ' + Math.max(0, 3 - ledger.found.length) + ' more specimen(s) required'];
    }
    if (command === 'specimen') {
      const remaining = specimens.filter(item => !ledger.found.includes(item[0]));
      if (!remaining.length) return ['the index is empty now.', 'all fixed specimens on this device have been found.'];
      const item = remaining[Math.floor(Math.random() * remaining.length)];
      ledger.found.push(item[0]);
      if (ledger.found.length >= 3) ledger.archiveOpen = true;
      saveLedger();
      emitFeature('category-6-specimen');
      return ['specimen recovered: ' + item[1], item[2], 'index: ' + ledger.found.length + ' / ' + specimens.length, ledger.archiveOpen ? 'a sealed channel has answered.' : 'the archive door needs ' + Math.max(0, 3 - ledger.found.length) + ' more specimen(s).'];
    }
    if (command === 'knock') {
      ledger.knocks = Math.min(3, ledger.knocks + 1);
      if (ledger.knocks >= 3) ledger.archiveOpen = true;
      saveLedger();
      emitFeature('category-6-knock');
      return ledger.archiveOpen ? ['three knocks returned from the other side.', 'try: archive'] : ['one knock entered the archive.', 'response count: ' + ledger.knocks + ' / 3'];
    }
    if (command === 'archive') {
      if (!ledger.archiveOpen) return ['sealed.', 'recover three specimens or knock three times first.'];
      return ['dead channel / recovered note', 'the station was never broadcasting outward.', 'it was keeping the room from becoming empty.', 'this note is fixed, local, and complete.'];
    }
    if (command === 'crt on') { applyCrt(true); emitFeature('category-7-crt-mode'); return ['vhs / crt mode: on', 'type crt off to restore the default picture.']; }
    if (command === 'crt off') { applyCrt(false); emitFeature('category-7-crt-mode'); return ['vhs / crt mode: off']; }
    if (command === 'crt') return ['vhs / crt mode: ' + (document.documentElement.classList.contains('sq-crt-mode') ? 'on' : 'off'), 'try: crt on or crt off'];
    if (command === 'mutation') return ['rare mutation: ' + showMutation()];
    if (command === 'clear') { write('terminal output cleared.'); return null; }
    if (command === 'close') { closeTerminal(); return null; }
    return ['command not found: ' + command, 'type help for the finite command list.'];
  }

  terminal.querySelector('.sq-terminal-form').addEventListener('submit',event => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    const result = runCommand(value);
    if (result) write(result);
  });
  closeButton.addEventListener('click',closeTerminal);
  terminal.addEventListener('click',event => { if(event.target === terminal) closeTerminal(); });
  terminal.addEventListener('keydown',event => {
    if (event.key === 'Escape') { closeTerminal(); return; }
    if (event.key !== 'Tab' || !terminal.classList.contains('is-open')) return;
    const focusable = [closeButton,input,terminal.querySelector('.sq-terminal-submit'),terminal.querySelector('.sq-terminal-do-not')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if(event.shiftKey && document.activeElement === first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement === last){event.preventDefault();first.focus();}
  });
  terminal.querySelector('.sq-terminal-do-not').addEventListener('click',() => {
    ledger.doNotClick++;
    ledger.archiveOpen = true;
    saveLedger();
    const result = ledger.doNotClick === 1
      ? ['you pressed the only honest button.', 'the archive marked this device as a witness.']
      : ['still the same button.', 'the archive remembers this device’s count: ' + ledger.doNotClick + '.'];
    if (!reducedMotion) showMutation();
    emitFeature('category-6-do-not-click');
    write(result);
  });

  document.addEventListener('keydown',event => {
    if (terminal.classList.contains('is-open')) return;
    if (event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) { keyBuffer = ''; return; }
    keyBuffer = (keyBuffer + event.key.toLowerCase()).slice(-8);
    if (keyBuffer.endsWith('terminal')) { keyBuffer = ''; openTerminal(); }
  });

  const whisper = document.getElementById('evoWhisper');
  if (whisper) whisper.addEventListener('click',openTerminal);
  if (new URLSearchParams(location.search).has('terminal')) {
    const params = new URLSearchParams(location.search);
    params.delete('terminal');
    history.replaceState(null,'',location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash);
    setTimeout(openTerminal,350);
  }

  const rareKey = 'stankquilizer_category6_rare_signal';
  let alreadyShown = false;
  try { alreadyShown = sessionStorage.getItem(rareKey) === '1'; } catch (_) {}
  if (!alreadyShown && !reducedMotion && Math.random() < 0.025) {
    setTimeout(() => {
      const audio = document.getElementById('playerAudio');
      if (document.visibilityState !== 'hidden' && (!audio || audio.paused) && !terminal.classList.contains('is-open')) showMutation();
      try { sessionStorage.setItem(rareKey,'1'); } catch (_) {}
    }, 18000);
  }
})();
