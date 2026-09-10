# Invariant + data-loss audit — client (2026-09-10)

**Method:** three read-only Gemini `@p5-auditor`-style passes over the client
source (piped in with real line numbers, one request per pass to respect the
relay's 10 req/min cap). Every finding below was **manually re-read and
confirmed** at the cited `file:line` before any fix. Line numbers in the model's
raw output were unreliable when the source was not numbered; numbering fixed it.

**Scope:** `P5 Programme/buddy-kit/client/` only. The worker/server
(`buddy-kit/worker`, `buddy-kit/server`) is a separate surface, out of scope.

## Verdict

- **No child PII leaves the device beyond the intended chat + cloud-save paths.**
- **No camera / microphone capture exists anywhere in the client** (only
  `AudioContext` for sound). The "camera/mic stays in-memory" rule is moot.
- **No telemetry / analytics / third-party tracking endpoints.**
- **No `eval` / `new Function` / `document.write`; no XSS via `innerHTML` from
  child free text** (the saved city name is only ever used as an `<input>` value
  and a sanitized filename).
- **All algorithm invariants HOLD** (roads sacred, deterministic, never-worse,
  locks/specials, real road walking).

## Findings (confirmed)

| # | Sev | Location | Issue | Status |
|---|---|---|---|---|
| A1 | MEDIUM | `city-common/champion-file.js:61` | `writeState` swallows quota errors → a restore can silently drop some keys (partial restore). | **FIXED** |
| A2 | HIGH | `city-pregame/app.js` (finale) | The Academy had **no Champion File save** — progress only travelled if the child later saved from the planner/city. | **FIXED** |
| A3 | MEDIUM | `city-builder/city-builder.js:2820` | Hardcoded `'hk_ai_city_quests_v1'` instead of `QUEST_STATE_KEY`/`saveQuestState` → drift risk. | **FIXED** |
| A4 | LOW | `city-builder/city-builder.js:3345,3536` | `SAVE_NAME_KEY`/`CAPS_KEY` duplicated instead of aliasing `CF_KEYS`. | **FIXED** |
| A5 | LOW | `city-planner/index.html:208`, `city-builder/index.html:238`, planner i18n | Save copy suggested using a **real name** ("your name, or a class code"), which is stored in the cloud KV. | **FIXED** |
| A6 | LOW | `buddy.js:1230` | Child chat text + buddy name are POSTed to the gateway (→ a third-party model) with no child-facing disclosure. | **OPEN** (product copy) |
| A7 | LOW | `city-builder/city-builder.js:3380` | Cloud load code sent as a URL query param (`/api/load?code=`). The code is a random mnemonic, not PII. | **OPEN** (server-side) |
| A8 | LOW | `hong-kong-real/quests.js:27+` | Minigames are embedded as third-party `*.workers.dev` iframes. | **OPEN** (verify origins) |
| A9 | LOW | `buddy.js:303` | BYOK `providerKey` is sent in the `/api/turn` payload. Advanced/off-by-default. | **OPEN** (note) |

## Data-flow map (child data → sink)

- Chat message / transcript (free text) → `POST /api/turn` (`buddy.js:1230`)
- Buddy name (free text) → `POST /api/turn` / `/api/tidy-up`; device-local budget key
- City label (free text) → `POST /api/save` (`city-builder.js:3370`) + `p5_city_save_name_v1`
- Custom model id (free text) → `POST /api/turn`; `buddy.customModels`
- Cloud code (free text) → `GET /api/load?code=` (`city-builder.js:3380`); `p5_cloud_code_v1`
- Provider key (secret) → `POST /api/turn`; `buddy.key.<provider>`
- Layout / quests / props / badges / milestones / caps → `POST /api/save` state; localStorage
- Fitted champion GLB → IndexedDB `p5_champion_custom_skin` (never uploaded)

## Device-local keys — verdicts (correct)

`p5_city_saved_at_v1`, `p5_cloud_code_v1`, `p5_city_cap_lastdec_v1`,
`buddy.spent.*`, `buddy.model.*`, `buddy.key.*`, `buddy.customModels`, and the
IndexedDB custom-skin blob are all **correctly device-local** — transient,
device-scoped, or too large (GLB) to travel. They must NOT be added to `CF_KEYS`.

## Open items for the product owner

- **A6:** the buddy sends free text to a model provider. Consider a one-line,
  child-friendly disclosure in the buddy UI ("your messages go to an AI brain to
  get a reply"). No code change made this cycle.
- **A7:** move the cloud load code from a query param to a POST body when the
  worker is next touched (server-side; client-only this cycle).
- **A8:** confirm every `gameUrl` origin in `quests.js` is a programme-owned
  deployment with no third-party analytics.
- **Custom skin:** IndexedDB is evictable and non-portable by design; the child
  silently becomes the default champion on a new device. Consider a UI note.
