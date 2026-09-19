# Server/worker PII + security audit (2026-09-10)

**Scope:** `P5 Programme/buddy-kit/worker/` + `P5 Programme/buddy-kit/server/` +
`P5 Programme/buddy-kit/logic/` — the surfaces the client-only `invariant-audit.md`
deliberately excluded. Method: direct read of the source (every finding re-read by
hand at the cited `file:line` before any change), plus the worker's `/api/save` +
`/api/load` handlers exercised through `tests/worker-save-load.test.mjs`.

## Verdict

- **No server-side retention of child data.** The gateway is stateless: no chat
  history, no lesson singleton, no per-child anything. Every per-request value
  lives in `runTurn`'s locals; the only mutable module state anywhere in `server/`
  is `brake.js`'s deployment-scoped runaway counter.
- **No telemetry / analytics endpoints.**
- **Logs never carry child content.** Every error path logs `e.stack` (never the
  error object — an AI-SDK `APICallError`'s `requestBodyValues` is the child's whole
  conversation), the byok key is split-replaced with `[key]`, and the message is
  capped at 200 chars (`turn.js:335-338`, `turn.js:434-437`, `gateway.js:256`,
  `worker/index.mjs:246`). A transcript sanitizer drop is logged as a **count only**
  (`turn.js:207`).
- **No hardcoded secrets.** `provider.js:14`'s `DEFAULT_BASE_URL` is a public
  endpoint, not a credential. `server/.env` is gitignored (root `.gitignore` `.env`
  rule), untracked, and excluded from the deploy bundle (`deploy-city-apps.sh:136`
  `rsync --exclude '.env'`).

## What `/api/turn` ships to the model (confirmed)

Default brain is `deepseek-v4-flash-free` @ `https://opencode.ai/zen/v1`
(`provider.js:14-15`) — **not** OpenRouter by default (OpenRouter is a keyed/optional
provider, `model-registry.js:44-49`).

| Field | Forwarded to model? | Notes |
|---|---|---|
| transcript | **yes** | sanitized: role whitelist + content only, ≤240 entries, ≤16K chars each; extra fields stripped (`transcript-sanitize.js:29-51`) |
| `buddyName` | **yes** | in the system prompt (`"The child named you …"`); `sanitizeBuddyName` screened (`memory.js:56-66`) |
| `childName` | **no** | sent by the client (`buddy.js:175`) but **deliberately ignored** server-side (`turn.js:142-143`); never reaches the model |
| `providerKey` (BYOK) | **no** | used only as the AI-SDK Authorization header for that one call; never in the messages body, never stored, never logged (scrubbed) |

The system prompt also carries the curated Setting/User/Champion markdown
(`memory.js`), each re-screened on entry.

## Cloud save/load (worker-only)

- `/api/save` KV payload: `{ label, savedAt, state }`, 1 MB cap. The label is free
  text a child types, so it is now **screened + length-capped (64 chars)** and falls
  back to `"My AI City"` on a flag/over-long value — reinforcing A5 at the server,
  not just in the copy.
- `/api/load` moved from `GET ?code=` to **`POST { code }`** (A7): the cloud code is
  the child's only key to their city and must not land in browser history, request
  logs or `Referer` headers.
- **No auth / no rate limit** on `/api/save` + `/api/load` — accepted by design (no
  accounts, opaque random codes). The deployment brake wraps only `/api/turn` +
  `/api/tidy-up`. Documented here as a known surface, not fixed.

## Findings

| # | Sev | Location | Issue | Status |
|---|---|---|---|---|
| A7 | LOW | `worker/index.mjs` `/api/load` | Cloud code sent as a URL query param. | **FIXED** (POST body; client `city-builder.js` updated; test pins GET → 404) |
| A5+ | LOW | `worker/index.mjs` `savePayload` | Free-text `label` was stored unscreened/uncapped. | **FIXED** (screen + 64-char cap → neutral default) |
| — | INFO | `worker/index.mjs` save/load | No rate limit on anonymous KV writes. | Documented, accepted |
| A9 | LOW | `buddy.js:303` | BYOK `providerKey` rides `/api/turn`. | **CLEAN** — per-call header only; logs scrub the key; never stored. Documented |

## Data-flow map (child data → sink) — server view

- Chat message / transcript (free text) → `POST /api/turn` → model provider. Stateless.
- Buddy name (free text) → `POST /api/turn` → system prompt (screened).
- City label (free text) → `POST /api/save` → KV (now screened + capped).
- Cloud code (opaque) → `POST /api/load` → KV lookup (body only).
- Provider key (secret) → `POST /api/turn` → provider Authorization header, per-call.

## Open items

- **A6 / A8 / A11** are client-side and tracked in `invariant-audit.md` +
  this cycle's sprint notes.
- `*.supergoosymennyman.workers.dev` quest origins are owner-confirmed but
  unprofessional for public links — a future domain-migration item, not a security
  blocker.
