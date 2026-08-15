// Planner worker — pure static app with a clean root: / → the planner.
// The planner is fully client-side (its Optimize uses a local hill-climb), so
// this worker only serves the static assets binding and redirects the root.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    // Clean permanent root: / → /city-planner/ is handled by serving
    // planner index directly at root (assets directory IS the planner root).
    // Any /api/* path is a 404 (the planner has no API dependency).
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Everything else is static — delegate to the assets binding (it serves
    // index.html for directory requests and handles subpaths).
    return env.ASSETS.fetch(request);
  },
};
