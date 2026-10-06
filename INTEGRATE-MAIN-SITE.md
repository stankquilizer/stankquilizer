# Integrate with the current main site

Do not replace the current live `index.html` with the reference copy in `public-site-connected/`.

Use the telemetry bridge additively:

1. Copy `public-site-connected/telemetry-client.js` to the current public site's root.
2. Immediately before `</body>`, add:

```html
<script>
window.STANKQUILIZER_TELEMETRY_ENDPOINT='https://telemetry.stankquilizer.workers.dev/collect';
window.STANKQUILIZER_BUILD='current-public-build';
</script>
<script src="/telemetry-client.js" defer></script>
```

3. Keep all existing v3.7 + Category 5 code untouched.
4. Keep the existing `audio/` directory untouched.
5. For deeper Category 5 coverage, emit the optional `stankquilizer:telemetry` CustomEvent from the existing engine.

The observatory is intentionally a separate website/Worker. The public site does not get an admin panel.
