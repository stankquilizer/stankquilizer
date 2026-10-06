# stankquilizer — observatory final build

Private owner control room for stankquilizer — music.

## Included

- Worker-side password gate using `OBSERVATORY_PASSWORD`
- HttpOnly + Secure + SameSite=Strict auth cookie
- Optional Cloudflare Access perimeter
- Private D1 event store
- write-only telemetry collector
- public-site telemetry bridge
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

For your current public site, the safer path is:

1. copy `public-site-connected/telemetry-client.js` to the public site's root;
2. add the two configuration lines + script tag from `public-site-connected/INTEGRATION-SNIPPET.html` immediately before `</body>`;
3. keep your current v3.7 + Category 5 code unchanged;
4. optionally emit Category 5-specific events with `window.dispatchEvent(new CustomEvent('stankquilizer:telemetry',{detail:{type:'rediscovery',surface:'memory',subject:'',meta:{...}}}))`.

The bridge is additive and deliberately does not upload the raw Category 5 memory profile.

## Demo / production password

The requested access phrase is `draquilizer`.

It is NOT embedded in the dashboard. Set it as the Cloudflare Worker secret named `OBSERVATORY_PASSWORD`.

For maximum protection, also put the observatory hostname behind Cloudflare Access.
