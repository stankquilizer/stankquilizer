# Telemetry on the current public site

The root `index.html` already loads the root `telemetry-client.js` after the current player and Category 5 scripts. This bridge is additive: it observes the existing radio, album links, fullscreen controls, theme control, and aggregate memory state without replacing the player or uploading raw visitor memory.

Before deploying, set `window.STANKQUILIZER_TELEMETRY_ENDPOINT` in `index.html` to the deployed collector's exact `/collect` URL. The collector's `TELEMETRY_ALLOWED_ORIGINS` variable must include the public site's exact origin if it differs from the current Workers.dev origin.

The separate `public-site-connected/` directory is a reference copy for another site build. Do not use it to replace the current root `index.html`.

Category 5 integrations may emit any allowlisted event through:

```js
window.dispatchEvent(new CustomEvent('stankquilizer:telemetry', {
  detail: {
    type: 'rediscovery',
    surface: 'memory',
    subject: 'track title',
    meta: { reason: '14-day-return' }
  }
}));
```

Only allowlisted metadata is stored. Never pass the raw Category 5 profile, a URL, or personal information.
