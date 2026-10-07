export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // PROOF TEST: if this responds, the Worker is executing.
    if (url.pathname === "/api/auth-status") {
      return new Response(
        JSON.stringify({
          worker: "RUNNING",
          version: "CLEAN-TEST-1",
          secretConfigured: !!env.OBSERVATORY_PASSWORD,
          d1Configured: !!env.DB
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store"
          }
        }
      );
    }

    // Serve the Observatory website for everything else.
    return env.ASSETS.fetch(request);
  }
};
