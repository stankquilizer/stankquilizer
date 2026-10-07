# stankquilizer — observatory final build

Private owner control room for stankquilizer — music.

## Included

- Worker-side password gate using `OBSERVATORY_PASSWORD`
- HttpOnly + Secure + SameSite=Strict auth cookie
- Optional Cloudflare Access perimeter
- Private D1 event store
- validated, idempotent telemetry collector with a durable offline client queue
- public-site telemetry integrated into the existing root `index.html`
- overview / live transmission / sessions / memory / player / radio / projects / journeys / features / QA / events / deployment diff / privacy / system
- all 21 Category 5 v2 features represented in the feature matrix
- v3.7 foundation diagnostics represented in player/system/feature views
- synthetic QA controls for the major pre-v3.8 and Category 5 milestones
- deployment history
- anonymous session timelines
- mobile bottom navigation + more sheet
- responsive tables and 320px-safe layout
- no IP, location, names, full URLs, raw visitor memory, or user-agent storage

## Important public-site rule

Do NOT replace your current live public `index.html` with `public-site-connected/index.html` unless you have deliberately verified it is the exact public build you want. That file is a reference/integration copy based on the v3.7 foundation.

The root `index.html` keeps the existing v3.7 + Category 5 player and loads the root `telemetry-client.js` additively. The client stores only random visitor/session IDs and a bounded event queue; it never uploads the raw Category 5 memory profile. Set `window.STANKQUILIZER_TELEMETRY_ENDPOINT` in `index.html` to the collector's deployed `/collect` URL before publishing.

`public-site-connected/` remains a reference integration copy for a separate public build; do not replace the root site with it.

## Demo / production password

The requested access phrase is `draquilizer`.

It is NOT embedded in the dashboard. Set it as the Cloudflare Worker secret named `OBSERVATORY_PASSWORD`.

For maximum protection, also put the observatory hostname behind Cloudflare Access.
