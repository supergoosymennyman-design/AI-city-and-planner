# PROGRESS — AI-Education Platform

Living status of the build vs the approved plan ([PLAN.md](PLAN.md)). **Update this in every PR** that completes or starts a tracked item. Legend: ✓ done · ◐ in progress / partial · ☐ pending.

> Snapshot date: 2026-06-09 · `main` **pushed to GitHub** (private) · working branch `main` · Latest: camera teach→test loop proven (`@edu/toolbox`) + cross-tool agent sync made opencode-native

## Where things live
- **Plan (source of truth):** [docs/PLAN.md](PLAN.md) (in-repo copy; original was authored in `~/.claude/plans/`).
- **Rules/DoD:** [AGENTS.md](../AGENTS.md) · [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md)
- **Done = git history; pending = this file.**

## Recently done (2026-06-09)
- ✓ **On-device ML actually works now — both paths verified on a real webcam.** The toolbox ML was
  "green tests, broken in reality": a `import(/* @vite-ignore */ variableSpecifier)` meant Vite never
  resolved tfjs/MediaPipe, so **the libraries never loaded in the browser** — the camera demo only ever
  "worked" because the old KNN used pixel features (no lib). Fixed + upgraded both paths:
  - **Recognition (teachable image):** replaced the coarse 28×28 pixel-downsample features (useless on a
    real camera — lighting/background dominated) with **MobileNet embeddings + `@tensorflow-models/knn-classifier`**
    (the real Teachable Machine method; context7 `/tensorflow/tfjs-models`). New deps `mobilenet@2.1.1`
    + `knn-classifier@1.2.6`. **User-confirmed working on a real webcam.**
  - **Joints (hand/pose):** migrated off the **deprecated `@mediapipe/holistic`** to the maintained
    **`@mediapipe/tasks-vision`** (`HandLandmarker` + synchronous `detectForVideo`; PLAN §5). `sendOnce`
    keeps the old result shape so `resultsToLandmarks` is unchanged; gesture helpers carried over.
    **User-confirmed hand tracking working on a real webcam.**
  - **Root-cause fix (debuggability):** the broken import + a fully-swallowed `mgr.onError` made a total
    library-load failure show as a cheerful "unknown, 0%". Switched all ML loads to **literal
    `import('pkg')`** specifiers (Vite-resolvable + code-split) and wired engine errors to
    `debug('toolbox:recognition'|'toolbox:joints')`. Caught only because a live browser run contradicted
    green unit tests — fakes prove wiring, not that libs load.
  - **Tests** rewritten to inject fakes (jsdom has no tfjs/WebGL): `recognition.test.ts` (7) + `ai.test.ts`
    detectPose/KNN cases. **`npm run validate` green (60 tests).** New DEV harnesses
    `apps/host-standalone/src/Dev{Camera,Pose}Sim.tsx` (`?camera` / `?pose`) for real-webcam testing.
  - ✓ **Self-hosted for offline (rule #4) — no CDN at runtime.** `scripts/vendor-ml-assets.mjs`
    rewritten to vendor into `apps/host-standalone/public/ml/` (git-ignored): MobileNet v2 model.json+shards
    (TF Hub, redirect-followed), the tasks-vision wasm (copied from node_modules), and `hand_landmarker.task`.
    `createContext` points the toolbox at `/ml/**` via `mobilenetUrl`/`mpWasmBase`/`handModelUrl`; coco-ssd
    is now **opt-in** behind a self-hosted `cocoModelUrl` (its default load hits a CDN, and the teach path
    never needs it). `npm run vendor-ml` + host `pre(dev|build)` hook (idempotent). **Verified offline:**
    teach→classify works with assets served from `localhost/ml/` (200) and **zero CDN requests**
    (`window.fetch` interceptor recorded none); coco gated off so a correct classify *proves* the local
    MobileNet loaded. validate green (60 tests).


- ✓ **"Click-and-play" static build wired (build → open a URL).** Q: can the React+TS games run like
  a double-clicked HTML file? A (confirmed via context7 `/vitejs/vite`): **not from `file://`** —
  browsers block ES-module `<script>`s over `file://` (CORS), so a naked double-click of the built
  `index.html` is blank. The supported path is **serve the static build over http(s)**:
  - `apps/host-standalone/vite.config.ts` now sets **`base: './'`** → relative asset URLs, so the
    built `dist/` is portable (domain root, sub-path, or `vite preview` all work).
  - Root scripts made real: **`build`** now actually builds the app (`tsc --build` + `vite build`,
    was typecheck-only), plus **`preview`** and a one-shot **`play`** (`build && preview`).
  - Verified: `npm run build` → 186 kB JS / 59 kB gzip (tfjs/coco are dynamic-imported only by
    camera/pose games, so the voice+draw game stays light); `npm run preview` → **the production
    build is fully playable at `http://localhost:4173/`** (intro → teach phase, **0 console errors**,
    Playwright-driven). `dist/` is gitignored.
  - Caveat recorded: camera/ML games need http(s) even when bundled (they `fetch()` tfjs/MediaPipe
    WASM, blocked on `file://`; getUserMedia needs a secure context). True offline "click-and-play"
    = the planned `vite-plugin-pwa` install-once cache (PLAN §1), not a loose file.
  - ⚠ **Stray:** `demos/teach-the-robot/index.html` — a zero-dependency vanilla teachable-machine
    game built during a misread (it IS double-click-playable, as the file:// contrast); keep-or-remove TBD.
- ✓ **Cross-tool agent sync made opencode-native (Claude ↔ opencode parity, one canonical source).**
  The 11 subagents are authored once in `.ai/agents/*.md`; `scripts/sync-agents.mjs` now **translates**
  the frontmatter per tool instead of copying it verbatim, so each toolchain gets idiomatic agents
  without anyone hand-editing a generated dir:
  - **`.claude/agents/*`** keep Claude-native frontmatter (`name`, `description`, `tools`,
    `model: inherit`).
  - **`.opencode/agent/*`** now emit **opencode-native** frontmatter — drop `name` (opencode derives
    it from the filename) and the Claude-only `model: inherit`, add `mode: subagent`, and translate
    the `tools:` line into a `permission:` block (`edit`/`bash`/`webfetch` → `allow`/`deny`). All 11
    opencode agents + the generator regenerated.
  - **Skills stay single-source — `.claude/skills/` only, deliberately NOT `.opencode/`.** Updated the
    sync rationale: opencode now supports skills and reads `.claude/skills/<name>/SKILL.md` directly via
    its Claude-compat layer (identical `name`+`description` format), so a second `.opencode/skills/`
    copy would **double-register** every skill (opencode discovers from *both* dirs). Contrast agents —
    opencode does **not** read `.claude/agents`, which is exactly why those need a translated copy.
  - Enforced by the existing **`npm run sync:check`** drift gate (runs first in `validate`), so a stale
    or hand-edited tool dir fails typecheck/CI/pre-push.

## Recently done (2026-06-08)
- ✓ **Camera toolbox proven working (teach→test loop tested).** The `@edu/toolbox`
  `RecognitionManager` (teachable-image: pixel-feature **KNN** + coco-ssd object-detection fallback)
  was wired into `createAIServices` but its KNN branch — *the* kindergarten "teach AI → test AI"
  camera mechanic — had **zero tests** (only the coco-ssd branch was covered). Now:
  - **`@edu/testing` jsdom canvas stub upgraded** (backward-compatible): `drawImage(frame)` carries a
    `frame.__tint` (0–255 grey) into `getImageData`, so distinct synthetic frames yield
    class-distinct pixel features in jsdom (which renders `<canvas>` as `<div>` without the native
    `canvas` package — confirmed via context7 `/jsdom/jsdom`). Untinted frames still return all-zeros,
    so the PaintableShape "painted=0" coverage tests are unaffected.
  - **New `recognition.test.ts` (7) + 1 adapter test in `ai.test.ts`:** teach two classes → later
    frames classify to the taught label; **a trained class beats a confident coco-ssd prediction**
    (dog@0.95 → "sun"), proving teach-overrides-pretrained; empty-store/null-frame → `{unknown,0}`;
    `getKnownClasses`/`getState`/`destroy` (disposes WebGL tensors, clears callbacks).
  - **`npm run validate` green** (EXIT=0): sync:check + typecheck + contracts + **59 tests** (toolbox 17→25).
  - **Proven in a REAL browser, not just jsdom:** new DEV-only harness
    `apps/host-standalone/src/DevCameraSim.tsx` (mount with `npm run dev --workspace @edu/host-standalone`
    → `http://localhost:5173/?camera`) drives the live `ctx.ai` teach→test loop on a webcam. Driven
    headless via Playwright + a canvas-backed fake `getUserMedia`: taught red→**Thing A (100%)**,
    blue→**Thing B (100%)**, 0 console errors — the genuine pipeline
    (`getUserMedia → video → drawImage → getImageData → KNN`) discriminates classes.
  - **Perf fix surfaced by the live run:** `recognition.js` scratch + camera canvases now use
    `getContext('2d', { willReadFrequently: true })` (per-frame getImageData readbacks; killed the
    Canvas2D GPU-readback warning).
  - ☐ **Follow-ups (flagged, not done):** MobileNet-embedding upgrade (replace the coarse pixel
    downsample — the code's own fidelity note) and the mechanical `recognition.js`→`.ts` conversion.

## Recently done (2026-06-07)
- ✓ **Removed the shared `@edu/ui` package — "no boundary but the vibe".** Per design call: there
  is **no shared UI component/token library**; each game **owns its UI** (its own `:root` tokens,
  its own Button, its own Bo), and the *only* boundary is the **vibe** (`docs/standards/*-ui-ux.md`
  + the render previews). Deleted `packages/ui`; `k2-03-color-the-rainbow` now self-contains the
  Sticker Lab tokens + a local Button + Bo. Host/tsconfig/workspace de-referenced `@edu/ui`; the
  standards + `game-builder`/`game-implementer`/`kid-ux-reviewer` + `blueprint` recast from
  "compose @edu/ui" → "build your own UI, match the vibe". (README @edu/ui mentions left for the
  parallel session that currently owns its edit.)
- ✓ **Blueprint pipeline governance hardened (sanity-check follow-up).** Audited the blueprint-first
  pipeline for mass-production readiness and fixed the drift defects found:
  - **Generated-dir drift gate (root cause).** `.ai/**` is the canonical source of agents+skills;
    `.claude`/`.opencode` are generated by `scripts/sync-agents.mjs`, but staleness was caught
    **nowhere**. Added a `--check` mode (`npm run sync:check`) wired **first** into `validate`, so a
    hand-edit of a generated dir, a stray file, or a forgotten `npm run sync` now fails
    typecheck/CI/pre-push. Proven live: injected drift → exit 1 with exact paths; `npm run sync` restores.
  - **Blueprint skill:** demoted the pre-standard `kindergarten-k2-03-color-the-rainbow.md` spike from
    "worked reference example" (it predates the two-stage template and would fail the self-check) to an
    explicit *do-not-copy* note; added a frontmatter↔`lessons.json` self-check item (`ageBand` = the
    single band in caps, never a range like `K2-K3`).
  - **Templates + contract:** `ageBand` example corrected from the range form (`K2-K3` / `P5-P6`) to a
    single band in caps in both blueprint templates, `packages/contract/src/manifest.ts` (comment-only,
    no schema change), and `PLAN.md`.
  - **/build-game:** added **Phase 3b — Adversarial break-tests** dispatching **game-breaker** +
    **ux-breaker** (both tracks; golden rule #12 — previously *not* in the pipeline); their RED
    regression tests feed the bounded fix loop, and ux `[DESIGN DECISION]`s are routed to Gate 2.
  - **Eval:** primary eval #3 made band-aware (`primary-<band>-<NN>-<slug>`) and marked `pending` —
    the primary lesson cut/bands and `source/primary/**` are still TBD, so Gate 0 would block it.
  - **Still open:** the pipeline is proven on **zero** real lessons end-to-end (item #6); and the
    standards-doc rename (`kid-ui-ux.md` → `ui-ux-common.md` + per-track docs) now referenced by the
    skill self-check is not yet reconciled on disk.
- ◐ **UI/UX direction (visual design) — two distinct tracks, previews built.** Used the
  frontend-design plugin to land bold, non-generic looks (after rejecting safe/generic first tries):
  - **Kindergarten = "Sticker Lab + Bo"** ✅ *approved/locked direction* — bright, warm, cartoonish,
    no-mascot-anxiety **screen-robot "Bo"** whose screen shows a fixed set of **6 SVG emoji faces**
    (Hello/Hmm?/Listening/Learning!/Knows-it!/Oops) + a character-free **"AI knows" shelf**; the
    teach→recognise→celebrate skeleton. Render: `docs/standards/kindergarten-ui-ux.preview.html`.
  - **Primary = "The Architect's Table"** ◐ *direction proposed, not yet final* — premium
    strategy-game look (isometric living city, **electric-lime-on-deep-teal**, Bricolage Grotesque
    type, glowing command screens). Reframed from a single city dashboard into a **2D-sim component
    kit** (grid stage · drag-drop · path-draw · charts · sliders · train-the-model · run-sim ·
    AI-advisor) after reading the programme doc (~20 *different* AI mini-games, P1→P6, City finale
    L18–20). Render: `docs/standards/primary-ui-ux.preview.html`.
  - ☐ **Pending:** SME sign-off on the primary look → lift `primary-ui-ux.md` out of **DRAFT**;
    then `tokens.css` → two themes (KG + primary) and build the track-aware `edu-frontend` skill.
    Previews load fonts from a CDN (preview-only); production self-hosts.
- ✓ **Curriculum taxonomy + naming locked to `(band, lesson)`** (pipeline item 1d). The course
  designer's master index (`source/kindergarten/English AI Discovery.pdf`) defines **two 20-lesson
  curricula — K2 and K3** (each split Phase 1 = 1–10, Phase 2 = 11–20), and lesson numbers **reset
  per band** (K2 #3 *Color the Rainbow* ≠ K3 #3 *AI Architect*; some titles repeat, e.g.
  *Play-Doh Fruits* = K2 #12 & K3 #12). The flat file structure didn't encode the band, so:
  - New **`docs/curriculum/lessons.json`** registry (single source of truth: all 40 lessons, slug,
    phase derived, tool tokens, status; PDF-vs-docx title conflicts resolved with `altTitle` for
    #6 *Animals Stamp & Test* and #10 *Let's Throw AI a Birthday Party!*) + **`docs/curriculum/README.md`**
    (the taxonomy + the **`{band}-{NN}-{slug}`** naming rule, one rule for both tracks).
  - **Renamed to band-prefixed flat slugs:** game `games/kindergarten/k2-03-color-the-rainbow/`
    (id `k2-03-color-the-rainbow`, `ageBand:'K2'` — was the wrong `'K2-K3'`; pkg
    `@edu/game-k2-03-color-the-rainbow`); source fixtures `k2-01-…`/`k2-13-…`; blueprint
    `kindergarten-k2-03-color-the-rainbow.md`. Host wiring (tsconfig ref, host dep, `main.tsx`
    imports) updated; `npm install` + **`validate` green (45 tests)**.
  - **Pipeline templates made band-aware:** `blueprint` + `/build-game` skills, blueprint assets,
    evals, and the agents (`blueprint-author`, `contract-reviewer`, `game-architect`,
    `game-builder`, `game-implementer`, `pedagogy-reviewer`) now use
    `source/<track>/<band>-<NN>-<slug>/` and `docs/curriculum/<track>-<band>-NN-<slug>.md`;
    `/build-game` gains a **band** arg (`/build-game kindergarten k2 3`). Synced to `.claude`/`.opencode`.
  - **Enforced by CI, not habit:** `validate-contracts.mjs` now also runs a **curriculum check** —
    every game folder, `source/<track>/*` intake dir, and `docs/curriculum/*.md` blueprint must
    follow `{band}-{NN}-{slug}` **and** resolve to a `lessons.json` entry (with `ageBand`/`lesson`
    matching). Tracks with no registry yet (primary) are skipped, so it auto-activates when primary
    lessons land. Negative-tested (malformed + unregistered slugs fail with specific messages).
  - **K2 source intake extracted (19/20 Gate-0-ready):** split the docx into
    `source/kindergarten/k2-NN-<slug>/lesson.md` for every K2 lesson except #10 (registry
    `sourceReady` flags updated). So `/build-game kindergarten k2 N` now has a real source for
    N ∈ {1–9, 11–20}.
  - ⚠ **Two content decisions still owned by the course designer:** (a) **K2 #10 conflict** —
    the PDF index says *"Let's Throw AI a Birthday Party!"* (generative finale) but the docx
    script for slot 10 is *"Simon Says, AI Says"* (a movement game); these are different lessons,
    so #10 is **not** extracted and `sourceReady:false` until it's resolved. (b) **K3 has no
    teacher scripts** — only PDF one-liners — so no K3 game can pass Gate 0 until the designer
    authors them.

- ✓ **First push to GitHub** — `main` is live (private) at `github.com/EdwardYCLui/AI-education` with full history. The **pre-push hook enforced the gate** (`validate` + 28 tests) before allowing the push, so CI discipline is proven; CI now runs on PRs. README refreshed as the team front door. ☐ GitHub-side UI remaining: **invite collaborators** (private repo — blocks clone), set About/topics, **branch protection** on `main`, **install CodeRabbit**.
- ✓ **Test infra (R1) wired** — Vitest + RTL + jsdom; `npm test` chained into `validate`. New **`@edu/testing`** package: fake `ctx`/`AIServices`, a simulated `SpeechRecognition` (drives the real `listenOnce`), and a jsdom Canvas/`Path2D` stub. **28 tests** on Color the Rainbow.
- ✓ **Color the Rainbow hardened** (voice + UX + resilience):
  - Fixed a quiz **freeze** — round-advance was gated on `speechSynthesis.onend` (Chrome drops it after `cancel()`); now a TTS-independent timer + a `speak()` failsafe resolve.
  - **Crash-proof `ctx` I/O** — every `ctx.audio`/`ctx.ai` call try-caught; a rejecting `listenOnce` no longer dead-ends the mic. Promoted to **AGENTS.md golden rule #12** + a DoD checkpoint.
  - **Voice model:** continuous listening in teaching (auto-on after "Teach AI!"), push-to-talk in the quiz; dev voice-sim panel in the host (`npm run dev` → 5173).
  - **UX honesty:** unsupported colour (e.g. "green") gets an honest spoken reaction (not "I didn't catch that"); intro **scopes the promise** to the 3 colours; **tiered result** (0/5 teaches the mistraining lesson, never flat "Great job!").
- ✓ **Adversarial breaker agents** — **`game-breaker`** (crashes/freezes/leaks/dead-ends) + **`ux-breaker`** (OFF-RAIL play: silent no-ops, dead air, misleading feedback, premise-vs-implementation mismatches). Both dogfooded on the game → found + fixed 5 crash-family breaks and 2 headline UX gaps; kept as regression tests. Distinct from `kid-ux-reviewer` (static a11y).
- ✓ **Subagent roster + `/build-game` orchestrator built** (pipeline steps 1b–1c). New agents (`.ai/agents`, synced to `.claude`+`.opencode`): `blueprint-author`, `game-builder` (KG), `game-architect`+`game-implementer` (primary), `pedagogy-reviewer`, `verifier`. **Retired `game-scaffolder`** (no more template-cloning). Refined `contract-reviewer` to trace pedagogy fields to the approved blueprint. New orchestrator skill `.ai/skills/build-game` — one entry point: Gate 0 → blueprint → ★Gate 1 → build (track-aware) → parallel review → verify → bounded fix loop → ★Gate 2 (SME/playtest), with optional `--checkpoint` pauses.
- ✓ **Pipeline hygiene:** `source/<track>/` lowercased (`kindergarten`/`primary`) for Linux-CI-safe Gate-0 paths; `sync-agents.mjs` now also mirrors `.ai/skills/<name>/` → `.claude/skills/` (skips eval workspaces); added `npm run sync`.
- ✓ **`blueprint` skill built + benchmarked** (`.ai/skills/blueprint`, mirrored to `.claude/skills`): two-stage (faithful extract → build enrichment), KG + primary templates, valid-contract-values reference, Gate-0 precondition, self-check gate. Benchmarked on **Haiku** (with-skill vs no-skill ×3): with-skill more faithful, caught the `no-Math.random` determinism rule baselines missed, ~27% faster / ~10% fewer tokens. (Pipeline step 1a.)
- ✓ **UI/UX standard consolidated, then split per track.** Was scattered (PLAN §6b + tokens.css + reviewer prompt) → consolidated → now **three docs**: `docs/standards/ui-ux-common.md` (shared a11y/design contract law, both tracks) + `kindergarten-ui-ux.md` (**"Sticker Lab + Bo"** — bright cartoon, screen-robot with 6 emoji faces, teach→recognise→celebrate) + `primary-ui-ux.md` (**"Command Deck"** — cool/data-rich, AI-advisor console; **DRAFT**, to be reframed from a city dashboard into a 2D-sim component kit per the programme doc). `kid-ux-reviewer` enforces common+track; `blueprint`/`game-builder`/`game-architect`/`game-implementer` reference the right docs. Render previews: `kindergarten-ui-ux.preview.html`, `primary-ui-ux.preview.html`. ☐ tokens.css → two themes + `edu-frontend` skill still pending.
- ✓ **Blueprint-first pipeline — design approved** ([spec](superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md)). Inverts the build flow from *clone-a-template* to *designer-source → skill-enriched blueprint (human-approved) → bespoke build from `@edu/*` blocks → autonomous review/fix → human SME sign-off*. Defines a shared **`blueprint` skill** (KG + primary, weak-model-followable), a **`/build-game`** orchestrator (2 human gates + optional `--checkpoint`, bounded fix loop), and a redesigned subagent roster (new: `blueprint-author`, `game-builder`, `game-architect`, `game-implementer`, `pedagogy-reviewer`, `verifier`; refined: `contract-reviewer`, `kid-ux-reviewer`, `core-guardian`; **retired: `game-scaffolder`**). Per-game source intake at `source/<track>/<NN-slug>/` (Gate 0). Supersedes [PLAN.md §7](PLAN.md). Implementation next.

## Recently done (2026-06-06)
- ✓ **First game — Color the Rainbow** (KG Lesson 3, `games/kindergarten/color-the-rainbow`): draw-to-fill teachable-machine colour game on the **crayon `@edu/ui` standard**; honest learning (AI learns the label as given — no correction); voice STT + tap/keyboard fallback; passes `validate`.
- ✓ **`@edu/ui` started** (crayon tokens + `Button`) · **`apps/host-standalone` skeleton** (Vite host + concrete `GameContext`: TTS/STT/audio/storage/teacher) · **`@edu/contract`** gained additive `reducedMotion`.
- ✓ **Reviewer subagents** (`kid-ux-reviewer`, `contract-reviewer`, `core-guardian`, `game-scaffolder`) + `scripts/sync-agents.mjs` → `.claude/agents` + `.opencode/agent`. Dogfooded on the game: captured + fixed ~15 issues (hi-DPI draw bug, crash-proofing/error boundary, honest feedback, a11y).
- ✓ Curriculum spec: `docs/curriculum/kindergarten-03-color-the-rainbow.md` (Lesson 3 extracted).
- ◐ This game (updated 2026-06-07): tests now cover voice + adversarial + UX (28 green); ☐ FSM-unit + render-smoke still nice-to-have for full DoD. `/new-game`+`/review-game` superseded by `/build-game` + the `blueprint` skill + `docs/standards/{ui-ux-common,kindergarten-ui-ux,primary-ui-ux}.md` (the `edu-frontend` skill is being built on top of these, not superseded). Stray `docs/repo-overview.{html,pdf}` still untracked — decide keep/remove.

---

## Foundation (Plan §10)

### Day 0 — Prerequisites
- ✓ `git init` + **first push** — `main` live (private) on `origin` → EdwardYCLui/AI-education (2026-06-07)
- ◐ Monorepo scaffold — ✓ workspaces/`package.json`/`tsconfig.base`(allowJs)/`.nvmrc`/`.gitignore`/`.gitattributes`; ☐ Vite shared config, ☐ ESLint config
- ☐ **Curriculum extraction** → `docs/curriculum/<lesson>.md` + `Lesson` enum (BLOCKS lesson cut / capability set) — R-blocker
- ◐ Day-0/1 decisions: ✓ package scope `@edu/*`; ☐ deployment topology, ☐ https vs http, ☐ tfjs 4.x confirm, ☐ minimum device spec (all *recommended* in plan, not finalized)

### Days 1–2 — Lock the spine (split freeze)
- ✓ `@edu/contract` — all outer surfaces + inner sim types as real TS (verified `tsc --build` green)
- ✓ Split-freeze structure (outer frozen; inner sim schema additive-only)
- ✓ First-pass `Capability` set
- ✓ `AGENTS.md` / `CLAUDE.md` + code-style standard
- ✓ `@edu/debug` (debug/assert/invariant) — supports debuggability-first style
- ◐ `validate-contracts` gate — ✓ manifest + a11y two-channel + `dependsOn` DAG; ☐ per-namespace `ext` schema registration, ☐ populated-state serializable/byte-identical harness
- ✓ **Portable gate:** CI (GitHub Actions `validate` job, pinned via `.nvmrc`), CODEOWNERS, `.coderabbit.yaml`, pre-push hook (`.githooks/` via `core.hooksPath`, no Husky dep), PR template (DoD) + new-game/bug issue forms — *pushed 2026-06-07; CI runs on PRs. ☐ branch protection + CodeRabbit install (UI)*
- ☐ R8 ML perf measurement on real tablet + ratify perf budget

### Days 3–5 — Prove the hard paths
- ☐ `@edu/city` (store + fixed-timestep clock + topo runner + RNG + save/load + migration registry)
- ☐ `host-city` + `host-standalone` skeletons
- ☐ `@edu/ui` starter + shared skills (edu-frontend/frontend-design/work-log) + `logs/` convention
- ☐ scaffolder (`new-game`) + templates
- ☐ runtime structural harness (fast-check determinism, populated serializable round-trip)
- ☐ refactor one example (`nature_hunt`) → contract → clonable template
- ☐ **Gate centerpiece:** 1 KG reference game + TWO interacting primary subsystems (live 1×–1000× deterministic + fast-forward view)

---

## Packages (`@edu/*`)
- ✓ `contract` · ✓ `debug` · ✓ `testing` (test doubles) · ◐ `ui` (crayon tokens + `Button`)
- ◐ `toolbox` (PORTED: `createAIServices` STT/TTS/pose + **teachable-image camera** [RecognitionManager: KNN teach→test + coco-ssd fallback] + `createAudioBus`; engines still allowJs `.js`+`.d.ts`; `@edu/ai` `AIServices` impl lives here) · ☐ `city` · ☐ `engine` · ☐ `i18n` · ☐ `audio` · ☐ `teacher` · ☐ `telemetry`

## Apps
- ◐ `host-standalone` (Vite host + concrete `GameContext`: TTS/STT/audio/storage/teacher + dev voice-sim) · ☐ `host-city` (the merge) · ☐ `launcher` (R20)

---

## Cross-cutting requirements (Plan §9) — status
| R | Item | Status | Note |
|---|---|---|---|
| R1 | Testing infra | ◐ | Vitest + RTL + jsdom wired (`npm test` in `validate`); `@edu/testing` doubles; 28 tests on CtR. ☐ Playwright tablet-smoke + axe + fast-check |
| R2 | Privacy / telemetry stub | ◐ | `Telemetry` iface in contract; impl + PII CI check pending |
| R3 | Teacher controls | ◐ | `TeacherControls` iface in contract; impl pending |
| R4 | Audio pipeline (English-primary) | ◐ | `AudioBus` iface in contract; impl pending |
| R5 | Licensing | ☐ | per-asset LICENSE + check-licenses |
| R6 / R17–R19 | Accessibility | ◐ | `manifest.a11y` + tap-present check ✓; Canvas PDOM, flash/motion, AT audit pending |
| R7 | City art & layout | ☐ | owner + assets |
| R8 | Device matrix | ☐ | Day-1 tablet must-verify (WebGL backend, memory, STT existence) |
| R9 | Work logs | ◐ | convention documented; `logs/` dir + work-log skill usage pending |
| R10 | Determinism + migration | ◐ | `SeededRng` + fixed-point in contract ✓; migration registry + fast-check harness pending |
| R11 | Content pipeline (assets) | ☐ | owner + schedule |
| R12 | Host fault tolerance | ◐ | game-level crash-proofing ✓ (golden rule #12: best-effort `ctx` I/O + host error boundary); sim snapshot/quarantine/rollback (§4h) pending |
| R13 | Playtesting (kids+teacher, ~wk5) | ☐ | incl. SEN participant |
| R14 | Session persistence | ◐ | `SessionInfo` in contract ✓; impl pending |
| R15 | Consent / data governance | ☐ | DPA + parent notice + DPIA |
| R16 | Client security (CSP/SRI/self-host) | ☐ | |
| R20 | Classroom ops / launcher | ☐ | |
| R21 | Capability gating + min spec | ◐ | `AIServices.probe` in contract ✓; gating + spec pending |
| R22 | Salvage & port (`source/`) | ◐ | mapped + documented; porting pending |

---

## Verification gates (Plan §11) — foundation "done when"
- ◐ 1 (workspaces resolve, pinned Node) — workspaces ✓; Node pin via `.nvmrc` ✓
- ☐ 2 `new-game` → passes validate zero-edit
- ☐ 3 host-standalone on tablet viewport (Playwright)
- ☐ 4 two interacting subsystems (live + fast-forward, deterministic)
- ◐ 5 `validate` + build green; CI mirror — local validate ✓ (28 tests); **pushed** → CI runs on PRs (pre-push hook enforced the gate on the first push)
- ◐ 6 sync-agents consistency — `npm run sync:check` drift gate enforces `.ai/**` → `.claude`/`.opencode` regenerability (first in `validate`); per-tool frontmatter translation (Claude vs opencode-native) landed
- ☐ 7 offline play + STT fallback
- ☐ 8 i18n layer proven (English complete)
- ☐ 9 device matrix + live-scale ceiling measured
- ☐ 10 fault tolerance test
- ☐ 11 pedagogy loop (spec → manifest)

---

## Open decisions (Plan §12)
☐ age band · ☐ hosting · ☐ lesson cut + 4-way split · ☐ second locale (post-v1) · ☐ CodeRabbit plan · ☐ evaluate PixiJS / XState / agent-ecosystem trim · ☐ Day-0/1: topology, https/http, tfjs version, min device spec

---

_Done 2026-06-06: **Portable gate** — CI workflow, CODEOWNERS, CodeRabbit, pre-push hook, PR/issue templates._

## Parked (designed, revisit after first games)
- **Generated SME progress board** (`docs/STATUS.md`) — design agreed 2026-06-06, **deferred** to prioritize shipping games (likely to change once real games/curriculum exist). Full design: [PLAN.md §6c](PLAN.md). In brief: a generative (never-hand-edited) board for the Education SME; sources = `docs/curriculum/lessons.json` registry + curriculum frontmatter + game manifests; `scripts/gen-status.mjs` (deterministic) + a `status:check` freshness gate in `validate`; doc-map nav headers + CLAUDE agent note.

## Next up (recommended order)
1. **Blueprint-first pipeline — remaining** ([spec](superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md)): ✓1a `blueprint` skill · ✓1b roster + retire scaffolder · ✓1c `/build-game` orchestrator · ✓1d `lessons.json` registry (K2+K3 1–20 from the PDF; band taxonomy — see below) · ☐ wire Playwright tablet-smoke + axe so `verifier` reports real GREEN (today it honestly says "not wired").
   - **▶ RESUME HERE — end-to-end dry-run, BLOCKED on item 2 (toolbox port, parallel session).** When `@edu/toolbox`/`@edu/ai` land (merge toolbox + game-breaker branches to one first), run **`/build-game kindergarten k2 1`** (AI Meet My Shapes — fixture already in `source/kindergarten/k2-01-ai-meet-my-shapes/`). Flow: Gate 0 → blueprint-author → ★Gate 1 (human approves blueprint) → game-builder (composes the new toolbox blocks) → parallel review (contract/kid-ux/pedagogy) → verifier → fix loop → ★Gate 2. This run is also the real test that the orchestrator + agents interlock, and surfaces any awkwardness in the toolbox API for the builder.
2. **`@edu/toolbox`/`@edu/ai` port** — port `source/toolbox/{conversation,joints,recognition}.js` into typed building blocks (dependency of bespoke builds, not template). *(In progress — parallel session.)*
3. **`@edu/city`** — the riskiest core (store/clock/topo runner/RNG/save-load/migration).
4. **Curriculum extraction** — run the new `blueprint` skill across the 20 KG + primary lessons.
5. *(deferred) ESLint config* — wire sim-rule lint (no-`Math.random` / no `ctx.bus`-for-state / no persisted floats) into `validate` + CI once `@edu/city` exists; linting sim rules needs sim code to lint.
