# Gemini audit — Pass 1: server / worker / logic (2026-09-10)

**Surface:** the buddy gateway — `buddy-kit/server/*` (21 files), `buddy-kit/worker/index.mjs`,
`buddy-kit/logic/*` — the one surface no prior Gemini pass had read. (The earlier
`server-pii-audit.md` was a DeepSeek read; this is a fresh-eyes model pass over the same code.)

**Method:** ONE single-shot pro request (the `@p5-auditor` subagent 429-storms the relay):
`cat` of all 30 files with per-file `===== path =====` headers + real `cat -n` line numbers, piped to
`gemini -p "<prompt>" -m gcli-gemini-3.1-pro-preview --skip-trust`. Raw output:
`.tmp`-style scratch (this cycle). Every finding below was re-read at the cited `file:line` by hand
before any fix.

Calibration: **[V]** verified locally · **[A]** agent-claimed, plausible · **[X]** refuted.

## Findings

| # | Sev (agent) | Verdict | Location | Issue | Action |
|---|---|---|---|---|---|
| F1 | HIGH | **[V]** | `server/turn.js:337`, `:436` | Error logs scrubbed only the request's BYOK key, never the DEPLOYMENT key (`BUDDY_MODEL_KEY` / a registry `keyEnv`) — an upstream SDK error that echoes the Authorization header would leak the deployer credential. Also `url` was logged un-scrubbed (a key can ride a query string). | **FIXED** — `secretValues()` + `scrubSecrets()` scrub every configured secret from message AND url. Test: `tests/turn-log-scrub.test.mjs`. |
| F2 | MEDIUM | **[V] known** | `worker/index.mjs` `/api/save`, `/api/load` | Unauthenticated, no rate limit → KV write abuse / bill. | **No change** — already documented + accepted in `server-pii-audit.md` (no accounts by design). |
| F3 | LOW | **[V]** | `worker/index.mjs:158`, `:220` | `MAX_SAVE_BYTES` (1 MB) was unreachable: the generic body gate (`MAX_BODY_BYTES` 256 KB) rejected any larger save first, so the advertised cap was dead and big saves failed with a misleading 400. | **FIXED** — `bodyOf(request, maxBytes)`; the save route passes `MAX_SAVE_BYTES`, everything else keeps 256 KB. Test added. |
| F4 | LOW | **[X] refuted** | `logic/kid-markdown.js:108` | Claim: partial ```` ``` ```` fences show raw backticks mid-stream. | **No change** — refuted by running the pure parser: `stripMarkers()` removes stray backticks (`"Let me do this \`\`" → "Let me do this "`) and fenced content stays hidden. |
| F5 | (open Q) | **[V] new** | `deploy/scripts/deploy-city-apps.sh` + `hong-kong-real/quests.js:26` | Gemini asked whether the worker's `/project/` static mount exists. It does not: quest id 4's relative `gameUrl: '/project/p3-18-3d-city/'` exists at `P5 Programme/project/p3-18-3d-city/` but is **never copied into the city-sim bundle**, so that quest iframe 404s in production (works only under the Node shell, which mounts `project/`). | **DOCUMENTED, not fixed** — fixing means shipping an old minigame app; product decision (see below). |

## Strengths the pass reconfirmed

- **System prompt is injection-proof by construction:** manifest/state/notes are structurally
  sanitized + `screen()`ed *before* `composeInjection`, so a forged body cannot smuggle instructions.
- **SSRF is closed:** BYOK resolves `modelProvider` against the hard-coded `PROVIDERS` list and
  rejects `requiresBaseUrl` providers — a client can supply a credential, never a destination URL.
- **One-terminal-frame guarantee holds:** the `wroteTerminal` lock prevents a second `done`/`cut`.
- **Statelessness is pristine:** per-request `ctx`, client-owned transcript; the Worker's per-isolate
  `boot`/`brake` is the documented serverless trade-off.

## Shell-drift result (server/gateway.js vs worker/index.mjs)

The only behavioural divergences are **intentional**: the Worker adds `/api/save` + `/api/load`
(cloud saves are Worker-only; the Node shell is dev-only), and static serving differs by design
(Node `routeStaticPath` mounts vs Worker `ASSETS` + `/buddy` fallback). The body-cap mismatch (F3)
was the one accidental divergence and is now fixed.

## Open item for the product owner

**F5 — `/project/p3-18-3d-city/` is not deployed.** Either (a) add
`cp -r "$KIT/../project" city-sim/project` to `build_city_sim()` so the relative quest URL resolves
same-origin, or (b) point quest id 4's `gameUrl` at wherever that game actually lives (or set it
`null` so it shows the honest "⏳" like the other undeployed quests). Needs a call — it is a
pre-existing gap, not caused by this cycle.

## Calibration tally

5 agent findings → 3 [V] (2 fixed, 1 known/accepted), 1 [V] new (F5), 1 [X] refuted. That ~20%
refutation rate is the reason the DeepSeek verify-at-`file:line` gate is mandatory.
