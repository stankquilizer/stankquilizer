const COOKIE = "sq_obs";
const encoder = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra
    }
  });
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64url(value) {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);

  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function sign(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  return crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
}

async function createCookie(secret) {
  const nonce = base64url(
    crypto.getRandomValues(new Uint8Array(24))
  );

  const expires = Date.now() + 8 * 60 * 60 * 1000;

  const signature = base64url(
    await sign(secret, `${nonce}.${expires}`)
  );

  return `${nonce}.${expires}.${signature}`;
}

async function verifyCookie(secret, value) {
  if (!value) return false;

  const parts = value.split(".");

  if (parts.length !== 3) return false;

  const nonce = parts[0];
  const expires = Number(parts[1]);
  const signature = parts[2];

  if (!nonce || !signature) return false;
  if (!Number.isFinite(expires)) return false;
  if (expires <= Date.now()) return false;

  const expected = new Uint8Array(
    await sign(secret, `${nonce}.${expires}`)
  );

  const actual = decodeBase64url(signature);

  if (actual.length !== expected.length) return false;

  let difference = 0;

  for (let i = 0; i < expected.length; i++) {
    difference |= expected[i] ^ actual[i];
  }

  return difference === 0;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  const match = header.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  );

  return match ? match[1] : "";
}

async function authenticated(request, env) {
  if (!env.OBSERVATORY_PASSWORD) {
    return false;
  }

  const cookie = getCookie(request, COOKIE);

  return verifyCookie(
    env.OBSERVATORY_PASSWORD,
    cookie
  );
}

const TRACKS = [
  "i get high",
  "i feel like you’re the only one",
  "in the sunken place",
  "zzz",
  "the seraphim",
  "fake gifted",
  "stankquilizer type beat",
  "unimagineable probability",
  "ignantamus",
  "the chops",
  "life of the loop",
  "the earth i scar"
];

const FEATURES = [
  "Behavioral memory",
  "Listener profile",
  "Track & album affinity",
  "Avoidance memory",
  "Memory decay",
  "Adaptive radio",
  "Anti-personalization",
  "Rediscovery",
  "Session archetypes",
  "Session temperature",
  "Adaptive atmosphere",
  "Memory-driven UI",
  "Site state",
  "Relationship age",
  "Memory ghosts",
  "Session milestones",
  "Progressive unlocking",
  "Discovery ledger",
  "Memory corruption",
  "Completion state",
  "res(e)t"
];

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
  );
}

function dashboardHTML() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta
  name="viewport"
  content="width=device-width,initial-scale=1,viewport-fit=cover"
>
<meta name="color-scheme" content="dark">
<title>stankquilizer — observatory</title>

<style>

:root {
  --bg: #050505;
  --panel: #0c0c0c;
  --panel2: #090909;
  --line: #222;
  --line2: #181818;
  --text: #e9e9e9;
  --muted: #686868;
  --muted2: #454545;
  --good: #9ed49e;

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    "Liberation Mono",
    monospace;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
}

body {
  font-size: 13px;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.hidden {
  display: none !important;
}

/* LOGIN */

#login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 22px;
}

.login-box {
  width: min(560px, 100%);
  border: 1px solid var(--line);
  background: var(--panel2);
  padding: 26px;
}

.eyebrow {
  color: #555;
  font-size: 9px;
  margin-bottom: 17px;
}

.login-box h1 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 500;
}

.login-box p {
  margin: 0 0 22px;
  color: #707070;
  font-size: 10px;
  line-height: 1.8;
}

.login-row {
  display: flex;
  gap: 8px;
}

.login-row input {
  min-width: 0;
  flex: 1;
  background: #060606;
  border: 1px solid #292929;
  color: #eee;
  padding: 12px;
  outline: none;
}

.login-row input:focus {
  border-color: #555;
}

.btn {
  background: #111;
  border: 1px solid #303030;
  color: #ddd;
  padding: 10px 12px;
}

.btn:hover {
  border-color: #555;
}

.login-error {
  min-height: 18px;
  margin-top: 8px;
  color: #b66;
  font-size: 9px;
}

.login-note {
  color: #3f3f3f;
  font-size: 8px;
  line-height: 1.7;
  margin-top: 17px;
}

/* APP */

.app {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 210px 1fr;
}

.sidebar {
  border-right: 1px solid var(--line);
  background: #070707;
  padding: 18px;
  display: flex;
  flex-direction: column;
}

.brand strong {
  display: block;
  font-size: 15px;
  font-weight: 500;
}

.brand span {
  display: block;
  margin-top: 4px;
  color: #4c4c4c;
  font-size: 8px;
}

.nav {
  display: grid;
  gap: 2px;
  margin-top: 22px;
}

.nav button {
  border: 0;
  background: none;
  color: #5d5d5d;
  text-align: left;
  padding: 9px 0;
  font-size: 9px;
}

.nav button:hover,
.nav button.active {
  color: #eee;
}

.sidebar-foot {
  margin-top: auto;
  color: #303030;
  font-size: 7px;
  line-height: 1.7;
}

.content {
  min-width: 0;
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  align-items: flex-start;
  padding: 22px 24px;
  border-bottom: 1px solid var(--line);
}

.top h2 {
  margin: 0 0 7px;
  font-size: 17px;
  font-weight: 500;
}

.top p {
  margin: 0;
  color: #595959;
  font-size: 9px;
}

.status {
  white-space: nowrap;
  color: var(--good);
  font-size: 8px;
}

.main {
  padding: 20px 24px 36px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.card {
  border: 1px solid var(--line2);
  background: var(--panel);
  padding: 14px;
}

.metric .label {
  color: #555;
  font-size: 8px;
}

.metric .value {
  margin: 10px 0 4px;
  font-size: 22px;
}

.metric .sub {
  color: #404040;
  font-size: 8px;
}

.section {
  margin-top: 16px;
}

.section-title {
  color: #4d4d4d;
  font-size: 8px;
  text-transform: uppercase;
  margin-bottom: 7px;
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.bars {
  height: 140px;
  display: flex;
  align-items: flex-end;
  gap: 3px;
}

.bar {
  display: block;
  min-width: 3px;
  flex: 1;
  background: #5a5a5a;
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--line2);
}

table {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
  font-size: 8px;
}

th,
td {
  padding: 9px;
  border-bottom: 1px solid var(--line2);
  text-align: left;
  white-space: nowrap;
}

th {
  color: #555;
  font-weight: 400;
}

.empty {
  color: #444;
  padding: 18px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.feature {
  border: 1px solid var(--line2);
  background: #090909;
  padding: 12px;
}

.feature b {
  display: block;
  font-size: 8px;
  font-weight: 400;
}

.feature span {
  display: block;
  color: #414141;
  font-size: 7px;
  margin-top: 6px;
}

.controls {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.controls input {
  flex: 1;
  min-width: 140px;
  background: #070707;
  border: 1px solid #292929;
  color: #ddd;
  padding: 9px;
}

.mobile-bar {
  display: none;
}

.toast {
  position: fixed;
  z-index: 50;
  left: 50%;
  bottom: 80px;
  transform: translateX(-50%);
  background: #111;
  border: 1px solid #333;
  color: #ddd;
  padding: 8px 11px;
  font-size: 8px;
}

@media (max-width: 900px) {

  .app {
    display: block;
  }

  .sidebar {
    display: none;
  }

  .mobile-bar {
    position: fixed;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    left: 0;
    right: 0;
    bottom: 0;
    background: #090909;
    border-top: 1px solid #252525;
    padding:
      5px 4px
      env(safe-area-inset-bottom);
  }

  .mobile-bar button {
    background: none;
    border: 0;
    color: #555;
    padding: 7px 2px;
    font-size: 7px;
  }

  .mobile-bar button.active {
    color: #eee;
  }

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .two {
    grid-template-columns: 1fr;
  }

  .main {
    padding:
      15px 10px
      75px;
  }

  .top {
    padding:
      16px 10px;
  }

  .status {
    display: none;
  }
}

@media (max-width: 520px) {

  .grid {
    gap: 6px;
  }

  .metric .value {
    font-size: 18px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .login-row {
    flex-direction: column;
  }

  .login-row .btn {
    width: 100%;
  }

  .card {
    padding: 11px;
  }
}

</style>
</head>

<body>

<div id="login">

  <div class="login-box">

    <div class="eyebrow">
      PRIVATE SYSTEM / ACCESS REQUIRED
    </div>

    <h1>
      stankquilizer — observatory
    </h1>

    <p>
      the public site remembers visitors.<br>
      this place watches the machinery.
    </p>

    <form id="login-form">

      <div class="login-row">

        <input
          id="password"
          type="password"
          placeholder="access phrase"
          autocomplete="current-password"
        >

        <button
          class="btn"
          type="submit"
        >
          enter
        </button>

      </div>

    </form>

    <div
      id="login-error"
      class="login-error"
    ></div>

    <div class="login-note">
      server-side authentication · anonymous telemetry only
    </div>

  </div>

</div>

<div id="app" class="app hidden">

  <aside class="sidebar">

    <div class="brand">
      <strong>stankquilizer</strong>
      <span>observatory</span>
    </div>

    <nav
      id="desktop-nav"
      class="nav"
    ></nav>

    <div class="sidebar-foot">
      PRIVATE<br>
      NO IP / NO LOCATION<br>
      D1-BACKED
    </div>

  </aside>

  <section class="content">

    <div
      id="main"
      class="main"
    ></div>

  </section>

</div>

<div
  id="mobile-bar"
  class="mobile-bar"
></div>

<div
  id="toast"
  class="toast hidden"
></div>

<script>

const NAV = [
  "overview",
  "sessions",
  "memory",
  "radio",
  "projects",
  "journey",
  "features",
  "qa",
  "events",
  "deployments",
  "privacy",
  "system"
];

const TRACKS = ${JSON.stringify(TRACKS)};
const FEATURES = ${JSON.stringify(FEATURES)};

const main = document.getElementById("main");

let toastTimer = null;

function escapeClient(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
  );
}

function showToast(message) {
  const element = document.getElementById("toast");

  element.textContent = message;
  element.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.add("hidden");
  }, 1600);
}

async function api(path, options = {}) {

  try {

    const response = await fetch(
      "/api" + path,
      {
        credentials: "same-origin",
        ...options
      }
    );

    if (response.status === 401) {
      location.reload();
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json();

  } catch {
    return null;
  }
}

function metric(label, value, sub) {

  return `
    <div class="card metric">
      <div class="label">${escapeClient(label)}</div>
      <div class="value">${escapeClient(value)}</div>
      <div class="sub">${escapeClient(sub)}</div>
    </div>
  `;
}

function heading(title, subtitle) {

  return `
    <div class="top">
      <div>
        <h2>${escapeClient(title)}</h2>
        <p>${escapeClient(subtitle)}</p>
      </div>

      <div class="status">
        ● live
      </div>
    </div>
  `;
}

function bars(seed = 11) {

  return `
    <div class="bars">
      ${Array
        .from(
          { length: 38 },
          (_, i) =>
            `<i
              class="bar"
              style="height:${18 + ((i * seed * 13) % 76)}%"
            ></i>`
        )
        .join("")
      }
    </div>
  `;
}

function renderNav(active) {

  const desktop =
    document.getElementById("desktop-nav");

  desktop.innerHTML =
    NAV
      .map(
        page =>
          `<button
             class="${page === active ? "active" : ""}"
             data-page="${page}"
           >
             ${page === "deployments" ? "deploy" : page}
           </button>`
      )
      .join("");

  desktop
    .querySelectorAll("button")
    .forEach(button => {
      button.onclick =
        () => renderPage(button.dataset.page);
    });

  const mobile =
    document.getElementById("mobile-bar");

  const quick = [
    "overview",
    "radio",
    "sessions",
    "features",
    "events"
  ];

  mobile.innerHTML =
    quick
      .map(
        page =>
          `<button
             class="${page === active ? "active" : ""}"
             data-page="${page}"
           >
             ${page}
           </button>`
      )
      .join("");

  mobile
    .querySelectorAll("button")
    .forEach(button => {
      button.onclick =
        () => renderPage(button.dataset.page);
    });
}

async function overviewPage() {

  const data = await api("/overview");

  return (
    heading(
      "overview",
      "the system at a glance."
    ) +

    `<div class="grid">

      ${metric(
        "sessions today",
        data?.sessions ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "meaningful plays",
        data?.meaningfulPlays ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "completions",
        data?.completions ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "skips",
        data?.skips ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "events",
        data?.events ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "rediscoveries",
        data?.rediscoveries ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "radio sessions",
        data?.radioSessions ?? "—",
        "last 24 hours"
      )}

      ${metric(
        "database",
        "CONNECTED",
        "stankquilizer-observatory"
      )}

    </div>

    <div class="two section">

      <div>

        <div class="section-title">
          event transmission
        </div>

        <div class="card">
          ${bars(13)}
        </div>

      </div>

      <div>

        <div class="section-title">
          current site state
        </div>

        <div class="card">

          <div style="font-size:28px">
            ACTIVE
          </div>

          <div
            style="
              color:#555;
              font-size:9px;
              line-height:1.8;
              margin-top:8px
            "
          >
            adaptive radio / enabled<br>
            temperature / observed<br>
            memory / enabled<br>
            privacy / bounded
          </div>

        </div>

      </div>

    </div>`
  );
}

async function sessionsPage() {

  const rows =
    await api("/sessions?limit=100") || [];

  return (
    heading(
      "sessions",
      "anonymous sessions stored in D1."
    ) +

    `<div class="table-wrap">

      <table>

        <thead>

          <tr>
            <th>id</th>
            <th>visitor</th>
            <th>started</th>
            <th>last seen</th>
            <th>build</th>
            <th>events</th>
          </tr>

        </thead>

        <tbody>

          ${
            rows.length

              ? rows
                  .map(
                    row =>
                      `<tr>
                        <td>${escapeClient(row.id)}</td>
                        <td>${escapeClient(row.visitor_key)}</td>
                        <td>${new Date(row.started_at).toLocaleString()}</td>
                        <td>${new Date(row.last_seen).toLocaleString()}</td>
                        <td>${escapeClient(row.build)}</td>
                        <td>${escapeClient(row.event_count)}</td>
                      </tr>`
                  )
                  .join("")

              : `<tr>
                   <td
                     colspan="6"
                     class="empty"
                   >
                     no sessions yet
                   </td>
                 </tr>`
          }

        </tbody>

      </table>

    </div>`
  );
}

async function eventsPage() {

  const rows =
    await api("/events?limit=200") || [];

  return (
    heading(
      "events",
      "raw allowlisted telemetry events."
    ) +

    `<div class="table-wrap">

      <table>

        <thead>

          <tr>
            <th>time</th>
            <th>type</th>
            <th>surface</th>
            <th>subject</th>
            <th>session</th>
          </tr>

        </thead>

        <tbody>

          ${
            rows.length

              ? rows
                  .map(
                    row =>
                      `<tr>
                        <td>${new Date(row.ts).toLocaleString()}</td>
                        <td>${escapeClient(row.type)}</td>
                        <td>${escapeClient(row.surface)}</td>
                        <td>${escapeClient(row.subject)}</td>
                        <td>${escapeClient(row.session_id)}</td>
                      </tr>`
                  )
                  .join("")

              : `<tr>
                   <td
                     colspan="5"
                     class="empty"
                   >
                     no events yet
                   </td>
                 </tr>`
          }

        </tbody>

      </table>

    </div>`
  );
}

async function deploymentsPage() {

  const rows =
    await api("/deployments") || [];

  return (
    heading(
      "deployments",
      "correlate releases with observatory behavior."
    ) +

    `<div class="card">

      <div class="controls">

        <input
          id="build"
          placeholder="build"
        >

        <input
          id="ref"
          placeholder="git ref"
        >

        <input
          id="note"
          placeholder="note"
        >

        <button
          class="btn"
          id="record-deployment"
        >
          record
        </button>

      </div>

    </div>

    <div class="section">

      <div class="section-title">
        history
      </div>

      <div class="table-wrap">

        <table>

          <thead>

            <tr>
              <th>created</th>
              <th>build</th>
              <th>ref</th>
              <th>note</th>
            </tr>

          </thead>

          <tbody>

            ${
              rows.length

                ? rows
                    .map(
                      row =>
                        `<tr>
                          <td>${new Date(row.created_at).toLocaleString()}</td>
                          <td>${escapeClient(row.build)}</td>
                          <td>${escapeClient(row.ref)}</td>
                          <td>${escapeClient(row.note)}</td>
                        </tr>`
                    )
                    .join("")

                : `<tr>
                     <td
                       colspan="4"
                       class="empty"
                     >
                       no deployments recorded
                     </td>
                   </tr>`
            }

          </tbody>

        </table>

      </div>

    </div>`
  );
}

async function featuresPage() {

  const rows =
    await api("/flags") || [];

  const configured =
    new Map(
      rows.map(row => [
        row.name,
        Boolean(row.enabled)
      ])
    );

  return (
    heading(
      "features",
      "21 observatory feature systems."
    ) +

    `<div class="feature-grid">

      ${
        FEATURES
          .map(
            (feature, index) => {

              const state =
                configured.has(feature)
                  ? configured.get(feature)
                    ? "ENABLED"
                    : "DISABLED"
                  : "NOT INITIALIZED";

              return `
                <div class="feature">

                  <b>
                    ${String(index + 1).padStart(2, "0")}
                    ·
                    ${escapeClient(feature)}
                  </b>

                  <span>
                    ${state}
                  </span>

                </div>
              `;
            }
          )
          .join("")
      }

    </div>`
  );
}

async function radioPage() {

  return (
    heading(
      "radio",
      "adaptive transmission over the 12-track foundation."
    ) +

    `<div class="grid">

      ${metric(
        "adaptive picks",
        "LIVE",
        "derived from telemetry"
      )}

      ${metric(
        "skip rate",
        "LIVE",
        "derived from telemetry"
      )}

      ${metric(
        "no-repeat",
        "LIVE",
        "adaptive radio"
      )}

      ${metric(
        "track starts",
        "LIVE",
        "event stream"
      )}

    </div>

    <div class="section">

      <div class="section-title">
        12-track foundation
      </div>

      <div class="table-wrap">

        <table>

          <thead>

            <tr>
              <th>track</th>
              <th>meaningful</th>
              <th>complete</th>
              <th>skip</th>
            </tr>

          </thead>

          <tbody>

            ${
              TRACKS
                .map(
                  (track, index) =>
                    `<tr>
                      <td>
                        ${String(index + 1).padStart(2, "0")}
                        ·
                        ${escapeClient(track)}
                      </td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>`
                )
                .join("")
            }

          </tbody>

        </table>

      </div>

    </div>`
  );
}

async function memoryPage() {

  return (
    heading(
      "memory",
      "aggregate behavior without storing identity."
    ) +

    `<div class="grid">

      ${metric(
        "profiles",
        "—",
        "anonymous"
      )}

      ${metric(
        "returning",
        "—",
        "anonymous"
      )}

      ${metric(
        "rediscoveries",
        "—",
        "event stream"
      )}

      ${metric(
        "affinity shifts",
        "—",
        "event stream"
      )}

    </div>

    <div class="section">

      <div class="section-title">
        memory activity
      </div>

      <div class="card">
        ${bars(17)}
      </div>

    </div>`
  );
}

async function qaPage() {

  const scenarios = [
    "login",
    "radio_play",
    "completion",
    "skip",
    "rediscovery",
    "unlock",
    "res(e)t"
  ];

  return (
    heading(
      "qa",
      "emit synthetic telemetry for system testing."
    ) +

    `<div class="card">

      <div class="controls">

        ${
          scenarios
            .map(
              scenario =>
                `<button
                  class="btn qa-button"
                  data-scenario="${escapeClient(scenario)}"
                >
                  ${escapeClient(scenario)}
                </button>`
            )
            .join("")
        }

      </div>

    </div>

    <div class="section">

      <div class="section-title">
        coverage
      </div>

      <div class="card">

        player · analyser · mood · particles ·
        session evolution · memory · late-night ·
        fullscreen · transmission log · theme ·
        reduced motion · 21 feature systems

      </div>

    </div>`
  );
}

async function simplePage(title, subtitle, body) {

  return heading(title, subtitle) + body;
}

async function renderPage(page) {

  history.replaceState(
    null,
    "",
    "#" + page
  );

  renderNav(page);

  let html;

  switch (page) {

    case "overview":
      html = await overviewPage();
      break;

    case "sessions":
      html = await sessionsPage();
      break;

    case "events":
      html = await eventsPage();
      break;

    case "deployments":
      html = await deploymentsPage();
      break;

    case "features":
      html = await featuresPage();
      break;

    case "radio":
      html = await radioPage();
      break;

    case "memory":
      html = await memoryPage();
      break;

    case "qa":
      html = await qaPage();
      break;

    case "projects":

      html = await simplePage(
        "projects",
        "project-level activity.",
        `<div class="grid">

          ${metric(
            "projects",
            "3",
            "active"
          )}

          ${metric(
            "albums",
            "—",
            "telemetry pending"
          )}

          ${metric(
            "album entries",
            "—",
            "telemetry pending"
          )}

          ${metric(
            "discovery",
            "—",
            "telemetry pending"
          )}

        </div>`
      );

      break;

    case "journey":

      html = await simplePage(
        "journey",
        "visitor journey without identity exposure.",
        `<div class="two">

          <div class="card">
            entry → play → exploration →
            repetition → rediscovery → return
          </div>

          <div class="card">
            relationship age · session temperature ·
            archetype · milestone state
          </div>

        </div>`
      );

      break;

    case "privacy":

      html = await simplePage(
        "privacy",
        "what this system intentionally does not collect.",
        `<div class="grid">

          ${metric(
            "IP address",
            "NEVER",
            "not stored"
          )}

          ${metric(
            "location",
            "NEVER",
            "not stored"
          )}

          ${metric(
            "names",
            "NEVER",
            "not stored"
          )}

          ${metric(
            "raw memory",
            "NEVER",
            "client-side only"
          )}

          ${metric(
            "full URL",
            "NEVER",
            "not stored"
          )}

          ${metric(
            "fingerprinting",
            "NEVER",
            "not built"
          )}

          ${metric(
            "session ID",
            "YES",
            "pseudonymous"
          )}

          ${metric(
            "event metadata",
            "BOUNDED",
            "allowlisted"
          )}

        </div>`
      );

      break;

    case "system":

      html = await simplePage(
        "system",
        "runtime and deployment status.",
        `<div class="grid">

          ${metric(
            "worker",
            "ONLINE",
            "worker-only architecture"
          )}

          ${metric(
            "database",
            "BOUND",
            "D1"
          )}

          ${metric(
            "auth",
            "SERVER",
            "HttpOnly cookie"
          )}

          ${metric(
            "build",
            "CLEAN",
            "observatory v2"
          )}

        </div>`
      );

      break;

    default:
      html = await overviewPage();
  }

  main.innerHTML = html;

  document
    .querySelectorAll(".qa-button")
    .forEach(button => {

      button.onclick =
        async () => {

          const result =
            await api(
              "/qa",
              {
                method: "POST",
                headers: {
                  "content-type":
                    "application/json"
                },
                body: JSON.stringify({
                  scenario:
                    button.dataset.scenario
                })
              }
            );

          showToast(
            result?.ok
              ? "QA event emitted"
              : "QA failed"
          );
        };
    });

  const record =
    document.getElementById(
      "record-deployment"
    );

  if (record) {

    record.onclick =
      async () => {

        const result =
          await api(
            "/deployments",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json"
              },
              body: JSON.stringify({
                build:
                  document.getElementById("build").value,
                ref:
                  document.getElementById("ref").value,
                note:
                  document.getElementById("note").value
              })
            }
          );

        showToast(
          result?.ok
            ? "deployment recorded"
            : "unable to record"
        );

        if (result) {
          await renderPage("deployments");
        }
      };
  }
}

async function initialize() {

  const response =
    await api("/auth-check");

  if (!response?.authenticated) {

    document
      .getElementById("login")
      .classList
      .remove("hidden");

    document
      .getElementById("app")
      .classList
      .add("hidden");

    return;
  }

  document
    .getElementById("login")
    .classList
    .add("hidden");

  document
    .getElementById("app")
    .classList
    .remove("hidden");

  await renderPage(
    location.hash.slice(1) ||
    "overview"
  );
}

document
  .getElementById("login-form")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const input =
        document.getElementById(
          "password"
        );

      const error =
        document.getElementById(
          "login-error"
        );

      error.textContent = "";

      const response =
        await fetch(
          "/api/login",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type":
                "application/json"
            },
            body: JSON.stringify({
              password:
                input.value
            })
          }
        );

      if (response.ok) {

        input.value = "";

        location.href = "/";

        return;
      }

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (
        data.reason ===
        "secret_missing"
      ) {

        error.textContent =
          "server secret is not configured";

      } else {

        error.textContent =
          "access denied";

      }

      input.select();
    }
  );

initialize();

</script>

</body>
</html>`;
}

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);

    /*
      SAFE DIAGNOSTIC
      Never exposes the password.
    */

    if (
      url.pathname ===
      "/api/auth-status" &&
      request.method === "GET"
    ) {

      return json({
        worker: "RUNNING",
        version: "OBS-V2-CLEAN",
        secretConfigured:
          Boolean(
            env.OBSERVATORY_PASSWORD
          ),
        d1Configured:
          Boolean(env.DB)
      });
    }

    /*
      Login state check.
    */

    if (
      url.pathname ===
      "/api/auth-check" &&
      request.method === "GET"
    ) {

      return json({
        authenticated:
          await authenticated(
            request,
            env
          )
      });
    }

    /*
      Login.
    */

    if (
      url.pathname ===
      "/api/login" &&
      request.method === "POST"
    ) {

      if (!env.OBSERVATORY_PASSWORD) {

        return json(
          {
            ok: false,
            reason:
              "secret_missing"
          },
          500
        );
      }

      let body = {};

      try {
        body = await request.json();
      } catch {}

      if (
        body.password !==
        env.OBSERVATORY_PASSWORD
      ) {

        return json(
          {
            ok: false,
            reason:
              "password_mismatch"
          },
          401
        );
      }

      const cookie =
        await createCookie(
          env.OBSERVATORY_PASSWORD
        );

      return json(
        { ok: true },
        200,
        {
          "set-cookie":
            `${COOKIE}=${cookie}; ` +
            "Path=/; " +
            "HttpOnly; " +
            "Secure; " +
            "SameSite=Strict; " +
            "Max-Age=28800"
        }
      );
    }

    /*
      Logout.
    */

    if (
      url.pathname ===
      "/api/logout"
    ) {

      return json(
        { ok: true },
        200,
        {
          "set-cookie":
            `${COOKIE}=; ` +
            "Path=/; " +
            "HttpOnly; " +
            "Secure; " +
            "SameSite=Strict; " +
            "Max-Age=0"
        }
      );
    }

    /*
      All protected API routes.
    */

    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {

      if (
        !(await authenticated(
          request,
          env
        ))
      ) {

        return json(
          {
            error:
              "unauthorized"
          },
          401
        );
      }

      if (!env.DB) {

        return json(
          {
            error:
              "d1_not_configured"
          },
          500
        );
      }

      /*
        Health.
      */

      if (
        url.pathname ===
        "/api/health"
      ) {

        return json({
          ok: true,
          time: Date.now(),
          database: true
        });
      }

      /*
        Overview.
      */

      if (
        url.pathname ===
        "/api/overview"
      ) {

        const since =
          Date.now() -
          86400000;

        const results =
          await env.DB.batch([
            env.DB
              .prepare(
                "SELECT COUNT(*) AS n " +
                "FROM sessions " +
                "WHERE started_at >= ?"
              )
              .bind(since),

            env.DB
              .prepare(
                "SELECT COUNT(*) AS n " +
                "FROM events " +
                "WHERE ts >= ? " +
                "AND type = 'meaningful_play'"
              )
              .bind(since),

            env.DB
              .prepare(
                "SELECT COUNT(*) AS n " +
                "FROM events " +
                "WHERE ts >= ? " +
                "AND type = 'track_completed'"
              )
              .bind(since),

            env.DB
              .prepare(
                "SELECT COUNT(*) AS n " +
                "FROM events " +
                "WHERE ts >= ? " +
                "AND type = 'track_skipped'"
              )
              .bind(since),

            env.DB
              .prepare(
                "SELECT COUNT(*) AS n " +
                "FROM events " +
                "WHERE ts >= ?"
              )
              .bind(since),

            env.DB
              .prepare(
                "SELECT COUNT(*) AS n " +
                "FROM events " +
                "WHERE ts >= ? " +
                "AND type = 'rediscovery'"
              )
              .bind(since),

            env.DB
              .prepare(
                "SELECT COUNT(DISTINCT session_id) AS n " +
                "FROM events " +
                "WHERE ts >= ? " +
                "AND type IN ('track_started','radio_play')"
              )
              .bind(since)
          ]);

        return json({

          sessions:
            results[0]
              .results[0]
              ?.n ?? 0,

          meaningfulPlays:
            results[1]
              .results[0]
              ?.n ?? 0,

          completions:
            results[2]
              .results[0]
              ?.n ?? 0,

          skips:
            results[3]
              .results[0]
              ?.n ?? 0,

          events:
            results[4]
              .results[0]
              ?.n ?? 0,

          rediscoveries:
            results[5]
              .results[0]
              ?.n ?? 0,

          radioSessions:
            results[6]
              .results[0]
              ?.n ?? 0
        });
      }

      /*
        Events.
      */

      if (
        url.pathname ===
        "/api/events" &&
        request.method === "GET"
      ) {

        const limit =
          Math.min(
            200,
            Math.max(
              1,
              Number(
                url.searchParams.get(
                  "limit"
                ) || 50
              )
            )
          );

        return json(
          (
            await env.DB
              .prepare(
                "SELECT * " +
                "FROM events " +
                "ORDER BY ts DESC " +
                "LIMIT ?"
              )
              .bind(limit)
              .all()
          ).results
        );
      }

      /*
        Sessions.
      */

      if (
        url.pathname ===
        "/api/sessions" &&
        request.method === "GET"
      ) {

        const limit =
          Math.min(
            100,
            Math.max(
              1,
              Number(
                url.searchParams.get(
                  "limit"
                ) || 50
              )
            )
          );

        return json(
          (
            await env.DB
              .prepare(
                "SELECT * " +
                "FROM sessions " +
                "ORDER BY last_seen DESC " +
                "LIMIT ?"
              )
              .bind(limit)
              .all()
          ).results
        );
      }

      /*
        Session events.
      */

      if (
        url.pathname ===
        "/api/session-events" &&
        request.method === "GET"
      ) {

        const id =
          url.searchParams.get(
            "id"
          ) || "";

        return json(
          (
            await env.DB
              .prepare(
                "SELECT * " +
                "FROM events " +
                "WHERE session_id = ? " +
                "ORDER BY ts"
              )
              .bind(id)
              .all()
          ).results
        );
      }

      /*
        Deployments.
      */

      if (
        url.pathname ===
        "/api/deployments" &&
        request.method === "GET"
      ) {

        return json(
          (
            await env.DB
              .prepare(
                "SELECT * " +
                "FROM deployments " +
                "ORDER BY created_at DESC " +
                "LIMIT 100"
              )
              .all()
          ).results
        );
      }

      if (
        url.pathname ===
        "/api/deployments" &&
        request.method === "POST"
      ) {

        let body = {};

        try {
          body = await request.json();
        } catch {}

        await env.DB
          .prepare(
            "INSERT INTO deployments " +
            "(created_at,build,ref,note) " +
            "VALUES (?,?,?,?)"
          )
          .bind(
            Date.now(),

            String(
              body.build || ""
            ).slice(0, 80),

            String(
              body.ref || ""
            ).slice(0, 120),

            String(
              body.note || ""
            ).slice(0, 500)
          )
          .run();

        return json(
          { ok: true },
          201
        );
      }

      /*
        Feature flags.
      */

      if (
        url.pathname ===
        "/api/flags" &&
        request.method === "GET"
      ) {

        return json(
          (
            await env.DB
              .prepare(
                "SELECT * " +
                "FROM feature_flags " +
                "ORDER BY name"
              )
              .all()
          ).results
        );
      }

      if (
        url.pathname ===
        "/api/flags" &&
        request.method === "POST"
      ) {

        let body = {};

        try {
          body = await request.json();
        } catch {}

        await env.DB
          .prepare(
            "INSERT INTO feature_flags " +
            "(name,enabled,updated_at) " +
            "VALUES (?,?,?) " +
            "ON CONFLICT(name) DO UPDATE SET " +
            "enabled=excluded.enabled," +
            "updated_at=excluded.updated_at"
          )
          .bind(
            String(
              body.name || ""
            ).slice(0, 100),

            body.enabled ? 1 : 0,

            Date.now()
          )
          .run();

        return json({
          ok: true
        });
      }

      /*
        QA.
      */

      if (
        url.pathname ===
        "/api/qa" &&
        request.method === "POST"
      ) {

        let body = {};

        try {
          body = await request.json();
        } catch {}

        const sessionId =
          "qa" +
          crypto.randomUUID()
            .replaceAll("-", "")
            .slice(0, 30);

        const now =
          Date.now();

        const scenario =
          String(
            body.scenario ||
            "scenario"
          ).slice(0, 120);

        await env.DB
          .prepare(
            "INSERT INTO sessions " +
            "(id,visitor_key,started_at,last_seen,build,event_count) " +
            "VALUES (?,?,?,?,?,1)"
          )
          .bind(
            sessionId,
            "qa" + sessionId,
            now,
            now,
            "observatory-qa"
          )
          .run();

        await env.DB
          .prepare(
            "INSERT INTO events " +
            "(session_id,ts,type,surface,subject,meta_json) " +
            "VALUES (?,?,?,?,?,?)"
          )
          .bind(
            sessionId,
            now,
            "qa_event",
            "system",
            scenario,
            JSON.stringify({
              synthetic: true,
              scenario
            })
          )
          .run();

        return json(
          {
            ok: true,
            sessionId
          },
          201
        );
      }

      /*
        Feature counts.
      */

      if (
        url.pathname ===
        "/api/feature-counts"
      ) {

        return json(
          (
            await env.DB
              .prepare(
                "SELECT type,COUNT(*) AS count " +
                "FROM events " +
                "GROUP BY type " +
                "ORDER BY count DESC"
              )
              .all()
          ).results
        );
      }

      return json(
        {
          error: "not_found"
        },
        404
      );
    }

    /*
      Everything else gets the dashboard.
      No Static Assets system is involved.
    */

    return new Response(
      dashboardHTML(),
      {
        status: 200,
        headers: {
          "content-type":
            "text/html; charset=utf-8",

          "cache-control":
            "no-store",

          "x-content-type-options":
            "nosniff",

          "x-frame-options":
            "DENY",

          "referrer-policy":
            "no-referrer",

          "content-security-policy":
            "default-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "script-src 'self' 'unsafe-inline'; " +
            "connect-src 'self'; " +
            "base-uri 'none'; " +
            "frame-ancestors 'none'"
        }
      }
    );
  }
};
