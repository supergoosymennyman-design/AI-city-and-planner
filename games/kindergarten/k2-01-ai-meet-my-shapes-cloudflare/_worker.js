/**
 * _worker.js — Serves static files + handles API endpoint
 * Deploy alongside static files (index.html, *.js, *.svg) to Cloudflare
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── API route: SVG generation via DeepSeek ──
    if (url.pathname === "/api/generate-svg" && request.method === "POST") {
      try {
        const body = await request.json();
        const prompt = body.prompt;
        if (!prompt) {
          return new Response(JSON.stringify({ error: "Missing prompt" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const apiKey = env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "DEEPSEEK_API_KEY not set" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const deepseekResp = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: "You are an SVG designer for children's games. Return ONLY raw SVG code. No explanations." },
              { role: "user", content: prompt }
            ]
          })
        });

        if (!deepseekResp.ok) {
          const errText = await deepseekResp.text();
          return new Response(JSON.stringify({ error: "DeepSeek error: " + deepseekResp.status }), {
            status: 502,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const data = await deepseekResp.json();
        const svg = data.choices?.[0]?.message?.content || "";

        return new Response(JSON.stringify({ svg }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── Serve static files ──
    // Cloudflare Pages: env.ASSETS.fetch serves uploaded static files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Fallback for local testing or Workers-only mode
    return new Response("Not found: " + url.pathname, { status: 404 });
  }
};
