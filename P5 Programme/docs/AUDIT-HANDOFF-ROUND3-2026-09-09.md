# P5 Programme — Audit Handoff Round 3 (2026-09-09, Gemini-agent pass)

Purpose: robustness + cross-cutting audit of the **3D AI City**, the **2D planner**
and its **planner unlocker** (City Planning Academy pregame), plus verticals the
Round-2 pass (2026-09-09) did not cover: **CC0 3D-model usage**, **design
commentary**, and **build/deploy-manifest integrity**.

Canonical source: `P5 Programme/buddy-kit/client/`. `deploy/` is build output.

---

## 1. Method & what ran

- Robustness slices **A1–A3** ran as `@p5-auditor` Gemini subagent passes
  (relay model `gcli-gemini-3.1-pro-preview`), read-only, one bulk shell read
  per pass, paced ≥115 s (round-2 runner reads the API key from
  `~/.cli-proxy-api/config.yaml` — the old `.tmp/gemini-audit/run_audit.sh`
  embedded it in plaintext; superseded).
- **B2 (design)** ran as a single-call pro prompt with an inline markup/CSS
  digest (subagent tool-calls kept 429ing; the relay cap was saturated by other
  load mid-sprint).
- **B1 (CC0) and B3 (manifest)** were executed deterministically by the
  orchestrator (license/manifest facts are best checked by tooling, and the
  relay was rate-limited at the time). Their prompts are saved for future
  re-runs.
- Calibration legend: **[V]** verified locally · **[A]** agent-claimed,
  plausible · **[X]** refuted.

Raw outputs: `.tmp/gemini-audit/round2/` (`A1-city.md`, `A2-planner.md`,
`A3-pregame.md`, `B2-design.md`, `glb-runtime-inventory.md`, `calibration.md`,
`run_one.sh`). No source files were modified during this pass.

---

## 2. Findings — 3D AI City (A1, targets this week's uncommitted changes)

1. **[V] MEDIUM** `city-builder.js:4048` — `safe('ai-nodes')` mounts nodes
   without disposing a previous instance. Reachable via the failed-boot retry
   path (`showBootError` → "Try again" → second `boot()`): the old
   `ai-nodes.js` RAF has **no `_bootGen` guard**, so it animates a detached
   scene forever. → `if (_aiNodes?.dispose) _aiNodes.dispose();` before remount
   (same pattern `refreshAiNodes` already uses).
2. **[V] MEDIUM** `city-builder.js` `wireRendererInteraction()` — multi-touch:
   a second finger's `pointerdown` resets `dragState.moved`, so releasing the
   first finger can fire `tapAt()` on the wrong spot (accidental quest/entry or
   node tap while orbiting). → Track `pointerId` on the primary pointer; ignore
   other pointers; handle `pointercancel`.
3. **[A] LOW** `ai-nodes.js` `tapMeshes()` includes the name-label `Sprite` —
   its transparent canvas quad intercepts taps around the label. Optional:
   exclude sprites (orb/ring/column are ample targets).
4. **[A] MEDIUM** `champion-real.js` `swapSkin` + `champion-city/taxi.js` —
   swapping skins mid-taxi-ride: the new model's materials are not in the
   taxi's captured fade list, so the passenger can appear fully opaque inside
   the cab. → re-capture/re-apply the fade after a swap while the taxi is
   active (an `api.onSkinChange` hook the taxi can subscribe to).

## 3. Findings — 2D Planner + zh-Hant i18n (A2)

1. **[V] MEDIUM** `planner.js:1930` vs the bottom init IIFE — `renderTemplates()`
   runs at module-eval **before** `initI18n()` runs (bottom IIFE), so template
   names render English on first paint even when the language is zh-Hant, and
   the `i18n:change` handler never refreshes them. → call `initI18n()` earlier
   (top-level, before the first render) and add `renderTemplates()` to the
   language-change listener.
2. **[X] refuted (agent HIGH)** "first-open canvas stuck at 300×150 /
   `resize()` never called" — the init IIFE does call `resize()`; journey e2e
   passes. (Agent misread.)
3. **[A] LOW** `planner.js` `templateGoodFor` maps raw English strings
   (`'the Busy Mayor'`) to zh keys — drift-prone. Prefer stable template ids.

## 4. Findings — Pregame / planner unlocker (A3)

1. **[V] MEDIUM** (agent said HIGH) `app.js` `graduate()` — touches
   `unlockBtn/downloadBtn/downloadHint` (module consts) with no null guards;
   only breaks if the shipped HTML is trimmed. → guard each.
2. **[V] MEDIUM** `app.js` Room-3 `animateRoute()` — `animCancel` is never set
   `true`, so mashing route buttons starts concurrent `requestAnimationFrame`
   loops (jittering ant + overlapping totals). → cancel prior frame/timeout per
   call.
3. **[V] MEDIUM** `app.js` `saveProgress()` — blind `localStorage` overwrite;
   two same-origin tabs completing different rooms can lose progress. → merge
   with existing stored state before writing.
4. **[A] LOW** `app.js` `btn-start` always jumps to Room 1 — returning students
   aren't resumed. Consider resuming the first incomplete room.
5. **[A] LOW** `parseTotal()` strips commas before parsing — a comma-decimal
   layout would mis-read `78,5` → `785`. HK uses dot decimals; nice-to-have
   normalization.

## 5. Findings — CC0 3D-model usage (B1, orchestrator-executed)

Good news first: the policy **holds** — manifest is 373 KEEP / 0 DELETE; the
CC-BY Poly-by-Google models (hospital/fire/stop-sign/fountain/slide…) are
removed from the shipped set and the CC-BY credits line in
`city-builder/assets/models/ATTRIBUTION.md` is explicitly marked history-only;
the six generic facilities on disk are the Kenney CC0 replacements.

1. **[V] MEDIUM** Manifest completeness — the six generic-facility GLBs
   referenced by `city-builder.js` `GLB_BUILDING_TYPES`
   (`hospital/school/shop/office/library/police.glb`) have **no rows** in
   `library/CC0-MANIFEST.md` (only `fire-station.glb` is listed; the others are
   documented only in the sidecar `ATTRIBUTION.md`). Same gap: champion
   animation clips (`champion-city/assets/clips/*`, e.g. `idle_bunny.glb`) and
   `home/champion.glb` have no manifest row (taxi.glb + champion-city trees do
   — marked custom).
2. **[V] MEDIUM** No automated license-provenance gate — `scripts/library-audit.mjs`
   checks presence/size/dupes/orphans only; it cannot catch a future CC-BY/NC
   slip. → add a provenance gate that reads the manifest + ATTRIBUTION sidecars
   (or require a provenance field per shipped GLB).
3. **[V] LOW** True orphans flagged at deploy: `library/props/kaykit-base.glb`
   and `library/props/poly-market-stand.glb` are referenced nowhere in
   `library.js`/code → delete or wire them in.
4. **[A] LOW** Inline provenance headers are absent from GLB binaries
   (provenance lives in sidecar docs). Decide whether to adopt a compact header
   convention; at minimum close items 1–2 above.

## 6. Findings — Design commentary (B2, Gemini single-call pro)

- **Planner topbar density**: 12+ controls + new 中/EN toggle will crowd at
  640–768 px. Proposal: keep high-frequency actions (Undo / View my city /
  Language) top, collapse Clear/Import/Save/Templates into a More menu or a
  bottom dock for the tools. **Needs a real 640/768 px visual check.**
- **Icon row (top-left)**: solid 48 px chips + the bright SVG colour fix read
  well; `#btn-hub` warm tint successfully distinguishes "exit to hub".
- **Colour/affordance**: cyan/jade on dark is strong; pregame disabled buttons
  already recede (`opacity .45/.4`); planner + pregame have `:focus-visible`
  rules (planner styles.css:853) — verify rings visually on tablet keyboard.
- **zh-Hant type**: Nunito + PingFang HK with 1.5 line-height is right; keep
  the 8 px spacing rhythm on paragraph margins so translated lock/graduation
  copy doesn't collapse.
- **Entry/lock/graduation flow**: lock screen's dual path (upload vs paste) is
  excellent defensive design for classrooms.
- "Needs a real visual check": topbar wrapping at 640/768; 2 px SVG stroke on
  low-tier tablets; pregame disabled look before room 4; focus rings; zh-Hant
  rendering of the translated graduation/lock paragraphs on-device.

## 7. Findings — Build/deploy manifest integrity (B3, orchestrator-executed)

1. **[V] FIXED (this session)** The `planner/i18n.js` class of bug: the file is
   now on the deploy copy-list (deploy `--city-sim` includes it; live 200).
   A resolver over planner/pregame/home entry graphs finds **no other
   referenced-but-unshiped file** today.
2. **[V] LOW** No automated import-graph-vs-bundle check exists in CI/npm — the
   earlier 404 would have been caught instantly. → add a tiny resolver script
   (mind the app-dir flatten: `city-planner/` → `/planner/`).
3. **[V] LOW** `city-builder/styles.css` is a duplicated mirror of the live
   `champion-city/styles.css` (the app links the champion-city one) — keep them
   in sync or declare one canonical to avoid drift.
4. **[V] OPEN (from Round 2 #15)** Hardcoded absolute `.workers.dev` URLs still
   litter `home.js`, `quests.js`, `shared/scenario.js`, `city-builder.js`
   (incl. one external minigame origin) — centralize routes/config when next
   touching those files.

## 8. Buddy-server current state (read-only re-verify of Round-2 findings)

> Deliberately dropped: the Round-2 `server/filter.js` HK-phone/HKID matcher
> recommendation is **not wanted** (owner decision — no HK phone/HKID filter
> will be added). `filter.js` is left as-is.

1. **[V] PARTIAL MEDIUM** `buddy-kit/server/manifest-sanitize.js` — a
   `sanitizeBuddyName(name, screen, maxLen, fallback)` now screens + length-caps
   the name before `composeInjection`. Residual: still not an
   alphanumerics-only allowlist.
2. **[V] OPEN MEDIUM** `buddy-kit/worker/index.mjs` `/api/save` — validates
   `body.state` shape only (no deep schema); KV saves have no TTL/expiry.
   Confirm expiry is intentional (privacy stance) or add TTL.

## 8.5 Data-safety-net key inventory (local)

18 `localStorage` keys are written across the apps. Champion File `CF_KEYS`
covers 13 of them (layout, quests, city props, skin, accessories, unlocked
skins, lang, planner-unlock, coach-seen, pregame progress, badges, planted
capabilities, city name). Genuinely device-local / low-risk by design:

- `p5_city_cap_lastdec_v1` (last "Try it" verdict — cosmetic node colour; could
  travel with `caps` for free if desired),
- `p5_city_saved_at_v1` (resume timestamp), `p5_cloud_code_v1` (remembered
  cloud code), `p5_champion_custom_skin` (custom GLB never ships in the file —
  presets fall back on a new device),
- `hk_ai_city_props_v1` — appears **dead/legacy** (per-scenario props key from
  the removed interiors; nothing writes it today) → prune.

## 9. Strengths reconfirmed

- No data-loss regression in the surfaces: quota-full save falls back to a file
  download and blocks the redirect; sanitize-on-load handles corrupt saves;
  unlock/license handoff between pregame and planner is consistent.
- CC0 policy is genuinely enforced at the source level (Round-2's CC-BY
  concern resolved — those models are removed and the docs say so).
- Pregame completion logic tolerates corrupt/array/partial progress without
  falsely unlocking; restart correctly keeps the planner unlocked.
- New i18n layer is largely resilient: `L()` resolves unknown vars to `''`,
  missing keys fall back to English, and EN output is byte-for-byte stable
  (284/284 en↔zh keys symmetric; full e2e 12/12 green).

## 10. Open questions

1. Is the KV cloud-save no-expiry intentional (no TTL) per the privacy stance?
2. Mid-room progress (e.g., 3 of 6 tiles in a room) resets on refresh — should
   challenge state persist for unstable-tablet classrooms?
3. Inline provenance headers in GLB binaries — worth adopting, or is the
   sidecar-ATTRIBUTION + manifest convention sufficient once rows are filled?

## 11. Recommended fix shortlist (priority order)

- **P0 (robustness, all cheap):** planner template-language fix (init order +
  `i18n:change`); ai-nodes dispose-before-remount; pregame `graduate()` guards,
  `animateRoute` cancel, `saveProgress` merge; taxi skin-swap fade re-capture.
- **P1 (CC0 traceability):** manifest rows for the 6 generic facilities + clips
  + home champion; provenance gate in `library-audit.mjs`; prune orphan GLBs.
- **P2 (polish/tooling):** pointerId multi-touch handling; topbar density after
  visual QA; import-graph-vs-bundle checker script; centralize workers.dev
  URLs; optional sprite-exclusion, comma-decimal parse, resume-room.

---

## ROUND-3 FIX LOG (2026-09-10)

Implemented in `buddy-kit/client/` (canonical) + `P5 Programme/scripts/` +
`deploy/scripts/deploy-city-apps.sh` copy lists. `deploy/` untouched except via
the deploy build. No models removed; no `server/filter.js` change (HK-phone/HKID
filter deliberately dropped per owner).

### P0 — robustness (implemented)
1. ✅ Planner template-language bug — `city-planner/planner.js`: `initI18n()`
   hoisted to module top-level (before the first `renderTemplates()`); the
   bottom init IIFE no longer repeats it; `renderTemplates()` added to the
   `i18n:change` listener so 中/EN re-renders template names. Verified by zh-Hant
   smoke: first paint renders `城市方格`, toggle → `City Grid`. EN path unchanged.
2. ✅ ai-nodes boot-retry leak — `city-builder/city-builder.js`: the
   `safe('ai-nodes')` mount now disposes a previous `_aiNodes` before remount
   (mirrors `refreshAiNodes`), so a "Try again" second boot cancels the stale RAF.
3. ✅ Pregame `graduate()` guards — `city-pregame/app.js`: `unlockBtn` /
   `downloadBtn` / `downloadHint` each guarded with `if (x)`; the module-level
   `downloadBtn` listener is guarded too.
4. ✅ Pregame `animateRoute()` — replaced the never-set `animCancel` flag with a
   per-call generation token + stored `animTimeout`; mashing route buttons now
   cancels the prior rAF loop and final-total timeout.
5. ✅ Pregame `saveProgress()` — merges with the stored JSON (`{...prev,
   ...state.completed}`) instead of blind overwrite.
6. ✅ Taxi skin-swap fade — `hong-kong-real/champion-real.js`: `swapSkin` fires
   `skinListeners` on success (new `addSkinListener`/`removeSkinListener` on the
   api). `champion-city/taxi.js`: subscribes once per champion in `board()`;
   the handler re-captures the boarding-fade material list after a mid-ride swap
   and re-applies the current dissolve level.

### P1 — CC0 traceability (implemented)
1/2. ✅ Manifest rows added (`library/CC0-MANIFEST.md`, "Round-3 provenance
   gap-fill"): the six generic facilities (`city-builder/assets/models/
   {hospital,school,shop,office,library,police}.glb`), the 19 champion clips
   (`champion-city/assets/clips/*.glb`), `home/champion.glb` (byte-copy of
   `clips/idle.glb`), plus rows for the two deliberately-kept orphans.
3. ✅ Provenance gate — `scripts/library-audit.mjs` now FAILS when a shipped GLB
   (roots: `library/`, `city-builder/assets/models/`, `champion-city/assets/`,
   `home/`) has no manifest exact/brace token and no line in the generated
   snapshot `scripts/cc0-provenance.list` (1529 entries, bootstrap). Regenerate
   with `--write-provenance`; post-bootstrap it only keeps manifest-documented +
   already-listed files, so a blind regenerate can't bless a new undocumented
   asset. `npm run test:library` → PASS (0 noProvenance).
4. ✅ Orphans — per owner no-removal note, `kaykit-base.glb` + `poly-market-
   stand.glb` are KEPT on disk and now have provenance rows. They stay
   uncatalogued (no thumbnails → not picker-available), listed as deliberate
   orphans (< 25 tolerance).

### P2 — polish/tooling
1. ✅ pointerId multi-touch — `city-builder/city-builder.js`
   `wireRendererInteraction()`: primary-pointer tracking; extra pointers ignored
   on down/move/up; `pointercancel` resets so a resting second finger can't fire
   `tapAt()`.
2. ✅ Import-graph-vs-bundle checker — new `scripts/check-imports.mjs`, wired as
   `npm run test:imports` (and into `test:all`), and run by
   `deploy-city-apps.sh` post-build for `--city-sim`/`--home`. Handles the
   flatten (`city-planner/→/planner/`, `city-pregame/→/pregame/`); would have
   caught the `planner/i18n.js` 404. Current build: 56 files, all resolve.
3. ✅ URL centralization — canonical `client/shared/links.js` (HOME_URL /
   CITY_SIM_URL / WORKSHOP_URL / FIT_STUDIO_URL / citySim()) used by
   `city-builder.js` (btn-hub + workshop override) and `shared/scenario.js`
   (back-to-home); mirrored `home/links.js` for the hub worker (added to
   `build_home` copy list). Quest minigame URLs stay inline as per-quest data
   (each origin appears once) — noted in `quests.js`. All live origins verified
   byte-identical.
4. ✅ Optional polish — ai-nodes `tapMeshes()` excludes the name-label Sprite;
   pregame `parseTotal()` accepts comma decimals ("78,5") without misreading
   thousands; pregame `btn-start` resumes the first incomplete room.
5. ⏸️ Planner topbar density — **not changed**: needs a real 640/768 px visual
   check on device (do not guess visual outcomes). Open item: group
   Clear/Import/Save/Templates into a More menu or bottom dock after on-device QA.

### Also
- ✅ Dead localStorage key default pruned: `city-builder/prop-library.js` default
  `storageKey` now `hk_ai_city_props_citybuilder_v1` (legacy
  `hk_ai_city_props_v1` was only a dead default; grep-confirmed nothing reads it).
- ✅ This document §11 updated to reflect reality (this log).
