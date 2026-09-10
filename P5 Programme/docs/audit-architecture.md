# Gemini audit — Pass 3: architecture consolidation (2026-09-10)

**Surface:** cross-cutting duplication — the two i18n dictionaries, the two HUD stylesheets, the two
`links.js` mirrors, the two gateway shells, and the 4156-line `city-builder.js` monolith.

**Method:** ONE single-shot pro request over a context of (a) a repo inventory with line counts,
(b) a structure digest of the monolith, and (c) the FULL text of the duplication suspects. Same
`cat -n` mechanism; every finding re-read at the cited `file:line` before acting.
Calibration: **[V]** verified · **[A]** claimed · **[X]** refuted.

## What the pass found, and what was actually done

| # | Sev | Verdict | Finding | Action |
|---|---|---|---|---|
| F1 | HIGH | **[V]** | `champion-city/i18n.js` + `city-builder/i18n.js` are two modules: 72 shared keys (2 with drifted values), and — critically — **two independent `_lang` copies**. The city HUD toggle updates only city-builder's, so the champion sidebar (which uses champion-city's `t()`) **froze in its boot language**. | **BUG FIXED** — `champion-city/i18n.js` now re-reads `LANG_KEY` on `i18n:change`. Test: `tests/p5-champion-i18n-sync.test.mjs`. **Full dict merge DEFERRED** (the 2 drifted values mean a merge changes copy — needs product sign-off). |
| F2 | HIGH | **[A] deferred** | `champion-city/styles.css` (892) + `city-builder/styles.css` (748) share HUD scaffolding. | **DEFERRED** — CSS extraction is a visual-regression risk; the golden rule is to verify visual outcomes on-device, not by guesswork. Documented as a planned refactor. |
| F3 | MEDIUM | **[A] partially adopted** | `home/links.js` mirrors `shared/links.js`; Gemini proposed a symlink. | **Guard added, symlink REJECTED** — a symlink to `../shared/` would dangle in the home worker (which ships only its own folder). Added `tests/p5-links-mirror.test.mjs` instead, which fails if the two files drift. |
| F4 | MEDIUM | **[V] partially adopted** | The two gateway shells duplicate routing/response logic. | **Constants SHARED, router DEFERRED** — `MAX_BODY_BYTES`, `NDJSON_HEADERS`, `BRAKE_REPLY` moved to `server/shell-constants.js` (imported by both shells), removing the literal "keep in sync" drift. A full shared router is real churn; Pass 1 already confirmed the shells are faithful except the intentional `/api/save`+`/api/load` addition. |
| F5 | LOW | **[A] deferred** | `city-builder.js` (4156 lines) is a monolith. | **DEFERRED** — Gemini's own advice was to leave the scene/loop/input blocks alone (closure-heavy, no bundler); extracting road-fx/vegetation/save-system is a dedicated cycle, not a drive-by. |

## The high-value find: a bug the duplication was hiding

The two i18n modules each hold their own `_lang`. `champion-city/skins.js` calls `initI18n()` at
module load and re-renders on `i18n:change`, but its `t()` reads champion-city's stale `_lang` — so
after a 中/EN toggle the skin/accessory sidebar stayed in the old language while the rest of the HUD
switched. The fix (re-read the persisted language on the shared event) is one listener; the test
proves the sidebar follows the toggle.

## Strengths the pass reconfirmed

- Buildless ES modules + importmap with no bundler keeps the pipeline fast and the source readable.
- `logic/` as a Node/browser-shared sibling is an effective single-source decision.
- Transport shells (`gateway.js` / `worker/index.mjs`) are cleanly separated from domain logic
  (`turn.js`), which is what makes the constants extraction safe.

## Deferred backlog (for a dedicated architecture cycle)

1. **i18n single source** — merge the two dicts (resolve the 2 value conflicts first) OR extract a
   shared base dict + per-app overrides. Would remove ~72×2 duplicated strings and the drift risk.
2. **HUD CSS extraction** — `city-common/hud.css` + per-app override layer; needs on-device visual QA.
3. **Gateway shared router** — a platform-agnostic `routeApi()` so the Node/Worker shells are pure
   transports.
4. **Monolith decomposition** — extract `road-fx.js`, `vegetation.js`, `save-system.js` (Gemini's
   low-risk picks); leave the scene/loop/input core.

## Calibration tally

5 findings → 1 [V] bug fixed, 1 [V] consolidation (constants), 1 guard added, 2 [A] deferred with
rationale. Gemini's architecture read was accurate on the duplication but its fixes were mostly
medium/high-risk refactors; the low-risk, high-payoff slice was the sync bug + shared constants.
