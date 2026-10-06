# Launch guide — phone-first

This launches three Workers while preserving the existing public site:

1. `stankquilizer` — your existing public Worker
2. `stankquilizer-telemetry` — anonymous write-only collector
3. `stankquilizer-observatory` — private owner dashboard

## 0. Back up the live site

Download/copy the current repository before changing anything. Do not replace the live `index.html` with an older build.

Keep the existing `audio/` folder and all 12 radio MP3s exactly where they are.

## 1. Put the new folders in GitHub

Add these folders/files to the repository:

```text
collector/
  worker.js
  wrangler.jsonc
observatory/
  worker.js
  wrangler.jsonc
  public/
    index.html
  migrations/
    0001_initial.sql
public-site-connected/
  telemetry-client.js
  INTEGRATION-SNIPPET.html
```

You can also keep the docs and tests from this package outside the deployed roots.

## 2. Create the D1 database

In Cloudflare, create a D1 database named `stankquilizer-observatory`.

Or from a terminal/Codespace:

```bash
npx wrangler d1 create stankquilizer-observatory --jurisdiction eu
```

Copy the returned `database_id`.

Replace `REPLACE_WITH_D1_DATABASE_ID` in BOTH:

```text
collector/wrangler.jsonc
observatory/wrangler.jsonc
```

## 3. Apply the migration

From the repository root:

```bash
npx wrangler d1 migrations apply stankquilizer-observatory --remote --config observatory/wrangler.jsonc
```

If your Wrangler version requires the migration config from the Worker directory, use:

```bash
cd observatory
npx wrangler d1 migrations apply stankquilizer-observatory --remote
```

Confirm `sessions`, `events`, `deployments`, and `feature_flags` exist.

## 4. Deploy the collector

Cloudflare Dashboard → Workers & Pages → Create Worker / connect Git.

Use repository root:

```text
/collector
```

Deploy command:

```text
npx wrangler deploy
```

The collector expects the public origin:

```text
https://stankquilizer.stankquilizer.workers.dev
```

If you later attach a custom domain, update `ORIGIN` in `collector/worker.js` to the exact public origin and redeploy.

## 5. Deploy the observatory

Create/connect another Worker from the SAME repository.

Root directory:

```text
/observatory
```

Deploy command:

```text
npx wrangler deploy
```

Then add the Worker secret:

```text
OBSERVATORY_PASSWORD = draquilizer
```

Do this in Cloudflare Dashboard → Worker → Settings → Variables and Secrets → Add Secret.

The password is never placed in the dashboard HTML.

## 6. Add telemetry to the CURRENT public site

Do NOT overwrite your current public `index.html`.

Copy:

```text
public-site-connected/telemetry-client.js
```

to the root of the live public site.

Immediately before `</body>`, add the exact contents of:

```text
public-site-connected/INTEGRATION-SNIPPET.html
```

This is additive and preserves your current player, Category 5 memory, audio analyser, fullscreen radio, and visual systems.

## 7. Optional Category 5 event hooks

The bridge automatically observes the major public player/album/fullscreen events.

For deeper Category 5 visibility, emit anonymous events from the existing Category 5 engine:

```js
window.dispatchEvent(new CustomEvent('stankquilizer:telemetry', {
  detail: {
    type: 'rediscovery',
    surface: 'memory',
    subject: '07',
    meta: { reason: 'rediscovery' }
  }
}));
```

Use the same mechanism for:

- affinity_change
- avoidance_change
- decay
- memory_ghost
- memory_corruption
- milestone
- unlock
- completion
- site_state
- temperature_change
- archetype_change
- session_evolution
- late_night

Never send the raw memory object.

## 8. Test authentication BEFORE real telemetry

Open the observatory URL.

Wrong password → must remain locked.

Correct password:

```text
draquilizer
```

→ dashboard opens.

Then open DevTools/network if available and verify `/api/health` is `401` when no auth cookie exists.

## 9. First real telemetry test

On your phone, open the public site in a fresh/private tab.

1. press radio play;
2. let one track pass 10 seconds;
3. skip once;
4. enter an album/project;
5. open fullscreen;
6. close fullscreen;
7. leave the page.

Open the observatory → `sessions` and `events`.

You should see the anonymous session and event sequence.

## 10. Verify Category 5 observability

Open `qa / test console`.

Run each synthetic case:

- first visit
- returning visitor
- visit 5+
- late night
- 5 min evolution
- 10 min glow
- 20 min symbols
- 30 min milestone
- reduced motion
- light mode
- soft res(e)t
- full res(e)t
- rebirth
- completion
- emit feature coverage

Synthetic QA is labelled separately and never mutates a real visitor profile.

## 11. Verify the old v3.7 foundation

Use the `player laboratory` and `feature matrix` to confirm the observatory tracks the existence/health of:

- audio reactivity / analyser
- track-specific gain
- mood controller
- particles / symbols
- session evolution
- site memory
- returning visitor behavior
- late-night line
- transmission log
- fullscreen radio
- track-specific identity
- signal state
- Media Session / keyboard playback
- volume behavior
- dynamic title/favicon
- radio ↔ album indicators
- light/dark mode
- reduced-motion handling

The observatory does not replace these systems; it observes them.

## 12. Mobile verification

Check the observatory at:

- 320px
- 360px
- 390px
- 430px
- 760px

At phone widths you should get:

- bottom navigation
- `more` sheet for the remaining tools
- no horizontal page scroll
- horizontally contained tables
- wrapped QA controls
- readable session details
- safe-area padding at the bottom

## 13. Deployment diff

After each real public release, open `deployment diff` and record:

- build/version
- Git ref
- short release note

This lets you correlate behavior changes with deployments.

## 14. Add the second security layer

For the strongest owner-only setup, put the observatory hostname behind Cloudflare Access as well.

Use the Worker password as the application-level gate and Access as the identity perimeter.

## 15. Final checklist

```text
[ ] current public site backed up
[ ] D1 created
[ ] D1 migration applied
[ ] collector deployed
[ ] observatory deployed
[ ] OBSERVATORY_PASSWORD secret = draquilizer
[ ] telemetry-client.js added to CURRENT public site
[ ] public audio/ folder untouched
[ ] 12 radio tracks still play
[ ] wrong observatory password rejected
[ ] correct password accepted
[ ] unauthenticated /api/health rejected
[ ] real anonymous session appears
[ ] real events appear
[ ] session timeline expands
[ ] player laboratory receives telemetry
[ ] QA synthetic probes work
[ ] no IP/location/raw memory fields exist
[ ] phone layout checked
[ ] optional Cloudflare Access enabled
```
