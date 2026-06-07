# Plan: AI-Education Games Platform — Foundation, Team Workflow & Merge (v3 — React/TS)

## Context

Web-app games that teach AI to **kindergarten (K2/K3)** and **primary (P1–P6)** students — one game per lesson. Two products:
- **Kindergarten:** teacher-led "teachable-machine" voice/camera games (teach AI → AI learns → test AI), 25 min. Builds on existing `source/toolbox/` (Web Speech, TF.js, MediaPipe).
- **Primary "AI City Architect":** 2D simulation games, 45 min. **Lessons 18–20 merge every earlier game into one authoritative "AI City"** running at 1×/1000×/1,000,000× with cross-subsystem cascades. Merging is a day-one requirement.

**Team:** 4 devs, **fully parallel from day one**, on **different coding agents + models** (Claude Code, opencode+Deepseek, …). → conventions are **tool-agnostic and CI-enforced** (not reliant on any agent reading a prompt). Tablet-functional, prefer-offline, ~2-month target.

**How the references build games (verified):** Brilliant = Vue+TS+SCSS, lessons via Elm authoring tools. PhET = a shared engine (Scenery scene graph + Axon observable state + Joist shell) with strict **model–view separation** — that common library is what makes 100+ sims consistent *and* combinable. Both solve "many consistent, combinable interactives" with one team-wide stack + one shared library, not by language. Our merge design (authoritative `CityState` "model" + React/Canvas "view") is this exact, proven pattern.

---

## 0a. Current state & hard prerequisites (verified against the repo — it's greenfield)

A repo audit found the plan must not assume a foundation that doesn't exist:
- **What exists is MORE than it first looks — SALVAGE & PORT, don't rebuild (R22).** The *canonical* `toolbox/joints.js` is empty, but working implementations live in the example games:
  - **Conversation:** `ConversationManager` (`toolbox/conversation.js`) = complete STT + **VAD** + TTS + state/interruption/fallback (only the *local* LLM is a stub — fine, KG dialogue is scripted). Cut its `masswerk.at` meSpeak **CDN** dep (self-host or use `speechSynthesis`).
  - **Teachable image:** **MobileNet embeddings + `knn-classifier` on TF.js (already 4.x in `recognition.js`)** + coco-ssd object detection — **port this**, which avoids `@teachablemachine/image`'s 1.3.1 trap entirely. (`nature_hunt/vision.js` uses tfjs 2.8.6 — unify everything on 4.x.)
  - **Pose/gesture EXISTS:** `hand_gestures/handTracker.js` runs **MediaPipe Hands**, `trainer.js` does **TF.js few-shot gesture training (augmentation)**, with a gesture-controlled Snake — a complete loop to port (self-host the MediaPipe assets; cut CDN).
  - **Also salvage:** IndexedDB store (`nature_hunt/storage.js`), Web Audio chimes (`color-the-rainbow/js/audio.js`), SVG/canvas drawing, config patterns, and **three sim engines** (`Population Modelling`, `Delivery Route`, `Sentiment Values`) as **prior art for the AI City** primary games.
  - The two polished examples (`nature_hunt`, `color-the-rainbow`) are vanilla JS that **don't follow the contract** — one is refactored to it before templating (§10).
- **Language compatibility — does TS/React/Vite conflict with the vanilla-JS toolbox/examples? NO fundamental conflict; bounded migration:**
  - **TS ⊃ JS** + Vite `allowJs` → import the existing `.js` **untouched on day 1**, wrap behind a typed interface, convert to `.ts` incrementally (no big-bang rewrite).
  - The **logic ports cleanly** (TF.js/KNN/MediaPipe/`ConversationManager`/sims are framework-agnostic; called from React hooks or the Canvas RAF loop kept outside React, §4e).
  - Three rewrites, not conflicts: **(1)** CDN `<script>`/`window.tf` globals → **npm ES-module imports** (`@tensorflow/tfjs`, `@mediapipe/*` ship TS types — an *upgrade*); **(2)** direct DOM/SVG → React components; **(3)** per-game HTML → React routes under the contract.
  - **Vite caveat (known, solved):** TF.js/MediaPipe **WASM + worker assets** need a Vite asset config + self-host to `/public` — same self-hosting R22 already mandates.
- **What's missing entirely:** no git, no `package.json`/workspaces, no TS/Vite/ESLint/CI, no `packages/`/`apps/`/`games/`, no contract, no city — all of §2 is built from scratch.
- **🚩 #1 PREREQUISITE — the lesson materials aren't in the repo as usable data.** They exist only in **binary `.docx`/`.pdf`** (`source/kindergarten/`, `source/primary/`): no lesson IDs, no structured specs, nothing CI can validate. **Day 0 task (blocks everything): convert them → `docs/curriculum/<lesson>.md` + a `Lesson` enum.** Until then the lesson cut, the merge subset, and the capability set are guesses.
- **Four Day-0/1 decisions that are binary and architecture-shaping (§12):** **(1) Deployment topology** — *teacher-projects-one* vs *1-device-per-child* vs *shared cart*. Dictates the contract (`session`/roster), `@edu/teacher`, STT concurrency, identity. **Recommend teacher-projects-one for KG** — dissolves cloud-STT-concurrency, per-child-identity, and 30-tablets-of-audio at once. **(2) https vs http** — camera/mic/SW/autoplay *all* need https; **http makes the KG mechanic nonfunctional**. **(3) Modern tfjs (4.x), NOT `@teachablemachine/image`'s pinned 1.3.1** — load the TM model format on 4.x (WASM fallback + browser fixes). **(4) Minimum device spec** — iPad 9 / iPadOS 16.4+ or ≥3–4 GB Android Chrome 100+ (§12/R21); the stack **won't run on the cheapest tablets**, so the floor must be set and features capability-gated.

---

## 0. What the lead actually does (the answer to "what should I do?")

1. **Mandate one stack for all four — no per-person deviation.** Divergence causes merge hell, not the language. *(Decided: React + TS + Vite.)*
2. **Nobody builds a game until the starter kit exists** (week 1): shared component library + game template + City shell + merge contract. One person (or Claude) builds it; the others read curriculum and claim games meanwhile.
3. **Every game is built from the template as a self-contained React piece.** The full `CitySubsystem` discipline (fixed-point determinism, closed-form/macro-step ticking, namespaced `ext`) is mandated **only for the subsystems that feed the L18–20 showcase** — not taxed across all primary games up front. The City is then *assembly* of those, plus precomputed fast-forward (§4b) — not integration.
4. **Encode the rules in AGENTS.md/CLAUDE.md + CI** so every agent/model produces conformant code automatically.
5. **Govern the contract with a split freeze.** Freeze the *outer* surfaces (`GameModule`/`GameManifest`/`GameContext`) early so devs can build; keep the *inner* sim schema (`CityState` fields, `Capability` enum, tick rules) **additive-only + versioned** under core-guardian, with a one-line change-request flow + `schemaVersion` bump + migration. This is the realistic answer to "what if the contract must change in week 3" — it can, additively, without breaking 4 branches and every save file.
6. **Assign owners (RACI), don't just say "parallel."** Ambiguous ownership is where 4 parallel streams stall. Lock these before kickoff:

| Area | Owner (role slot — assign your people) |
|---|---|
| Foundation / `@edu/city` merge engine / core-guardian | **Dev A (lead)** |
| `@edu/toolbox` TS port + ML/AI services | **Dev B** |
| Primary games + City subsystems | **Dev C** (+ A,C,D share game production) |
| KG games + R7 City art/layout | **Dev D** |
| Curriculum→spec + pedagogy review (§5b) + R11 content | **Education SME** (5th hat / part-time) |
| Weekly `host-city` integration run + red-integration triage | **Dev A** |

Everything else below is architecture — owned by Claude, not decisions you must make. Remaining genuine choices are in §12.

---

## 1. Stack & "which language for what"

**React + TypeScript + Vite**, with a small, modern, agent-friendly, Vite-native toolset. Tablet discipline: per-game **lazy load**, a **size budget** in CI, **Canvas for heavy sim**, service-worker offline.

| Concern | Choice |
|---|---|
| UI / components | **React 18 + TSX** |
| Language / contracts | **TypeScript** (first-class — real type-checked contracts) |
| Build / dev | **Vite** (+ react plugin); static output, per-game code-split |
| Shared model / sim state | **Zustand** store — lives *outside* React; clock + subsystem `tick` mutate it; views subscribe to slices |
| Schema + runtime validation | **Zod** — one source for the manifest + `CityState` schema *and* their TS types |
| Styling / design system | `@edu/ui` = **React Aria Components** (Apache-2.0; accessible primitives) + CSS Modules + CSS-variable tokens |
| Heavy sim rendering | **Hand-rolled Canvas 2D** in a RAF loop, *outside* React (render throttled/compute-bound; PixiJS kept as documented fallback, not default — avoids a 2nd WebGL context vs TF.js) |
| On-device ML | **PORT existing** (R22): MobileNet+`knn-classifier` teachable + coco-ssd on **one tfjs 4.x**; MediaPipe Hands + TF.js gesture trainer; `ConversationManager` (STT+VAD+TTS). Self-host all (cut CDNs). New infra: Audio **Howler.js**, offline **vite-plugin-pwa**, save/load **idb** |
| Localization (text) | **English-primary.** `react-i18next` so strings aren't hardcoded (cheap to add a locale later), but the only required catalog is `en`; `zh-Hant` is a small/optional add |
| Localization (audio) | **English-primary** `en` TTS. A *little* Cantonese (`yue-HK`) VO is optional/nice-to-have, not a content track; audio-locale ≠ text-locale layer kept for future, not built out now |
| Tests | **Vitest + React Testing Library** + **Playwright** (tablet-viewport smoke) |
| Monorepo | **npm workspaces**, pinned Node (`.nvmrc`+`engines`), committed lockfile |

---

## 2. Repository layout (monorepo)

```
ai-education/
  AGENTS.md            # single source of truth for agents   CLAUDE.md ("@AGENTS.md" + notes)
  README.md  CONTRIBUTING.md  DEFINITION_OF_DONE.md
  package.json  tsconfig.base.json  vite.config.shared.ts  eslint.config.js  .nvmrc

  .ai/agents/          # canonical subagent prompts (source)
  .claude/agents/      # generated   .opencode/agent/  # generated   .claude/settings.json

  packages/            # shared core — CODEOWNERS-gated
    contract/   # @edu/contract  TS types + Zod schemas (GameModule, manifest, CityState), validators
    ui/         # @edu/ui        React design system: Button/AICharacter/Dialog/DragBoard/Slider/Progress
    city/       # @edu/city      CityState store (Zustand), sim clock, layer renderer, save/load, runner
    engine/     # @edu/engine    Canvas/RAF helpers, touch input, scene utils (standalone games)
    toolbox/    # @edu/toolbox   PORTED: ConversationManager (STT+VAD+TTS) + MobileNet+KNN teachable + MediaPipe Hands gesture; one tfjs 4.x, self-hosted
    ai/         # @edu/ai        AIServices iface + offline defaults + remote adapter slots
    i18n/       # @edu/i18n      react-i18next setup, base catalogs
    audio/      # @edu/audio     AudioBus, live+recorded TTS, VO cache
    teacher/    # @edu/teacher   teacher-control surface (step/reset/replay/skip)
    telemetry/  # @edu/telemetry privacy-safe, offline-by-default logging

  apps/
    host-standalone/   # run ONE game full-screen (lesson mode)
    host-city/         # the AI City: store + clock + subsystem runner + 3 layers (THE MERGE)
    launcher/          # teacher portal (later)

  games/
    kindergarten/<id>/   manifest.ts index.tsx Game.tsx logic/ ui/ assets/ audio/ i18n/ tests/
    primary/<id>/        ... + subsystem.ts (city model) + Layer.tsx (city view) for city games

  templates/game-template/  templates/subsystem-template/  templates/learning-design.md
  scripts/  setup.mjs  new-game.mjs  validate-contracts.mjs  sync-agents.mjs  check-licenses.mjs
  docs/  architecture.md game-contract.md city-architecture.md ai-capabilities.md pedagogy.md a11y.md
         ux-guidelines.md audio-pipeline.md privacy.md security.md dpa-template.md parent-notice.md
         device-matrix.md deployment-school.md classroom-failure-modes.md release.md  curriculum/<lesson>.md
  logs/       # daily per-dev work logs (logs/<date>-<dev>.md) — tool-agnostic coordination record (R9)
  city-art/   # shared City art + layout config (owned deliverable, R7)
  .github/  CODEOWNERS pull_request_template.md ISSUE_TEMPLATE/{new-game,bug}.yml workflows/ci.yml
```

**Ownership:** `packages/** apps/** templates/** scripts/** city-art/** *.md` → CODEOWNERS/core-guardian; `games/<track>/<id>/**` → owner. No central index to hand-edit (games + City layout auto-discovered).

---

## 3. The Game Module Contract (React/TS)

Two surfaces sharing `logic/`: a standalone lesson component, and (primary) a City subsystem. **Split the contract by track** so KG games never carry City-shaped weight and the Primary sim contract can evolve independently (both extend a tiny shared base):

```ts
interface BaseGameModule { manifest: GameManifest; Game: React.FC<{ ctx: GameContext }>; }
export interface KgGameModule extends BaseGameModule {}                 // no City surface
export interface PrimaryGameModule extends BaseGameModule { subsystem?: CitySubsystem; }
export type GameModule = KgGameModule | PrimaryGameModule;

export interface GameContext {
  mode: 'standalone' | 'city';
  ageBand: string;
  session: SessionInfo;            // { childId?, deviceId, roster? } — shared-tablet identity (§5c)
  ai: AIServices;                  // §5, offline-first
  t: TFunction;                    // react-i18next, text locale en|zh-Hant
  audio: AudioBus;                 // live en TTS + recorded yue-HK VO
  storage: KeyValueStore;          // keyed by (session.childId, manifest.id) — no bleed on shared devices
  bus: EventBus;                   // UI notifications only (NOT authoritative state)
  teacher: TeacherControls;        // step/reset/replay/skip
  telemetry: { log(e: string, d?: object): void };  // privacy-safe, offline-by-default
}

export const GameManifest = z.object({       // Zod = schema + type in one
  id: z.string(),                  // globally unique; reserved at issue-distribution
  track: z.enum(['kindergarten','primary']),
  lesson: z.number(),
  ageBand: z.string(),             // single target band, e.g. 'P5-P6'
  lessonGroup: z.string().optional(),        // links age-variants (future fan-out)
  title: z.record(z.string()),     // {en, 'zh-Hant'}
  concept: z.string(),
  // --- pedagogy (this is a teaching product, not just software — §5b) ---
  objective: z.record(z.string()),           // {en,'zh-Hant'} what the child should LEARN (not "do")
  successCriteria: z.array(z.string()),      // observable "they got it" signals → assessment hooks
  misconception: z.string().optional(),      // common wrong idea this game must NOT reinforce
  bigIdea: z.number(),                        // AI4K12 Big Idea 1-5 this game serves (curriculum backbone)
  aiRepresentation: z.enum(['real-model','rule-based','remix','remote-real']), // label real-vs-simulated AI
                                             // for internal consistency in child-facing copy (§5b)
  // --- accessibility: two-channel redundancy is contract law (§6b) ---
  a11y: z.object({                           // validate-contracts REJECTS single-channel core actions
    instructionChannels: z.array(z.enum(['audio','visual','symbol'])).min(2),
    inputChannels: z.array(z.enum(['tap','voice','camera','keyboard','switch'])).min(2), // tap always present
    reducedMotion: z.boolean(),              // honors prefers-reduced-motion
  }),
  capabilities: z.array(Capability),         // from the pre-enumerated set
  assetMode: z.enum(['composed','curated','remote']),   // 'remote' needs sign-off
  assets: z.array(z.string()),
  orientation: z.enum(['portrait','landscape','any']),
  cityPlacement: z.object({                   // auto-derives City layout; no central file
    subsystem: z.string(), layer: LayerName, gridArea: z.tuple([z.number(),z.number(),z.number(),z.number()])
  }).optional(),
});
```

**These referenced types are named but NOT yet defined — they MUST be written as real `.ts` in `@edu/contract` on Days 1–2, or 4 devs write 4 incompatible versions (the exact divergence the contract exists to prevent):** `AIServices` (per-capability signatures + loading lifecycle + error contract), `AudioBus` (`speak`/`playVO` + locale handling), `KeyValueStore`, `EventBus` (emit/on + valid-event registry), `TeacherControls`, `SeededRng` (**`pure-rand`, or hand Mulberry32** — `next()`→[0,1), `nextInt(n)`; same generator in app + `fast-check` tests), `SessionInfo` (`childId?`/`deviceId`/`roster?` — §5c), the `Capability` enum (ship a concrete first-pass set, even 5 values), and the full `CityState` shape (`Tile`/`District`/`Globals` written out, not prose). One example game is **refactored to this contract before** it becomes the clonable template (the existing vanilla examples predate it).

---

## 4. The merge — authoritative state + clock (PhET's model/view, in React)

```ts
export interface CitySubsystem {
  id: string;                      // 'power','waste','traffic' — unique
  lesson: number;
  dependsOn: string[];             // ids whose tick runs first; host topo-sorts → fixed order
  init(state: CityState, ctx: GameContext): void;
  // MODEL (live, 1×–1000×): integrate dtSim — a DURATION in sim-seconds.
  // Closed-form where natural, else ≤K bounded macro-steps (§4b) — never one step per sim-second.
  // MUST be deterministic (fixed-point, use the passed rng, never Math.random); serializable fields only.
  // Extreme scale is precomputed/parameterized, not this live path (§4b/§4i).
  tick(state: CityState, dtSim: number, rng: SeededRng): void;
  Layer: React.FC<{ layer: LayerName }>;          // VIEW: subscribes to THROTTLED store slices
  Inspector?: React.FC<{ entityId: string }>;     // tap-to-inspect at 1×
}
export type LayerName = 'power-utility' | 'logistics-waste' | 'social-safety';
```

**(a) Single source of truth.** `CityState` (Zod-typed, in `@edu/city`) = `{ schemaVersion, rngSeed, globals{tick,timeScale,...}, tiles[], districts[], subsystems{} }`. **JSON-serializable only** (no Map/Set/class/closure/typed-array). `serialize()/deserialize()` back save/load.

**(b) Time scale — live sim for 1×–1000×, *precomputed/parameterized fast-forward* for the extreme regime (the de-risked design).** Two reviews showed that "live deterministic 1,000,000×" is both the heaviest tax and largely *theatre*: a 1e6× frame is ~16,700 sim-seconds — impossible to step — so the "live sim" is already just evaluating a curve once per frame, which a child cannot distinguish from a precomputed result. Real subsystems (waste *thresholds*, traffic *congestion bifurcation*) aren't even closed-form integrable, so a naive live approach is *wrong* at high scale. Therefore:
  - **1× to ~1000× (live):** `tick(state, dtSim, rng)` runs on a **fixed-timestep accumulator** (fixed *real* cadence, e.g. 4 updates/sec, **decoupled from render FPS** so slow tablet = fast dev machine). `dtSim` is a duration; integrate via **closed-form where natural, else ≤K bounded macro-steps** (K fixed, e.g. ≤8, *independent of `timeScale`* — never one step per sim-second).
  - **Extreme scale (the "century in a tap"):** the **primary** design is a **precomputed/parameterized fast-forward** — author-computed cascade snapshots, or closed-form curves evaluated on a slider drag, that teach *compounding + cross-effects* (the actual pedagogy) without a live 1e6× loop. Live-deterministic-1e6× is a **stretch goal**, not a day-1 load-bearing requirement.
  - **Consequence (big timeline win):** the full closed-form/deterministic discipline is only mandatory for the **handful of subsystems that feed the L18–20 showcase**, not imposed on all primary games up front (§0a). Most standalone games keep whatever internal model fits the lesson.

**(c) Determinism (required for save/load, replay, and 4-machine agreement).** Seeded PRNG threaded as `rng` (bare `Math.random()` banned by lint in `@edu/city` + `games/primary/**`); host runs subsystems in the **topologically-sorted `dependsOn` order** (fixed, validated as a DAG at load — cycles fail CI); no reliance on object-key order. Same seed + same inputs → identical state **within the pinned Node/V8 engine**, with **CI as the single source of truth** for the canonical replay (JS floats aren't guaranteed bit-identical across arbitrary CPUs/engines — so the byte-identical assertion in §8 runs on CI's pinned engine). **Mandatory fixed-point discipline (not "preferred"):** all sim-critical quantities are stored as **integers in milli-units** (value × 1000); multiplications **truncate** (`Math.trunc`) to integer; floats are allowed only in transient view math, never persisted to `CityState`. This makes determinism a property devs can reason about, not a hope. R10's two-config replay runs on the pinned engine.

**(d) Cross-subsystem cascades flow through `CityState`, namespaced (not the bus).** To avoid every subsystem editing the shared tile schema (a merge-conflict + CODEOWNERS bottleneck), each writes under its own namespace — `tiles[i].ext['waste'].trash`; sentiment reads `ext['waste']`. Core tile/district shape stays small and stable; `ext` is an open record so adding a subsystem is **additive, not a core-schema edit**. **Namespace contract (prevents 4-way divergence):** each `ext['<id>']` sub-shape has its **own Zod schema, owned by that subsystem's author** and registered with `@edu/city` (validated in CI like the manifest); a reader of another namespace imports its *type*, never redefines it. **Read freshness follows `dependsOn`:** within a tick a subsystem sees this-tick writes from its declared upstream deps (topo order guarantees it) and last-tick values from everything else — reading a non-dependency's same-tick value is undefined and lint-flagged. **No `ctx.bus` for state** (CI-enforced, see §8).

**(e) Rendering.** Canvas RAF loop reads the store directly for the hot sim view; React renders chrome + each `subsystem.Layer`, which subscribe to **coarse/throttled** slices (not per-tick) so high time scales don't thrash React. Zustand bridges both. **Low-end discipline (required, not optional):** dirty-rect redraw + offscreen pre-rendered tiles + integer draw coords — never a full per-frame grid repaint (chokes a weak CPU).

**(f) Schema evolution.** `schemaVersion` + a **migration registry** in `@edu/city` (`migrate(old) → current`); `deserialize` runs migrations or, on an unmigratable gap, rejects with a clear reset. Tested with a saved fixture from an earlier version (see R10). **Bump rule (core-guardian adjudicates):** adding a new `ext['<id>']` namespace or an optional field = **additive, no bump**; changing/removing a *core* tile/district/globals field, or a breaking change to an existing `ext` shape = **`schemaVersion`++ + a migration**.

**(g)** Layout auto-derived from `manifest.cityPlacement`. Standalone game and subsystem **share `logic/`** — different surfaces, not the same component.

**(h) Fault tolerance (shared authoritative state = a single throw can corrupt everyone's save).** Each `tick` runs against a **pre-tick snapshot**; if a subsystem throws, the host **quarantines that subsystem and rolls its slice back** (others continue) rather than persisting a half-mutated state. Both hosts wrap games/layers in **React error boundaries**. `deserialize` validates + has a **corrupt-save recovery path** (reset to last-good or clean state, never load garbage).

**(i) Extreme-scale = precomputed/parameterized fast-forward (now the primary design, per (b)).** L18–20's "century in a tap" ships as **precomputed cascade snapshots / parameterized curves**, not a live 1e6× loop — simpler, deterministic by construction, and pedagogically identical. A Days 1–2 tablet spike still measures the *live* sim's top sustainable scale (≥30 FPS) to set where live ends and fast-forward begins; live-deterministic-1e6× remains a stretch goal that must justify its cost. The serializable-state architecture supports both with no redesign.

---

## 5. AI, voice, i18n (decisions locked)

`@edu/ai` exposes one interface; defaults offline; remote adapters opt-in with sign-off. Authoritative feasibility table (→ `docs/ai-capabilities.md`):

| Capability | Production approach |
|---|---|
| recognizeImage / teachable | **PORT the existing MobileNet-embedding + `knn-classifier` flow** (`recognition.js`/`nature_hunt/vision.js`) onto **one modern tfjs 4.x** (it already runs on 4.x — no `@teachablemachine/image`, so the 1.3.1 trap is moot). coco-ssd for object detection. **Capability-probe at launch** (WebGL2 + working tfjs backend); on failure **disable the image-ML game gracefully** — never silent CPU fallback |
| recognizePose/Gesture | **PORT the existing working loop** — `hand_gestures/handTracker.js` (**MediaPipe Hands**) + `trainer.js` (**TF.js few-shot gesture training**) + classification heuristics. **Self-host** the MediaPipe assets (cut the CDN); consider migrating to the maintained `@mediapipe/tasks-vision`. Needs WASM SIMD (Safari 16.4+); **hardware-gate** + lower res/cadence on Android (§8 memory). **Avoid `ml5.js`** (non-OSI) |
| listen (STT) | **Tap/choose is the DEFAULT; voice is a skippable extra.** ⚠️ **Web Speech STT does not exist on iPad (all iOS browsers are WebKit) or Android kiosk WebViews** — i.e. dead on the most likely school devices — so voice is effectively **Android-Chrome-only** and must never be required. Also cloud-only (biometric-adjacent child data, amended COPPA 2025) + 30 concurrent streams unmodeled. App **auto-omits voice** unless (Chrome/Android) **and** (network) **and** (consent/DPA §5c); no broken mic, no live teacher call. TTS (`speechSynthesis`) is well-supported and fine |
| speak (TTS) | **Live `en` (primary)** via `speechSynthesis`. **Port the existing TTS** but **cut the `masswerk.at` meSpeak CDN** (self-host if a fallback voice is needed). Optional small Cantonese VO later — not a v1 requirement |
| converse | **Port the existing `ConversationManager`** (STT + **VAD** + TTS + state/interruption/fallback). Scripted/rule-based dialogue (offline; KG is deterministic; L18 advisor = enumerated rules); local-LLM stub is fine — not used |
| generateImage | Offline: a curated **sticker remix** (no on-device diffusion); real generation only via a labeled `assetMode:'remote'` demo |
| generateAudio | Offline: Web Audio sequences recorded samples (beat/song) |
| trainModel | KNN / teachable on-device |

- **English-primary.** The product ships and is verified in English; `zh-Hant` text + a little Cantonese VO are optional additions enabled by the i18n layer, not a required parallel track. Keep strings externalized so a locale can be added later without a refactor (incl. Canvas-drawn labels, which bypass react-i18next and must pull from catalogs, not be hard-drawn).
- Games **degrade gracefully** when net/mic/camera unavailable (enforced by kid-ux-reviewer + CI).

---

## 5b. Pedagogy & learning design (this is a TEACHING product)

Games must actually teach, not just pass CI. So pedagogy is a quality gate alongside the technical ones.

- **Role: a Curriculum/Education SME** (the 5th hat; one of the 4 devs or part-time) — turns each lesson into a buildable spec and reviews that the built game teaches the concept and is age-appropriate.
- **Lesson→game process:** each lesson gets a one-page **spec** in `docs/curriculum/<lesson>.md` — objective, observable success criteria, age-band notes, the interaction that demonstrates the concept. The `lesson-analyst` subagent drafts it; the SME reviews. This is the single brief the 4 devs build from (prevents 4 interpretations of the same lesson).
- **Manifest carries it forward:** `objective` / `successCriteria` / `misconception` / `bigIdea` / `aiRepresentation` (§3) tie the built game back to its spec; `validate-contracts` checks they're non-empty and the spec file exists.
- **AI4K12 "Five Big Ideas"** is a useful reference for `bigIdea` coverage. The **ML implementation** is a **port of the existing MobileNet+`knn-classifier` flow** on one tfjs 4.x (R22) — not rebuilt, not `@teachablemachine/image`.
- **`aiRepresentation` (internal honesty label):** each capability records whether it's a `real-model`, `rule-based`, `remix`, or `remote-real` so the team stays consistent about real-vs-simulated AI in child-facing copy (default phrasing where unspecified: "real trained model" vs "rule-based/remix helper").
- **DoD gains pedagogy gates** (§8): objective met by the interaction · age-appropriate (pre-reader-operable for KG) · teaches the intended concept · SME review. Technical-green is necessary, not sufficient.
- **Assessment scope (decide explicitly):** in-game success criteria drive immediate teacher-visible feedback (in scope). Cross-session *learning-outcome analytics* are **deferred/out of scope for v1** (R2 telemetry stays a stub) — stated so it's a choice, not an omission.

---

## 5c. Privacy, security & safeguarding (it's a CHILDREN's product — this is a ship gate, not a doc)

"No-PII telemetry" was naive: it secured the *logs* while ignoring the actual child data — voice audio sent to a cloud, camera frames, identity. Treat this as legal/ethical gating.

- **School-as-controller consent model (R15):** the school is the data controller, the platform a processor. Ship a **DPA template** + **parent-notice template** (`docs/dpa-template.md`, `docs/parent-notice.md`) — a "teacher opt-in" toggle is **not** a lawful basis (HK PDPO school guidance, amended COPPA 2025, UK AADC). A **DPIA** (camera+mic on young children = high-risk) is a Week-1 gated deliverable; decide if UK/EU is in scope (the English track implies it) or geo-restrict.
- **Cloud STT egress (the #1 hole):** a child's voice → third party is biometric-adjacent PII. Default to **no voice** (§5); voice only when consent/DPA + a *named* sub-processor + retention limit exist. Make the network code **physically absent** until then, not just disabled.
- **Camera invariants:** frames are **memory-only** — never written to disk/IndexedDB/SW-cache/telemetry/screenshots; CI/tests assert no image bytes hit storage; teacher framing guidance ("point at the object, not faces").
- **Locked client data-egress (R16 security):** **self-host AND pin ALL libs + models** (not just models) + **Subresource Integrity**; **strict CSP** (`default-src 'self'`, `connect-src` allowlist, no `unsafe-inline`; scope `wasm-unsafe-eval` for TF.js) — CI fails the build on any third-party CDN fetch or un-allowlisted `connect-src`. **Remote AI adapters OFF by default**, allowlisted per-endpoint, each gated by the same DPA. **No API keys client-side** (server-proxy only). Ban `dangerouslySetInnerHTML`; sanitize/length-cap all child/teacher free-text (XSS).
- **Identity on shared tablets:** age-appropriate, **no typed login** (avatar/photo pick or teacher-assigned device); storage keyed by `(childId, manifest.id)`; **hard inter-session wipe** of learned classes / camera-derived state / KV between children. City saves are owner-keyed + exportable.
- **Retention/deletion/breach:** one-page data-map (what's stored, where, how long, how deleted) + deletion path (PDPO/COPPA) + breach runbook in `docs/privacy.md`.
- **⚠️ Work-logs (R9) must never capture student data:** redaction + secret-scan in the work-log pipeline; all R13 playtest data stays **out of git**.

---

## 6b. Accessibility & inclusion (don't ship a product that locks out disabled children)

A voice/camera/audio-first design *structurally excludes* deaf, non-verbal, blind, and motor-impaired children — R6 alone is gestural. Promote a11y to a contract-enforced pillar (commit to **WCAG 2.2 AA + W3C COGA**).

- **Two-channel redundancy = contract law (R17):** every core *instruction*, *feedback*, and *action* reachable through ≥2 independent channels — the `manifest.a11y` block (§3) declares them; `validate-contracts` rejects single-channel core actions; DoD + `kid-ux-reviewer` (re-chartered for *disability* access, not just pre-reader) check it. This one rule kills the deaf / non-verbal / most motor BLOCKERs at the source. Audio instruction MUST always have a visual/symbol twin (a deaf pre-reader can read *neither* text nor audio); the tap path is always present so voice/camera are never required.
- **Canvas City needs a Parallel DOM (R18):** the plan cited PhET's model/view but skipped PhET's signature **PDOM** — add an accessible DOM mirror (ARIA roles/labels for tiles/districts/inspector) + **keyboard/switch navigation** + live-region announcements, or the City is invisible to screen readers and unoperable without touch.
- **Motion & flash safety (R19):** enforce **WCAG 2.3.1 flash limits** on the fast-forward/cascades (a genuine seizure *safety* hazard) and honor **`prefers-reduced-motion`** (reuse the precomputed-snapshot path §4b for a static/stepped view). Audio is teacher/child-initiated with persistent mute ("calm mode") — no surprise autoplay.
- **Low-vision + targets:** high-contrast theme, OS text-size respect, scalable Canvas text/zoom in `@edu/ui`; minimum touch target ≥44px (larger for KG), every drag has a tap equivalent.
- **a11y is NOT lint-only:** add a **manual AT audit (screen reader + switch)** to the DoD and an **SEN child** to the R13 week-5 playtest. Lint catches ~⅓ — it can't detect "the deaf child has no path."

---

## 6. AGENTS.md / CLAUDE.md + enforcement

- **`AGENTS.md` canonical**; `CLAUDE.md` = `@AGENTS.md` + Claude notes; `GEMINI.md` pointer if used.
- **CI is the real enforcer; subagent prompts are convenience.** No golden rule depends on an agent having read a prompt.
- **Day-1: pin Claude Code + opencode versions and verify each consumes generated agents** (`.opencode/agent/`, `@AGENTS.md` import). If not, AGENTS.md + CI still carry the rules.
- Layered memory: root `AGENTS.md` + optional `packages/*/AGENTS.md`, `games/*/AGENTS.md`.
- **Onboarding (4 devs, 4 machines, day-1 bring-up):** `CONTRIBUTING.md` + `npm run setup` (or devcontainer) gets any dev from clone → green `validate` deterministically. Explicitly document that **sim determinism is asserted on CI's pinned engine only** — local float mismatches across machines are expected and not a bug, so devs don't chase them.
- `scripts/sync-agents.mjs` generates `.claude/agents/` + `.opencode/agent/` from `.ai/agents/`.
- Root AGENTS.md: what we build · golden rules (contract is law; offline-first w/ documented exceptions; `ctx`-only I/O; English-primary + strings externalized (no hardcoded text); no PII; touch/pre-reader-first; lazy-load + size budget; never hand-edit central files; never break `@edu/*` without core-guardian) · stack table · repo map · `npm run new-game` · contract + city links · DoD · commands.

---

## 6c. Generated SME progress board (DEFERRED — design captured 2026-06-06, revisit after first games)

**Status: DEFERRED** to prioritize shipping games; design agreed but likely to change once real games + curriculum exist. Captured here so it isn't lost.

**Goal:** an Education-SME-facing, lesson/game-centric **progress board** at `docs/STATUS.md`, **generated** (never hand-edited) so it can't drift — modeled on the work-log team-mode `summary.md` shape.

**Layout (hybrid):** "where we are" narrative + one-line foundation facts + **⚠ Needs your attention (SME)** strip + games **pipeline buckets** (📋 Spec needed → ✍️ Spec ready → 🔨 Building → 🔍 Needs SME review → ✅ Done) + drill-down links (spec · game · PROGRESS · PLAN · AGENTS).

**Sources of truth (everything derived — no hand-asserted status):**
- `docs/curriculum/lessons.json` — canonical lesson registry **(BUILT 2026-06-07)**, keyed by **`(band, lesson)`** and nested `{track}.{band}[]` with `slug`/`title`/`altTitle`/`tools`/`sourceReady`/`built` (richer than the originally-sketched `[{lesson, track, title, ageBand?}]` — lesson numbers reset per band). Naming rule + taxonomy: [docs/curriculum/README.md](curriculum/README.md). Any later `Lesson` enum derives from / is checked against it.
- `docs/curriculum/<track>-<band>-NN-<slug>.md` frontmatter — `smeReviewed`/`reviewer`/`owner` (SME edits the doc they own); spec-exists = file present.
- compiled game manifests (`dist/manifest.js`) — built + pedagogy + a11y badges derived (Zod-validated, same path as `validate-contracts`).

**Bucket logic:** no spec → 📋 · spec, no manifest → ✍️ · manifest invalid/incomplete → 🔨 · gates pass + `smeReviewed:false` → 🔍 · gates pass + reviewed → ✅.

**Generator:** `scripts/gen-status.mjs` — zero-dep Node ESM, hand-parses simple frontmatter, **deterministic (no timestamps, stable ordering)**, no network, honest empty-state; writes `docs/STATUS.md` with a "GENERATED — do not edit" banner.

**Connective tissue (the "connect with CLAUDE/AGENTS" asks):**
- **Enforced freshness:** `npm run status` writes; `npm run status:check` regenerate-and-diffs (fails if stale) and is added to `validate` → CI + pre-push enforce it with no `ci.yml` edit (replaces a human checklist).
- **Doc map** in AGENTS.md + a one-line nav header on PLAN/PROGRESS/STATUS (AGENTS = rules · PLAN = why · PROGRESS = tech state · STATUS = board · CLAUDE = Claude layer).
- **Per-item traceability** via manifest-derived gate badges.
- **CLAUDE.md** note: STATUS is generated; run `npm run status` after touching a manifest/curriculum file; never hand-edit.

**Out of scope:** full curriculum extraction (separate task — only the registry schema + seed belong here), HTML dashboard, second language, CI auto-commit.

---

## 7. Agent & subagent ecosystem

> **⚠ Updated 2026-06-07 — blueprint-first redesign.** The game-build workflow below is
> superseded by [docs/superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md](superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md).
> Key changes: development is **blueprint-first, never template-clone** (`game-scaffolder` is
> **retired**); a shared **`blueprint` skill** (KG + primary templates, weak-model-followable)
> turns the designer's source doc into a buildable, human-approved blueprint; one
> **`/build-game <track> <band> <lesson>`** orchestrator drives design → implement → parallel review →
> verify with a bounded fix loop and **two human gates** (approve blueprint; final SME/playtest
> sign-off) plus optional `--checkpoint` pauses. New roster: `blueprint-author`,
> `game-builder` (KG), `game-architect`+`game-implementer` (primary), `pedagogy-reviewer`,
> `verifier`; `contract-reviewer`/`kid-ux-reviewer`/`core-guardian` kept & lightly refined.
> Per-game designer source now lands in `source/<track>/<NN-slug>/` first (hard precondition,
> Gate 0). The mechanism taxonomy and "portable gate" philosophy below still hold.
>
> **Adversarial breakers (added 2026-06-07):** two post-build review agents beyond the static
> reviewers — `game-breaker` (hunts crashes / freezes / leaks / dead-ends and reproduces each as a
> FAILING test) and `ux-breaker` (explores OFF-RAIL play — silent no-ops, dead air, misleading
> feedback, premise-vs-implementation mismatches). Distinct from `kid-ux-reviewer` (static a11y).
> Both write test files only (no source edits/commits). Resilience is now **golden rule #12**
> (AGENTS.md): best-effort, crash-proof `ctx` I/O + never gate game progression on a side-effect
> resolving. Test infra (R1) is wired (Vitest + RTL + jsdom; doubles in `@edu/testing`).

**Four mechanisms, each matched to what it's best at — this *is* the structure:**

| Mechanism | Role | Runs where |
|---|---|---|
| **Skill** | Inject knowledge *while building* (design system, kid-UX, contract rules) | Main build loop, any skill-capable tool |
| **Subagent** | A *bounded, delegated* task in its own context (scaffold / review / analyze) | Claude Code, opencode |
| **Command** | Discoverable entry point that *orchestrates* skills + subagents | Claude Code + opencode |
| **CI + GitHub app** | The *portable gate* that runs for **every** teammate | GitHub (tool-agnostic) |

**Rule:** build *custom* only for project-unique knowledge; rent off-the-shelf for generic; anything that must protect everyone lives in CI/GitHub, never in one editor (else mixed-tool teammates silently skip it).

**Coverage map — every concern, by the right mechanism:**

| Concern | Build-time | Review-time | Portable gate |
|---|---|---|---|
| UI / frontend | **edu-frontend skill** (design system + kid-UX) | kid-ux-reviewer (subagent) | a11y lint, size budget, Playwright smoke |
| Contract / merge | lesson-analyst, game-scaffolder (subagents) | contract-reviewer, city-integrator (subagents) | validate-contracts, structural harness |
| General code quality | your agent + code-simplifier | **CodeRabbit on PRs** (all tools) + pr-review-toolkit (Claude) | ESLint, tsc, Vitest |
| Shared core | — | core-guardian (subagent) | CODEOWNERS |
| AI capability choice | ai-capability-advisor (subagent) | folded into contract-reviewer | assetMode sign-off |
| i18n / privacy / perf | edu-frontend skill patterns | folded into kid-ux-reviewer | i18n parity, PII, size checks |

**Custom subagents (7, lean — canonical in `.ai/agents/`, generated to `.claude/agents/` + `.opencode/agent/`):**
lesson-analyst · game-scaffolder · contract-reviewer · kid-ux-reviewer · city-integrator · core-guardian · ai-capability-advisor. (i18n/perf/privacy folded into reviewers to stay lean.) `lesson-analyst` turns a curriculum lesson into a shared brief so 4 devs don't interpret it 4 ways.

**Shared skills (every dev installs the same set — knowledge pushed into the build loop):**

| Skill | Source | What it gives the team |
|---|---|---|
| **edu-frontend** | custom (this repo) | `@edu/ui` components, design tokens + kid-UX rules so all four devs' UI is consistent |
| **frontend-design** | off-the-shelf | distinctive, production-grade UI; avoids generic "AI-looking" output — good for polished kid-facing screens |
| **work-log** | adopted (your skill) | daily per-dev work log: summarizes git changes + session prompts → dated markdown (see logs below) |

Skills live in the repo (or a shared plugin) so they version with the code; mixed-tool teammates whose agent can't load a skill still get the same rules via AGENTS.md + CI.

**Off-the-shelf review (rented):** **CodeRabbit** (auto-reviews every PR, all tools) + **pr-review-toolkit** (deeper Claude passes) + **code-simplifier**.

**Work logs — everyone records their behaviour (R9, the lead's coordination layer):**
Each dev runs the **work-log** skill at end of day → writes `logs/<date>-<dev>.md` (git diff + key decisions/prompts) and commits it. Because 4 devs run on different agents/models in parallel, these committed markdown logs give the lead one **tool-agnostic** view of every stream — diffable, searchable, independent of any agent's native history. Same philosophy as CI: the *artifact* is portable even when the *generator* isn't.

**Entry-point commands:** `/new-game` (lesson-analyst → game-scaffolder, edu-frontend skill active) · `/review-game` (contract-reviewer + kid-ux-reviewer + city-integrator + fix loop).

**Enforcement:** a git **pre-push hook** runs `npm run validate` for everyone; **CI** is the hard gate; **CodeRabbit** reviews every PR; subagents are on-demand accelerators that let you pass first-try. Nothing critical depends on an agent having been invoked.

Example `.ai/agents/contract-reviewer.md`: review ONE game vs types/Zod + docs; run `node scripts/validate-contracts.mjs <id>`; check §4 + §8 harness rules (incl. runtime render/unmount + subsystem tick serializable/deterministic); report only real violations ranked with `file:line` + minimal fix; PASS/FAIL; don't rewrite.

---

## 8. GitHub & CI

- `main` protected; one branch per game `game/<track>-<lesson>-<slug>`; PR per game; conventional commits; pinned Node/npm.
- **CI:** install → ESLint (+ `@typescript-eslint`; sim-package rules: **no-`Math.random`**, **no `ctx.bus` inside `subsystem.ts`/`logic` for state**, **no store writes from React render** (sim mutates only in the tick/RAF loop), **no persisted floats in `CityState`** (fixed-point §4c), no cross-namespace `ext` redefinition) → `tsc --noEmit` → `validate-contracts` (Zod manifest + per-namespace `ext` schemas + `dependsOn` DAG check) → **runtime structural harness** (render/unmount each game; subsystem `tick` on a **populated** `CityState`, assert deep-serializable + no NaN; **`fast-check` property test** `replay(serialize(s))===s` byte-identical for a fixed seed on CI's pinned engine) → `vite build` both hosts → **size budget** → license check → Playwright tablet smoke + **`@axe-core/playwright` a11y** + perf probe.
- **Size/perf budget (revised for real tablet limits; ratified after R8 Day-1):** host shell JS ≤ 250 KB gz; per-game lazy chunk ≤ 200 KB gz (excl. models); shared ML models ≤ ~15 MB, precached. **FPS is tiered:** ≥30 FPS on mid-iPad-or-better; **graceful degrade to ~15 FPS + lower input resolution** on capable Android; **no-ML fallback below the capability threshold** (§5). **Peak memory ≤ ~150–200 MB per game** (≤300 MB exceeds a mid-iPad's ~200 MB Safari crash point) — **one ML runtime at a time, hard `dispose()`/teardown between games, never tfjs + MediaPipe co-resident.** Cold model-load ≤ 3 s (warm ≤ 500 ms). CI fails on regression.
- **Pre-push hook + CodeRabbit:** a local pre-push hook runs `npm run validate` for everyone (tool-agnostic); **CodeRabbit** auto-reviews every PR (works across all tools/models); `pr-review-toolkit` for deeper Claude-side passes.
- **CODEOWNERS** core-gated; **issue template reserves unique `id` + records `ageBand`** → collision-free distribution.
- **PR template = DoD:** validate green; English complete + strings externalized (no hardcoded text); standalone + (primary) city; **logic + render tests present**; tablet-viewport tested; no new heavy deps; no PII; **pedagogy gates met (§5b): objective, age-appropriate, teaches the concept, SME review**; a11y two-channel redundancy (§6b).
- **Supply chain:** committed lockfile + `npm audit` in CI; **self-hosted ML models with pinned provenance/version** (the existing toolbox pulls TTS from a third-party CDN and has TF.js version drift — the port must cut both); Dependabot for security bumps.
- **App release/versioning (the bundle on tablets):** semver the shipped app; **service-worker cache-bust + upgrade strategy** (how a tablet gets the new version offline-first); staged rollout + rollback; hosting chosen in §12.

---

## 9. Cross-cutting requirements

- **R1 Testing (required):** every game ships logic unit tests + a render/unmount test (Vitest+RTL); primary adds a `subsystem.tick` delta test. AI/mic/camera mocked via `@edu/ai` doubles.
- **R2 Privacy (minors):** `ctx.telemetry.log` ships first as a **thin no-op stub** (interface fixed, full `@edu/telemetry` deferred — avoid over-building early); offline-by-default, no PII, no network without explicit teacher opt-in; schema-validated; CI rejects PII fields. `docs/privacy.md` (COPPA/GDPR-K/HK-PDPO).
- **R3 Teacher controls:** `@edu/teacher` + `ctx.teacher` (advance Part A/B/C, reset learned classes, replay, skip); host teacher overlay.
- **R4 Audio pipeline:** `@edu/audio` is **English-primary** (live `en` TTS + cache/precache); the text-vs-audio-locale seam exists so a little Cantonese VO can be added later, but VO is **not a required build-out** for v1.
- **R5 Licensing:** `assets/LICENSE` per game; `check-licenses.mjs` in CI.
- **R6 Accessibility:** pre-reader (icon/audio-first widgets in `@edu/ui`), colorblind-safe palettes + non-color cues, denied-permission fallback first-class. **Expanded into the §6b pillar (R17–R19) — R6 alone is not sufficient.**
- **R7 City art & layout** (`city-art/`): chunky 2D grid, 3 toggleable layers, one visual per primary subsystem (count = the primary sim-game count, pinned at the lesson-cut step — not a fixed "~17"), layout config consumed by `host-city`. Needs an owner + time.
- **R8 Device matrix** (`docs/device-matrix.md`): target tablet OS/browser, WebGL for TF.js, http/https getUserMedia, autoplay-audio. **Day-1 physical-device must-verify:** (1) does tfjs get a **WebGL backend, not CPU**, on the *cheapest* target Android; (2) **peak tab memory** during a camera+ML game on a mid iPad before it reloads/crashes; (3) does **`SpeechRecognition` even exist** in the exact kiosk/WebView browser schools deploy. Plus FPS, model load/memory.
- **R9 Work logs (behaviour record):** every dev commits a daily `logs/<date>-<dev>.md` via the shared **work-log** skill (git changes + key decisions). Gives the lead one tool-agnostic, diffable view across 4 parallel mixed-tool streams; the committed markdown is the portable artifact, not any agent's private history. **⚠️ Must never contain student data** — redaction + secret-scan in the pipeline; R13 playtest data stays out of git (§5c).
- **R10 Determinism & schema migration (required for save/load):** seeded RNG everywhere in the sim (lint bans `Math.random`); CI replays a fixed-seed run on two configs and asserts identical end-state; a committed **old-version save fixture** must load through the migration registry (§4f) into the current schema, or be cleanly rejected. Without this, "save/load across L18–20" breaks exactly at week-7 integration.
- **R11 Content pipeline:** the curated sticker/image library (for the remix tool) + recorded audio samples (`generateAudio`) are human-produced, licensed assets for specific lessons — a content track needing a **named owner + schedule from week 1**, parallel to R7 City art. (Cantonese VO is optional/post-v1, no longer on this critical path — English is primary.) Track which lessons are blocked on assets.
- **R12 Host fault tolerance (§4h):** pre-tick snapshot + per-subsystem quarantine/rollback, React error boundaries, corrupt-save recovery. Tested: a deliberately-throwing subsystem must not corrupt the shared save or kill the other subsystems.
- **R13 Playtesting with real users:** ≥1 teacher walkthrough + ≥1 child playtest of the vertical slice by ~week 5 (can a pre-reader operate teach→test? is the teacher overlay usable mid-lesson?). Findings feed the cut-ladder. This is usability QA, distinct from device/perf QA.
- **R14 Session persistence:** define per-game in-progress behavior on interruption (tablet sleep, teacher reset) — KG/Primary standalone games **resume or intentionally restart** (stated per game), distinct from the City's full save/load. Covers "different child, same device" + City **autosave cadence**.
- **R15 Consent & data governance (children):** school-as-controller DPA + parent-notice templates; Week-1 DPIA; cloud STT off unless consented + named sub-processor + retention limit; data-map + deletion path + breach runbook (§5c).
- **R16 Client security:** self-host + pin + SRI all libs/models; strict CSP + `connect-src` allowlist (CI-gated, no CDN fetches); remote adapters off-by-default; no client-side keys; XSS sanitization; SW scoped + integrity-checked; inter-session wipe on shared tablets (§5c).
- **R17 Two-channel redundancy (a11y contract law):** `manifest.a11y` ≥2 instruction + ≥2 input channels (tap always present); `validate-contracts` rejects single-channel core actions; manual AT audit + SEN child in R13 (§6b).
- **R18 Canvas accessibility:** Parallel DOM (ARIA mirror) + keyboard/switch nav + live regions for the City (§6b).
- **R19 Motion/flash safety:** WCAG 2.3.1 flash limits + `prefers-reduced-motion` (reuse precomputed snapshots) + initiated-audio/calm mode (§6b).
- **R20 Classroom operations:** a **minimal launcher is in the slice** (not deferred) — the teacher's only entry point: tablet-friendly lesson grid + pre-lesson **device-readiness check** (camera/mic/network green). Decide school **deployment/update path** (PWA vs bookmark vs MDM/kiosk; how a pinned tablet receives a SW update) in `docs/deployment-school.md`. Design in-lesson **failure UX** (camera/mic denied, mis-classification, network drop) per teacher + child in `docs/classroom-failure-modes.md`. Note headphones/audio orchestration for a 30-tablet room (R4).
- **R22 Salvage & port existing capabilities (don't rebuild):** map working prototype code → new packages, ported not reinvented — `ConversationManager` (STT+VAD+TTS) → `@edu/toolbox`; MobileNet+`knn-classifier` teachable + coco-ssd → `@edu/toolbox`/`@edu/ai`; MediaPipe Hands + TF.js gesture trainer (`hand_gestures/`) → `@edu/toolbox`; IndexedDB store → `@edu/city` save/load; Web Audio chimes → `@edu/audio`; SVG/canvas drawing → `@edu/engine`/`@edu/ui`; the three sim engines (ecosystem/pathfinding/sentiment) → **prior art for primary City subsystems**. **Cut every third-party CDN** (meSpeak/`masswerk.at`, jsDelivr TF.js/MediaPipe) → self-host; **unify on one tfjs 4.x**.
- **R21 Hardware capability gating + minimum spec:** **probe at launch** (WebGL2 + working tfjs backend + WASM SIMD + getUserMedia + `SpeechRecognition`) and **gate features by capability, not device model** — ML games disable gracefully (never silent CPU fallback / broken mic); voice is Android-Chrome-only + skippable. **Minimum spec:** iPad 9 / iPadOS 16.4+ **or** ≥3–4 GB Android, Chrome 100+, passing the probe. **One ML runtime per game + teardown** (§8). Camera needs WKWebView **iOS 14.3+**; MDM/kiosk must allow camera/mic prompts. Offline cache is **best-effort on iOS** (7-day eviction) → `navigator.storage.persist()` + re-fetch on launch.

---

## 10. Build sequence (~8 weeks ≈ 2 months, parallel)

- **Day 0 — Prerequisites (block the sprint; see §0a):** `git init`; **extract the curriculum from `.docx`/`.pdf` → `docs/curriculum/<lesson>.md` + a `Lesson` enum** (without this the lesson cut, merge subset, and `Capability` set are guesses); decide **deployment topology** (recommend teacher-projects-one for KG), **https vs http**, **the TF.js version**; create the monorepo scaffold (`package.json`/workspaces/tsconfig/Vite/ESLint).
- **Days 1–2 — Lock the spine (SPLIT FREEZE):** `@edu/contract` — **write all named service interfaces + `CityState` shape + `SeededRng` + `Capability` set as real `.ts` (§3), not prose**. **Freeze the *outer* surfaces** devs code against — `GameModule`, `GameManifest`, `GameContext` — now. **Do NOT hard-freeze the *inner* sim schema:** `CityState` fields, the `Capability` enum, and the `tick`/time-scale rules are **additive-only + versioned, owned by core-guardian** with a written change-request flow (§0). Set up the portable gate first: CI + CODEOWNERS + AGENTS.md/CLAUDE.md + CodeRabbit + pre-push hook. Enumerate a *first-pass* `Capability` set; **measure ML perf on the real tablet (R8)** and ratify the perf budget; **run a throwaway tablet spike to find the live sim's top sustainable scale (≥30 FPS)** — this sets where live ticking ends and precomputed fast-forward begins (§4b/§4i), settled before anyone builds on it.
- **Days 3–5 — Prove the hard paths (irreducible gate — keep this list tight):** `@edu/city` (store + **fixed-timestep clock** + topo-sorted runner + seeded RNG + fixed-point accumulators + save/load + migration-registry *interface* with an identity migration + a forced-version-skew fixture), `host-city` + `host-standalone` skeletons, `@edu/ui` starter + shared skills (edu-frontend, frontend-design, work-log) + `logs/` convention, **refactor one existing example game (e.g. `nature_hunt`) to the contract → it becomes the clonable template**, scaffolder, runtime structural harness. **The gate's centerpiece:** one KG reference game + **TWO interacting Primary subsystems** (e.g. waste→sentiment cascade) in `host-city` — **live at 1×–1000× (deterministic across serialize→deserialize→replay)** *and* an **extreme-scale precomputed/parameterized fast-forward view** (§4b) — proving cascade ordering + fixed-point determinism + save/load + the fast-forward pedagogy end-to-end. **Off the gate, spilling into Week 2 if needed:** the `@edu/toolbox` TS port w/ self-hosted models (TF.js unified, size-measured), the *real* historical-save migration, and the subagents + sync-agents generator — added incrementally only after confirming each tool consumes generated agents (§6); accelerators, not blockers.
- **Weeks 2–6 — Parallel build:** devs build against the frozen outer contract; `CityState` extensions land via additive namespaced `ext` fields + core-guardian review; reference games = copy-templates; **minimal launcher + device-readiness check (R20)**; `@edu/toolbox` port finished (R22: ConversationManager + MobileNet+KNN + MediaPipe gesture on one tfjs 4.x, self-hosted); weekly `host-city` integration run. R7 City art/layout **and the curated asset/sticker content track (R11)** run in parallel, each with a named owner.
- **Weeks 7–8 — Integration & polish:** assemble Primary L18–20 City (save/load across the three), KG capstones, **English polish** (optional `zh-Hant`/Cantonese-VO only if time allows), service-worker offline + precache, tablet QA, teacher launcher, showcase export.

**Scope realism — commit to a vertical slice, not ~40 games on faith.** ~40 quality educational games + foundation + merge + content (VO, curated assets) + i18n in ~8 weeks across 4 devs is **not** achievable. Instead:
- **Slice (the actual 8-week commit):** full foundation + merge proof + L18–20 City + **~8–12 exemplary games** (a few KG; enough Primary to populate the City), **English-complete** (i18n layer in place so a locale can be added later).
- **Cut-ladder (drop in this order if behind):** remaining games → second locale polish → KG capstones → *full* teacher portal (the **minimal launcher stays**). Never cut: foundation, merge proof, pedagogy gates, **a11y two-channel redundancy, privacy/consent gates**.
- **Velocity gate:** measure real per-game cost after **week 3**; the measured rate (not a guess) decides how many of the remaining ~28 games are in scope. Treat those as a post-foundation production line.
- **Playtest early:** one teacher walkthrough + one child playtest of the slice by **~week 5** — early enough to change direction (R13).
- One build per lesson at a **single age band (TBD with the lesson cut)**; variant fan-out post-launch via `lessonGroup`, no schema change.

---

## 11. Verification (foundation "done" when)

1. `npm install` resolves workspaces; pinned Node enforced.
2. `npm run new-game` → a game that **passes `npm run validate` with zero edits**.
3. `host-standalone` runs it on a tablet viewport (Playwright, ~768–1024px, touch).
4. **TWO interacting Primary subsystems run in `host-city`** (cascade through namespaced `CityState`), in fixed `dependsOn` order: **live at 1×–1000×**, **deterministic** (fixed-point) — a fixed-seed run survives serialize→deserialize→replay byte-identically on the pinned engine; **plus** an **extreme-scale precomputed/parameterized fast-forward** view (§4b) that conveys compounding + cross-effects without a live 1e6× loop.
5. `npm run validate && npm run build` (both hosts) green; CI mirrors incl. runtime structural harness; CodeRabbit live on PRs.
6. `npm run sync-agents` consistent across `.claude` + `.opencode`; both verified (or AGENTS.md+CI confirmed sufficient).
7. Offline: build, kill network, an offline-capable game plays fully; a **voice-input** (STT) game shows its non-voice fallback path (not a broken mic), and recorded VO audio still plays.
8. i18n layer proven: English is complete; a sample `zh-Hant` string + the audio-locale seam switch without layout breakage (proves a locale *can* be added; full second locale not required for v1).
9. Device matrix measured (R8); the live-sim top sustainable scale measured on the tablet (sets where live ends and fast-forward begins, §4b/§4i).
10. **Fault tolerance (R12):** a deliberately-throwing subsystem is quarantined/rolled back — shared save intact, other subsystems keep running; a corrupt save recovers cleanly.
11. **Pedagogy loop works (§5b):** the reference game has an Education-lead-approved `docs/curriculum/<lesson>.md` spec, and its manifest `objective`/`successCriteria` satisfy it (checked by `validate-contracts`).

---

## 12. Choices

**Decided (locked into the scaffold):**
- ✅ **Package scope** = `@edu/*` (repo folder `ai-education`).

**Decide Day 0/1 (binary, architecture-shaping — see §0a):**
- ⚠️ **Deployment topology** (teacher-projects-one / 1-per-child / shared cart) — recommend **teacher-projects-one for KG**; dictates contract `session`, teacher controls, STT concurrency, identity.
- ⚠️ **https vs http deployment** — camera/mic/SW/autoplay all need https; http makes the KG mechanic nonfunctional.
- ⚠️ **Modern tfjs 4.x** (TM model format), not the pinned 1.3.1 library.
- ⚠️ **Minimum device spec** — iPad 9 / iPadOS 16.4+ or ≥3–4 GB Android Chrome 100+ passing the launch probe (R21); the stack won't run on the cheapest tablets, so set the floor + capability-gate features.

**Adopt off-the-shelf OSS (verified license/maintenance; all runtime deps MIT/Apache-2.0):**

| Concern | Adopt | License | Note |
|---|---|---|---|
| Teachable-machine ML | **port existing** MobileNet+`knn-classifier` on tfjs 4.x | Apache-2.0 (tfjs) | avoids `@teachablemachine/image`'s 1.3.1 trap |
| Pose/gesture | **port existing** MediaPipe Hands + TF.js trainer (`hand_gestures/`); self-host | Apache-2.0 | already works; consider `@mediapipe/tasks-vision` |
| Accessible UI primitives (base for `@edu/ui`) | **React Aria Components** | Apache-2.0 | keyboard/switch/screen-reader/touch — serves §6b |
| Accessible drag-and-drop | **dnd-kit** | MIT | pointer+keyboard+SR; don't hand-roll a11y DnD |
| Audio (clips + beat sequencing) | **Howler.js** | MIT | ~7KB, offline once precached |
| Offline / SW / model precache | **vite-plugin-pwa** (Workbox) | MIT | native Vite fit |
| IndexedDB save/load + per-child state | **idb** | MIT | 1.2KB |
| Seeded RNG | **pure-rand** (or hand Mulberry32) | MIT | shared with fast-check; **avoid `seedrandom`** (unmaintained) |
| Determinism testing | **fast-check** | MIT | property test `replay(serialize(s))===s` (R10) |
| a11y CI gate | `@axe-core/playwright` | MPL-2.0 | dev-only |
| Design-system dev + kid-ux review | **Storybook** | MIT | dev-only |

- **AI4K12 / Experience AI / Code.org** as **reference lenses** for lesson coverage.
- **Keep hand-rolled / ADOPT-IF:** thin **Canvas 2D** renderer, not PixiJS — the render path is throttled/compute-bound and a 2nd WebGL context contends with TF.js (keep PixiJS, MIT, as a documented fallback). **XState** (MIT) only if KG dialogue branching gets non-trivial; else a Zustand reducer. **Turborepo** (MIT) only when CI build time bites. **Skip an ECS** (fights serializable state). Canvas-a11y PDOM is hand-built (no drop-in OSS; study PhET `scenery` as the design guide).
- Custom-build only what's genuinely novel: the **AI City merge engine**, **pre-reader tablet UX**, the **capstone** (English-primary).

**Still open (do NOT block the foundation sprint):**
- **Golden-path age band** — deliberately deferred. `ageBand` is just a per-game manifest string, so the scaffold and the merge proof don't depend on it; the reference Primary game demonstrates the `CitySubsystem` mechanism at any band. Pick the band when the lesson cut is decided.
- **Hosting** for static build + previews — GitHub Pages / Netlify / Vercel (constrained by the https decision above).
- **Exact lesson cut + 4-way split** (reserve `id`s in the issue step; needs the curriculum extracted first, §0a).
- **Second locale (post-v1, optional):** whether/when to add `zh-Hant` text + a little Cantonese VO (in-house vs vendor). Not in the v1 commit — English is primary.
- **CodeRabbit plan/budget** — free tier covers a small team to start.
- **Evaluate (don't pre-commit):** **PixiJS** for the Canvas *view* (WebGL scene graph vs hand-rolled `@edu/engine`; weigh against the offline/WebGL/TF.js story) · **XState** for KG's scripted teach→learn→test *dialogue flow* (a genuine state machine; not for the sim tick) · **trimming the agent ecosystem** to 3 core subagents (scaffolder, contract-reviewer, core-guardian) + dropping dual-generation unless mixed-tool is truly required — two reviews flagged the 7-subagent surface as over-built for 8 weeks.

---

## 13. Risk register (the lead tracks this weekly)

| Risk | Likelihood | Impact | Mitigation / owner |
|---|---|---|---|
| **🚩 Lesson materials not in repo (only binary docs)** | High | High | Day-0 convert → `docs/curriculum/*.md` + `Lesson` enum (§0a/§10). Owner: Education SME |
| **🚩 Children's voice → cloud STT (no consent/DPA)** | High | High | Tap-first default, voice off unless consented (§5/§5c); school-as-controller DPA + DPIA. Owner: lead/Education SME |
| **🚩 Voice/camera-first excludes disabled children** | High | High | Two-channel redundancy as contract law + Canvas PDOM + flash/motion safety (§6b). Owner: Dev A/D |
| **AI portrayal could mislead kids** | Low | Med | Label capabilities via `aiRepresentation`; keep child-facing copy honest (§5b). Owner: Education SME |
| **Cloud STT fails at 30× classroom concurrency** | High | High | Teacher-projects-one topology + tap-first; load-test N streams Day-1 (§0a/§10). Owner: lead |
| **Per-child state bleeds on shared tablets** | Med | High | `session` identity + storage keyed by child + inter-session wipe (§3/§5c). Owner: Dev A |
| **Client data-egress / supply-chain (kid app)** | Med | High | Self-host+SRI+CSP, remote adapters off, no client keys (§5c R16). Owner: Dev B |
| **Rebuilding what already works** | Med | Med | Port existing ML/conversation/gesture (R22); custom only the novel parts (engine, UX, capstone). Owner: lead |
| **Named contract interfaces undefined → 4 divergent impls** | High | High | Write all service interfaces + `CityState` + `SeededRng` as real `.ts` Days 1–2 (§3). Owner: Dev A |
| **Real subsystems aren't closed-form integrable** | High | Med | *Inverted design* (§4b): live only 1×–1000×, extreme scale precomputed/parameterized; closed-form mandated only for showcase subsystems. Owner: Dev A |
| **https vs http breaks KG camera/mic** | Med | High | Day-1 binary decision (§0a/§12); https or redesign KG input. Owner: lead |
| **MediaPipe pose absent (`joints.js` empty)** | High | Med | Drop pose/gesture from v1 (§5); backfill later. Owner: Dev B |
| **Scope blowout (~40 games in 8 wks)** | High | High | Vertical slice + cut-ladder + week-3 velocity gate (§10). Owner: lead |
| **Content track slips (curated assets)** | Med | Med | R11 named owner + schedule from week 1 (VO downgraded — English primary). Owner: Education SME |
| **🚩 Stack won't run on cheap tablets** (memory crash, no WebGL, no STT) | High | High | Min device spec + launch capability-probe + graceful gating (R21); revised FPS/memory budgets, 1 ML runtime/game (§8); Day-1 device verify (R8). Owner: Dev B/lead |
| **ML stack: TF.js version drift / CDN deps** | Med | Med | Port existing onto **one tfjs 4.x** (R22); no `@teachablemachine/image` (avoids 1.3.1); self-host all models; one ML runtime/game (§5/§8). Owner: Dev B |
| **Silently dropping working prototype capability** | Med | Med | R22 salvage map (conversation/teachable/gesture/sims/storage/audio) — port, don't rebuild. Owner: Dev B |
| **STT absent on iPad / kiosk WebView** | High | Med | Voice Android-Chrome-only + always skippable; tap-first default (§5). Owner: Dev B |
| **Games conformant but don't teach** | Med | High | §5b pedagogy gates + SME review in DoD; R13 playtest by wk5. Owner: Education SME |
| **Contract churn breaks 4 branches** | Med | High | Split freeze + additive `ext` + migration registry (§0.5/§4). Owner: core-guardian |
| **Mixed-tool divergence** | Med | Med | CI-as-enforcer + AGENTS.md + namespaced-`ext` contract. Owner: Dev A |
| **Shared-save corruption from a thrown tick** | Med | High | R12 snapshot/quarantine/rollback (§4h). Owner: Dev A |
