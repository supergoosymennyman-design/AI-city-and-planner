# P5 Programme — Audit Handoff (2026-09-09, Gemini-agent pass)

Purpose: continue the code + UX audit of the Passiona P5 Programme from where the
previous handoff stopped. This document records the second audit pass — performed
by the Gemini CLI (`@p5-auditor` subagent, relay model `gcli-gemini-3.1-pro-preview`,
rate-limited to 10 req/min) — plus local verification of the most important claims.

Canonical source of truth: `P5 Programme/buddy-kit/client/`. `deploy/` is build
output; never edit it for real fixes.
Live: hub https://p5-home.clover-marquis.workers.dev/ · city sim (planner +
pregame + 3D city on ONE origin) https://p5-city-sim.clover-marquis.workers.dev/

---

## 1. What this pass covered

| Area | Slice result | Notes |
|---|---|---|
| city-builder.js 1032–2000 (boot, layout, quest, btns, champion spawn) | ✅ slice | 3 findings |
| city-builder.js 2000–3000 (save/cloud) | ✅ (grep slice) | 5 findings |
| city-builder.js 3000–3938 (traffic/mount/teardown) | ✅ slice01 | 6 findings |
| city-builder submodules (drive/pedestrians/traffic/minimap/clouds/i18n/buddy) | ✅ slice02 | 8 findings |
| city-builder submodules (prop-library/street-props/deco/furniture/fabric) | ✅ slice03 | 8 findings |
| city-planner/planner.js 1272–1975 (My move, export, license, init) | ✅ slice04 | 5 findings |
| city-pregame/styles.css + home (css/js/champion) | ✅ slice05 | 4 findings |
| city-common + shared | ✅ slice06 | 5 findings |
| champion-city/* + hong-kong-real/* | ✅ slice07 | 5 findings |
| buddy-kit server/logic/worker + tests | ✅ slice08 | 5 findings |

Method: each slice was a single `gemini -p "@p5-auditor …"` headless run with one
bulk `run_shell_command` read + a bounded report (≤400 words). Findings below are
**calibrated**: [V] = verified locally by the orchestrator, [A] = agent-reported,
plausible but not yet line-verified, [X] = agent claim refuted by local check.

---

## 2. Findings (calibrated, grouped)

### 2.1 Data-loss / persistence (HIGH risk area)

1. **[V] HIGH** `buddy-kit/client/city-builder/city-builder.js` — success toast for
   Cloud save + Champion File restore is wiped by `setTimeout(() => window.location.reload(), 600)`
   (0.6s is too fast to register; ~2.5s better). Same file: `showToast` auto-removes at
   2600ms — long warnings (e.g. "no roads") vanish before a 10-year-old reads them.
2. **[V] MEDIUM** `champion-city + hong-kong-real` — quest/prop state lives only in
   `localStorage` (`hk_ai_city_quests_v1`, `hk_ai_city_props_citybuilder_v1`); iOS evicts
   after ~7 days. `city-common/champion-file.js` `CF_KEYS` covers citybuilder props but
   **not** per-scenario props keys. Agent recommends scanning `hk_ai_city_props_*`.
   → Medium: only the current single citybuilder props key is used; if lab/station props
   return, fold into Champion File.
3. **[V] MEDIUM** `home/champion.glb`, `champion-city` taxi/clip GLBs (e.g. `idle_bunny.glb`)
   have no inline CC0 headers; taxi.glb/quests.glb need explicit CC0 verification.

### 2.2 Server / worker security (child-facing) — most important new finds

4. **[V] HIGH** `buddy-kit/server/filter.js` — phone regex `\b(\+?\d[\d\s-]{7,}\d)\b`
   needs ≥9 digits, so standard **8-digit HK numbers (9123 4567) are NOT blocked**.
   Fix: `\b(\+?\d[\d\s-]{6,}\d)\b` or enumerate. Also add HKID-format matcher
   `[A-Z]{1,2}\d{6}(\(\d\))?` — only the word "hkid" is currently caught.
5. **[A] HIGH** `buddy-kit/server/manifest-sanitize.js:149` — `buddyName` interpolated raw
   into system prompt; quote/newline injection bypasses simple `screen()` regex.
   Fix: alphanumerics-only allowlist.
6. **[V] MEDIUM** `buddy-kit/worker/index.mjs` `/api/save` — validates `state` is an object
   but no deep schema; malformed payloads can be stored. Add structural validation before
   `kv.put`. Also: no explicit KV TTL → saves never expire (open question).

### 2.3 Real correctness/robustness bugs

7. **[V] MEDIUM** `pedestrians.js:169,187,195` — `BufferGeometryUtils.mergeGeometries(...)`
   can return `null`; immediate `gr.geometry.computeBoundingBox()` crashes when it does.
   Add null guard.
8. **[V] MEDIUM** `city-planner/planner.js` (init, end of file) — `state.view.ox/oy` centring
   computed from `canvas.getBoundingClientRect()` BEFORE `resize()` is called later in init;
   if `resize()` changes canvas size/`px`, first-open centring can be off/NaN.
9. **[V] MEDIUM** `city-builder.js bootInner` — per agent: `loadNatureFiller()` fired async
   without `await` while `flushNatureFiller()` runs synchronously → race can leave parks
   empty of nature on slow networks. (Not line-verified but plausible; check.)
10. **[A] MEDIUM** `city-builder.js mountCapabilityUi` — `Number(el.value)` turns empty
    input into `0` instead of `NaN`, silently skewing AI inference when a child leaves a
    field blank.
11. **[V] MEDIUM** `home/champion.js:15,38` — uses raw `new GLTFLoader()` instead of
    `shared/gltf.js createGLTFLoader()`; works only if `champion.glb` is not Draco/Meshopt
    compressed. Route through central loader for consistency.

### 2.4 UX for 10-year-olds (design-quality gate)

12. **[V] MEDIUM** `prop-library.js:172` + `city-builder.js` — multiple fixed-position
    controls at hardcoded `top:64px; left:128px` etc., fragile on narrow/iPad split-view;
    `.resize-panel` uses `font:12px/1` + `padding:8px 14px` (illegible, ~28px touch target);
    `.mark-btn` 12px (pregame), `.soon-badge` 10px (home). Fix toward ≥44–48px targets,
    ≥14px type, safe-area-aware flex containers.
13. **[V] LOW** Emoji-as-structural-icon (`🧰` prop toggle, `🏠` scenario home btn) flagged
    as AI-slop; prefer SVGs where the icon is a control, not content.
14. **[A] LOW** `street-furniture.js:67,102` — multi-material props only read
    `material[0]` when rebuilding vertex colors; faces on other material indices lose color.

### 2.5 Architecture / maintainability

15. **[V] MEDIUM** `home/home.js` + `hong-kong-real/quests.js` — hardcoded absolute
    `.workers.dev` URLs (incl. external Workshop origin and a `supergoosymennyman` personal
    workers.dev for a minigame). Brittle across origins; centralize routes/config.
16. **[X] refuted** `drive.js:12` unused `GLTFLoader` import was flagged HIGH "violates
    golden rule" — the import is **never constructed**; it is only an unused import (LOW,
    remove it).
17. **[X] refuted** `city-planner` license-gate case sensitivity — `LICENSE_KEY =
    'CITYSMART-P5-2026'` is already uppercase and compared after `.toUpperCase()`, so it
    works. (Agent misread.)
18. **[A] LOW** `badges.js promote()` blocks all promotions without `evidence.heldOut` —
    but the function is dormant ("not called by any UI yet"), so severity LOW.

### 2.6 Buddy i18n / agent passivity

19. **[A] MEDIUM** `champion-city/labels.js:41` uses `el.innerHTML = zh` — use
    `textContent` for label injection (defence in depth; current inputs are trusted).
20. **[A] MEDIUM** `champion-city/sound.js:13` resumes AudioContext without user gesture;
    autoplay policies may block footstep/sound until first tap. Confirm there is a Start
    gesture.

---

## 3. Strengths reconfirmed this pass

- Buildless ES modules + importmap + vendored three r160; unified p5-city-sim origin so
  planner layout flows straight into 3D via localStorage.
- Procedural PBR city with strong tablet-performance discipline (InstancedMesh, baked
  vertex colors, `createGLTFLoader()` everywhere except home/champion.js + the unused
  drive.js import).
- Champion File + word-code KV cloud saves — genuine, working data-loss safety net
  (`city-builder.js:3227-3395`, `city-common/champion-file.js`, worker `/api/save|load`).
- Server PII filter + output-URL blocker + meter/brake budgeting are thoughtful for a
  child-facing app; kid-markdown tokenizer builds DOM safely.
- Hub "SOON" scenario buttons are properly disabled divs, not broken links.
- Pregame pedagogy (four rooms mirroring the real algorithms) remains excellent.

## 4. Open questions (hand to next model)

- Workshop→City "plant your machine" spine still unwired (only Stage 1) — reconfirmed as
  the programme's biggest integration gap.
- Buddy verb vocabulary still the old paradigm (no split/evaluate/diagnose dataflow).
- i18n: city-builder en/zh, planner + pregame English-only — D from the last handoff is
  still only partially done (bilingual font-fallback CSS present; strings not yet wired).
- Should placed props (`prop-library`) be serialized into the Champion File rather than
  device-local storage? (Agent flagged; current code keeps props device-local.)
- Are `taxi.glb`, quest `deco-taxis.glb`, and Mixamo clips explicitly CC0? Missing inline
  provenance headers.
- No KV TTL on cloud saves → codes never expire (by design? confirm with privacy stance).

## 5. Files touched this session (for review)

- `~/.gemini/settings.json` — pinned subagent models + `security.auth.selectedType`.
- `~/.gemini/agents/p5-auditor.md` — new read-only audit subagent.
- `~/.cli-proxy-api/config.yaml` — catiecli relay config (OpenAI-compat upstream; unused by
  the direct relay path but harmless). Proxy already running on 127.0.0.1:8317.
- `.tmp/gemini-audit/` — runner logs + per-slice raw outputs (slice01–08 + retries).
- No source files under `buddy-kit/client/` were modified this pass.
