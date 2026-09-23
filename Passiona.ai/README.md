# Passiona — Official Website

The public website for **Passiona**, a Hong Kong school AI-literacy programme with two tracks: Primary 1 (ages 5–6) and Primary 5 (ages 9–10). Each track has 20 lessons built around the AI Workshop, Fit Studio, Coding Buddy and AI City.

**Live URL:** https://passiona.ai

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **3D:** Three.js (interactive champion preview in hero)
- **i18n:** next-intl (English / Traditional Chinese)
- **Deployment:** Cloudflare Workers (OpenNext)

## Run Locally

Requires Node.js 18.18+ (tested on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:3000 to view the site. The language toggle (EN / 中文) is in the top navigation.

## Production Build

```bash
npm run build
npm run start
```

## Deploy to Cloudflare Workers

The site is built with [OpenNext](https://opennext.js.org) for Cloudflare Workers.

```bash
# 1. Log in to Cloudflare (once)
npx wrangler login

# 2. Build the OpenNext worker
npx opennextjs-cloudflare build

# 3. Deploy
npx wrangler deploy
```

Configuration lives in `wrangler.jsonc` (worker name: `passiona`).

## Project Structure

```
app/          Pages and routes
components/   UI components (Hero, Pillars, GoalsPanel, UseCases, footer...)
i18n/         next-intl configuration
lib/          Utilities
messages/     Translation files (en.json, zh.json)
public/       Static assets (images, 3D models, animation clips)
```

## Notes

- Content is bilingual — edit `messages/en.json` and `messages/zh.json` for copy changes. Keys must stay in sync.
- 3D champion model lives in `public/champion/` (GLB + animation clips).
- Public pages are rendered from local content. The /api/lead route accepts adult enquiries and forwards them when LEAD_FORWARD_URL is configured; without it, the current development fallback logs the enquiry server-side.
