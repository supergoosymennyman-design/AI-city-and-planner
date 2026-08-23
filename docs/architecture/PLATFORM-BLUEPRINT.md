# AI City Platform — Architectural Blueprint (v1.1)

Status: **FROZEN** (v1.1, 2026-08-23 — supersedes v1.0)
Owner: AI2School platform team
Scope: one persistent 3D AI City with themed districts + enterable interiors, offline-first, deterministic, bilingual EN/zh-Hant, shipped as installed software.

This document is the single source of truth for platform architecture. The workshop team, any future AI model, and all engineers build against it — especially §5 (the capability contract), a frozen, versioned interface.

*v1.1 delta from v1.0:* product reframed from "theme-swappable separate worlds" to "one City + themed districts + interiors"; capability contract refined (seed-through-snapshot); new save/progression, performance, and asset-pipeline sections; build order and risks updated from the Sonnet architecture review (pressure-tested against the codebase).

---

## 1. Scope & Audience

### Audience
**Primary: P5–P6 (ages 10–11).** These are smart students doing real systems reasoning — design language is *student-language* (plain, precise, never condescending), and the optimization challenges carry genuine trade-off depth. The platform may extend downward to younger primary later, but v1 is calibrated for 10–11.

### The product shape
**One persistent AI City the student keeps expanding across the programme.** The city contains themed **districts**, each with its own design/optimization challenge and enterable **interior**:
- **Theme Park** — visitor flow / queuing
- **Spaceport** — a spaceship they can launch and ride inside
- **AI Laboratory** — workflow / sequencing
- **City base** — coverage / zoning / walkability

Through-line: **build → connect → run** — the student designs part of the city, builds an AI capability in the Workshop, and watches it govern the 3D simulation of their city.

### Design phase = planning *mode*, not a separate 2D app
An orthographic top-down camera over the **real 3D city**, literal 3D models, drag/drop, with per-district palette + objectives + metric overlays. "2D→3D" is a camera tilt, never a data conversion or cross-app handoff.

### Devices & quality tiers
| Tier | Devices | Bar |
|---|---|---|
| **Tier 1 (primary)** | iPad, macOS | Full fidelity, validated 30 fps, all polish |
| **Tier 2 (must work)** | Android tablets, Windows | Boots + runs at reduced quality preset; never a hard "unsupported" block |

Implemented via Unity **URP Quality Levels** (High for Tier 1, Medium/Low for Tier 2), auto-selected at startup by device capability.

### Non-goals (explicitly out of scope)
- **Voice (TTS/STT)** — deferred. Leave a one-line hook only.
- **The Workshop itself** — built by an external team. We own and freeze the *contract* (§5); they build to it. Nothing we build depends on the workshop existing yet.
- **Cross-architecture bit-identical replay** — same-device reproducibility is the requirement (§9).
- **Accounts, PII, server state** — none. Local-only profiles per device.
- **Browser delivery** — this is installed software.

---

## 2. Engine Decision

**Unity 6 LTS (URP), C#** — decided and validated. Phase 0 spike proved: headless `-batchmode` build loop; 60-agent GPU-instanced crowd at ~58 fps (Apple Silicon); Android (IL2CPP, ARM64) + Windows x64 builds succeed. URP 17.5.

Rationale (recorded so it isn't relitigated): AI coding agent is the developer → C#/Unity is the most reliable code-generation target; licensing is a non-issue (no path to $200k revenue/funding for years); most mature iPad/macOS/Windows/Android export; existing Mixamo champion retargets best in Unity.

**Fallback:** Godot — only if a later phase surfaces a hard blocker. Not expected.

### Quality tiers → URP Quality Levels
- **High** (iPad/Mac): shadows on, full agent budget, post on.
- **Medium/Low** (Android/Windows): shadows reduced/off, agent budget scaled, no post. Deterministic seed keeps simulation identical across tiers; only rendering differs.

---

## 3. Platform Model: City + Districts + Interiors

```
┌────────────────────────────────────────────────────────────┐
│ City world (one persistent scene)                           │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│   │ Theme    │  │ Spaceport│  │ AI Lab   │  │ City base  │ │
│   │ Park     │  │ (+ship)  │  │          │  │ (hub)      │ │
│   └──────────┘  └──────────┘  └──────────┘  └────────────┘ │
│        └── enterable interiors (additive scenes) ──┘        │
├────────────────────────────────────────────────────────────┤
│ Capability Runtime (pure, deterministic, engine-agnostic)   │
│ Core Shell (camera, avatar, nav, missions, HUD, save, …)    │
│ Engine runtime (Unity 6 LTS, URP)                           │
└────────────────────────────────────────────────────────────┘
```

A **district** = an outdoor zone in the city (buildable in planning mode, with palette + optimization challenge + overlays) + one or more **interiors** (enterable scenes) + **AI capability slots** (Workshop). New districts are content, not code.

### Layering (code vs data)
- **Core Shell (code, theme-agnostic):** camera rig (orbit + ortho planning + soft-follow), `AgentController` (movement + animation), flow-field navigation, mission engine (data-driven), HUD/minimap host, view-stack + dialog system, save/progress, companion hook, **interior/scene manager** (additive load/unload + door transition).
- **Capability Runtime (code):** the sandboxed executor that turns a child-built capability into a per-tick decision (§5). Engine-agnostic, pure, seeded. **The layer most worth getting right.**
- **District Manifest (data):** palette, objectives, constraints, overlays, capability slots, difficulty tuning, interior reference, unlock rule (§4).
- **Workshop (external):** builds capability blobs against §5. We do not ship it.
- **District content (data + assets):** Theme Park, Spaceport, Lab, City base — each a manifest + art + locale + interiors + a palette.

**Rule:** if adding a district requires touching shell code, that's a shell bug, tracked as a shell gap — not patched one-off in the district. Enforced mechanically: CI fails a "district content" PR whose diff touches any path outside the district's folder (reviewed exception process for genuine shell-gap fixes).

---

## 4. District Framework

Authored as a `DistrictManifest` **ScriptableObject** in-editor (typed prefab/scene refs, inspector validation), **exported to a versioned JSON blob at build time** — deliberately mirroring the `ICapability` JSON-blob pattern so the two content systems (capabilities, districts) share one architecture.

```json
{
  "districtId": "theme_park",
  "version": 1,
  "displayNameKey": "district.theme_park.name",
  "footprint": { "origin": [120, 40], "sizeMeters": [180, 180] },
  "interiorSceneId": "Interior_ThemePark",
  "capabilitySlots": [
    { "slotId": "queue_router", "acceptedTypes": ["router_v1", "threshold_v1"], "requiredForReveal": true }
  ],
  "palette": [
    { "pieceId": "ride_carousel", "prefab": "Buildings/Park/Carousel", "cost": 120, "footprintMeters": [8, 8], "category": "attraction" }
  ],
  "objectives": [
    { "metricId": "avg_wait_time", "goal": "minimize", "targetBand": [0, 90] }
  ],
  "constraints": [ { "constraintId": "budget", "max": 2000 } ],
  "overlays": ["heat_queue", "path_flow"],
  "difficultyTier": { "core": { "agentCount": 45, "paletteSubset": "full", "constraintSlack": 1.0 } },
  "unlock": { "requires": ["district.spaceport.completed"] }
}
```

A `CityManifest` aggregates district footprints into one bounds plus cross-district shared infrastructure (roads/utilities). **Commit:** SO-authored → JSON-exported. **Fallback:** hand-written JSON with a custom validator if the SO↔JSON round-trip becomes its own burden.

### Coordinates
**Continuous metres** (the existing optimizer is continuous, so it ports directly), with **grid-snap as a placement assist** for tidiness. The flow-field used for agent navigation is baked on a runtime grid *separately* from placement coordinates — navigation discretization must not leak into the layout model.

---

## 5. Frozen Contract (v1) — Capability ↔ Simulation

The interface the workshop team codes against. Do not change without a major-version bump + migration.

```csharp
// Engine-agnostic — no Unity types. Testable headless.
public interface ICapability {
    string TypeId { get; }          // "threshold_v1" | "classifier_v1" | "router_v1" | "optimizer_v1"
    int SchemaVersion { get; }
    JsonNode Parameters { get; }    // e.g. { "threshold": 0.62 }
    JsonNode TrainingTrace { get; } // worked examples the child used — replay/explainability, never PII
}

public readonly struct WorldSnapshot {
    public readonly ulong Seed;                          // per-tick seed: hash(masterSeed, tick)
    public readonly IReadOnlyDictionary<string, float> Features;
}

public readonly struct CapabilityDecision {
    public readonly string Label;       // classifier
    public readonly float Confidence;   // classifier
    public readonly int RouteIndex;     // router
    public readonly float[] Allocation; // optimizer/budget
}

public interface ICapabilityRuntime {
    // Pure. Same capability + snapshot + seed → same decision, forever.
    CapabilityDecision Evaluate(ICapability capability, WorldSnapshot snapshot);
}
```

**Determinism boundary:** lives entirely inside `Evaluate()` — no `Time.time`, no `UnityEngine.Random`, no allocation depending on frame timing; inputs only from snapshot + seed. The seed is threaded **through** the snapshot (not a stateful RNG passed by reference), making `Evaluate` trivially unit-testable and rewind/replay free.

**Driving ~60 agents/tick without GC stalls:**
- `WorldSnapshot` pooled or struct — never allocated per-agent-per-tick; one snapshot per tick, each agent reads a slice/index.
- Deserialize capability JSON once at load into a typed struct; never parse per tick.
- One manager iterates a plain array — not 60 `MonoBehaviour.Update()` calls.
- Don't reach for Jobs/Burst on day one; keep it as the documented escape hatch if profiling demands.

**Capability types (v1):** `threshold_v1`, `classifier_v1`, `router_v1`, `optimizer_v1`. Build `threshold_v1` first end-to-end; the City's existing optimizer is ported as `optimizer_v1` (algorithm + explanation strings, not the JS).

---

## 6. Interior / Scene Management

**Commit: additive scenes via `SceneManager.LoadSceneAsync(Additive)`** — not Addressables, not in-scene rooms. For 3–4 discrete interiors, plain additive load + a small loading manager is sufficient and avoids an unnecessary content-pipeline dependency (Addressables is a later upgrade only if content scales).

Entry/exit UX: a door/gate trigger → deterministic scripted camera dolly (500–1000 ms) + fade/mask wipe → async-load interior behind the fade → drop exterior heavy meshes to a low-detail proxy while inside → spawn at the interior entry. Reverse on exit. If load isn't done when the fade completes, hold on a **diegetic** loading beat (consistent with art direction), not a spinner.

---

## 7. Planning vs. Simulation Mode

One scene, two camera/input modes over shared world state:
- **Planning:** orthographic top-down, pan/zoom, grid-snapped placement, docked palette, objective HUD, overlay toggle.
- **Simulation:** perspective free/follow camera, placement UI hidden, agents animate, live score HUD.

Overlays: compute a metric grid (e.g. 32×32 per district, CPU-side) → write to a `Texture2D` → sample in an unlit shader on a thin map-plane above the ground → blend in ortho view with a colour-blind-safe ramp (pattern/hatching paired with hue). Per-district palette/objectives activate when the ortho camera's focus crosses that district footprint — same scene, UI panel swap only.

### The four district challenges

| District | Goal (student language) | Palette | Constraints | Overlays | Capability slot | Concept |
|---|---|---|---|---|---|---|
| City base | "Make sure everyone can walk to what they need." | Housing, amenities, roads | Budget, zoning adjacency | `coverage_heat`, `walk_radius` | `optimizer_v1` | Coverage/zoning/walkability (port existing hill-climb) |
| Theme Park | "Keep the lines short and everyone happy." | Attractions, staff booths, paths | Budget, footprint | `heat_queue`, `path_flow` | `router_v1` / `threshold_v1` | Queuing/flow, bottlenecks |
| Spaceport | "Pack the ship so it doesn't run out of power or get too heavy." | Cargo/life-support/engine/crew modules (mass + power) | Hull mass cap, power budget | `mass_gauge`, `power_flow` | `optimizer_v1` | Resource allocation / knapsack |
| AI Lab | "Put the steps in order so nothing gets stuck or wrong." | Process stations (sensor, cleaner, sorter, classifier) | Station count, sequence length | `workflow_path`, `bottleneck_highlight` | `classifier_v1` + `router_v1` | Sequencing, pipeline bottlenecks |

### The reveal moment
"Run Simulation" → ortho→perspective camera tilt (deterministic, ~1.5–2 s) → agents spawn + move along the baked flow-field → assigned capability governs decisions → champion performs a signature reveal beat (existing Mixamo clip) → metric chips update live → scored summary with coach verdict. Bounded run (30–60 sim-sec compressed to ~15–20 real-sec, or until metrics stabilize).

---

## 8. Agents & Pathfinding

**Commit: custom lightweight flow-field** baked once when the layout changes (on "Run Simulation"), agents sample it each tick at O(1). No per-agent `NavMeshAgent`/RVO (a known low-end perf trap). **Fallback:** Unity AI Navigation (`NavMeshSurface`) with avoidance forced off, if the custom solver proves too costly early.

**Crowd rendering:** GPU instancing with baked/vertex-texture animation — never 60 independent `SkinnedMeshRenderer`/`Animator` instances. (This is what Phase 0 proved at ~58 fps; the champion avatar remains a single skinned hero, not the crowd.)

---

## 9. Determinism

- **PRNG:** custom xoshiro128\*\*/PCG32, one stream per subsystem (capability vs cosmetic particles get separate streams), seeded `masterSeed + streamIndex` — cosmetic randomness can never perturb gameplay randomness if call order changes.
- **Fixed timestep:** all gameplay/agent/capability logic in `FixedUpdate`; rendering/animation interpolates in `Update()` for smoothness without touching simulation determinism.
- **No engine-internal randomness** in gameplay. CI Roslyn analyzer fails the build if gameplay assemblies reference `DateTime.Now` / `Time.realtimeSinceStartup` outside an explicitly whitelisted debug/telemetry namespace.
- **Same-device reproducibility** is the requirement (explicitly out of scope: cross-architecture bit-exactness).

---

## 10. Save / Progression

**Commit: one continuous city across P5–P6** — matches "a persistent city the child keeps expanding." **Fallback:** explicit teacher-gated "New City" that *archives* (never deletes) the prior save.

Versioned JSON (debuggable over compact binary):
```json
{
  "saveVersion": 4,
  "masterSeed": 12345,
  "districts": {
    "theme_park": { "unlocked": true, "placedPieces": [], "capabilityAssignments": {}, "bestMetrics": {} }
  },
  "curriculumProgress": { "completedLessons": ["l1", "l2"] },
  "profileMeta": { "nickname": "", "avatarSkin": "" }
}
```
- **No PII:** `nickname` is a kid-chosen handle + avatar id, never a real name, never transmitted.
- Corruption tolerance: write to temp file + atomic rename, 2-slot rolling backup, CRC32; on failure fall back to backup, then to a fresh city (never lock the child out).
- Autosave on reveal-run completion + district exit, plus debounced ~30 s after last edit — not per-frame writes.
- Unlocks are curriculum-progress-gated via the manifest's `unlock` field.

---

## 11. Localization

Externalize all strings from day one via Unity's Localization package, keyed to the manifest's `displayNameKey`-style keys.

**Fonts: Noto Sans HK** (regional HK glyph variants — not generic Noto Sans TC) **+ Nunito Sans** for Latin, matched weights (Regular/Medium/Bold). Free, shippable now; screenshot-test both languages side by side before locking.

---

## 12. Design System

- **Colour:** warm-neutral base (off-white/cream, not stark white) + one saturated-not-neon accent per district (park = warm coral, spaceport = deep indigo/teal, lab = sage green). Meaning never carried by hue alone (always paired with icon/pattern). **No purple-pink gradients, glow, or glass blur.**
- **Space:** 4/8 px grid, ≥44 px touch targets, ≥8 px gaps.
- **Type:** max 3 weights.
- **Motion:** 200–350 ms eased transitions; no bounce/elastic easing. Reduced-motion → plain crossfades via one central `MotionPolicy` helper.
- **Icon:** custom outline set (consistent stroke, rounded caps); **fallback** Phosphor Icons as a reskinnable scaffold early on.

### Planning-mode UX (ages 10–11)
- Onboarding: 3–4 step guided first placement, coach highlights the actual UI element; short text only.
- Feedback: plain-language **metric chips** (not one opaque number); each chip tappable → one-sentence explanation → one coach-proposed move (accept/dismiss).
- Difficulty: a teacher-overridable **tier** (not raw age) so a strong or struggling student isn't locked to a birthday.

### Accessibility — mechanical, not aspirational
- Colour-blind: colour always paired with icon/pattern/text; per-screen protanopia/deuteranopia/tritanopia simulation as a build-gate checklist item.
- Touch targets: editor test walks all UI prefabs and asserts ≥44×44 hit areas; fails CI otherwise.
- Focus: visible, ordered keyboard focus chain (Windows/mouse-keyboard); play-mode test asserts an unbroken chain.

---

## 13. Performance Plan (30 fps on iPad 9th gen)

Three URP tiers (Quality Levels + Universal Renderer assets):
- **Low:** no MSAA, single 512–1024 hard shadow or none, minimal post (colour LUT only), unlit background props.
- **Mid** (target: iPad 9th gen / mid Android): FXAA/2× MSAA, single 1024–2048 shadow, light post, baked lighting preferred.
- **High** (newer iPad/Mac/gaming PC): fuller post, higher shadow res, more dynamic lights.

Device→tier via allowlist + conservative fallback (`SystemInfo.systemMemorySize` + `graphicsDeviceType`); unknown device defaults Low; manual override in settings.

- LODGroups (3 levels) on all buildings/props; aggressive LOD bias on Low.
- GPU instancing for props + agent crowd; SRP Batcher on; static batching only for non-moving dressing.
- Curated `ShaderVariantCollection` per tier, pre-warmed at loading; aggressive stripping of unused URP features.
- **Never `Shader.Find()` at runtime for shipped shaders** — reference via serialized field or Resources/Addressables-loaded Material (the Phase 0 "stripped shader" bug class).

---

## 14. Asset Pipeline

- `AssetPostprocessor` enforcing consistent scale/orientation on import (GLB Y-up/meters vs Mixamo FBX conventions — a common silent-bug source), mesh compression, read/write disabled by default (enabled only where CPU access is needed).
- Per-platform texture overrides: ASTC/ETC2, capped 1024 (props) / 2048 (hero champion).
- Humanoid retargeting: Unity Humanoid rig + one canonical avatar mask, so Mixamo clips retarget cleanly onto the champion and future skins.
- Generated low-poly props (Hunyuan/Trellis) need a cleanup pass (decimate, collapse to 1–2 materials, verify LODs) before entering a palette. Poly ceilings (CI-checked): small prop ≤500 tris, medium building ≤3000, hero ≤8000.

---

## 15. Repo Structure & Tests

Assembly definitions by layer, no reverse dependencies:
```
Core.Determinism   (PRNG, fixed timestep — minimal engine dependency)
Core.Capability    (ICapability/WorldSnapshot runtime, pure C#, unit-testable)
Districts.Runtime  (manifest loading, palette/placement)
Districts.Editor   (SO authoring)
Agents.Runtime     (flow-field, crowd)
UI.Planning / UI.Simulation
Localization
Save
```
Folders: `Assets/_Project/{Core, Districts, Agents, UI, Art, Localization, Save}`, district content nested per district.

Tests: EditMode for pure logic (`Evaluate()` determinism ×1000, save round-trip + corruption recovery, manifest schema validation); PlayMode for scene behaviour (agent counts, overlay null-safety, unlock gating). CI: `-batchmode -runTests` per PR + nightly full-platform build matrix.

---

## 16. Build Order

| Phase | Deliverable | GO/NO-GO gate |
|---|---|---|
| 0 (done) | batchmode builds, 60-agent crowd perf, cross-platform builds ✅ | — |
| 1 | **Core loop skeleton.** District manifest + loader; **City base** end-to-end (planning mode, one overlay, reveal with a *stubbed* capability — not blocked on the workshop team), save/load, determinism suite green. **Acquire floor hardware here.** | Child places 5 buildings, hits Run, sees agents move + score change, reloads save next launch — on a real iPad 9th gen at ≥30 fps. |
| 2 | **Districts #2/#3** (Theme Park, Lab) proving the manifest is reuse. Integrate real `ICapability` when the workshop team stabilizes it (stub interface identical in shape). Localization live (EN + zh-Hant). | Did #2/#3 take meaningfully less engineering than #1? If a district needs framework rework, fix the framework first. |
| 3 | **Spaceport + save/progression hardening.** Multi-district persistent city, corruption-recovery tests, a11y CI gates, perf pass across the *full floor-hardware matrix*. | All four districts together sustain 30 fps on iPad 9th gen + Celeron laptop + low-end Android — the "must-run" promise, verified. |
| 4 | **Distribution/pilot.** ASM/TestFlight, Managed Play, signed MSI; classroom pilot for the coach/feedback loop. | Pilot students complete one full build→connect→run cycle without adult rescue more than once. |

Informal playtesting starts at the **end of Phase 1**, not Phase 4 — the coach loop can't be de-risked on paper.

---

## 17. Distribution

| Platform | Channel | Notes |
|---|---|---|
| iPad (primary) | Apple School Manager Custom Apps (via MDM) | Apple Developer Program $99/yr; TestFlight for pilot before ASM clears. **Procurement/legal lead time — flag early.** |
| macOS | Notarized `.app` (Developer ID, `notarytool`) | Same $99 account. |
| Android | Managed Google Play primary; signed APK fallback | One-time $25 Play fee, or free sideload. |
| Windows | Signed MSI (WiX or similar) | Code-signing cert to avoid SmartScreen (procurement item). |

CI: one parameterized `-batchmode -quit -buildTarget <platform>` job per platform, gated by the EditMode/PlayMode suites.

---

## 18. Risks (de-risk earliest)

1. **The coach/feedback loop is the actual pedagogy, and it's the least-specified part of the brief.** De-risk by end of Phase 1, ideally lo-fi.
2. **Workshop-team contract dependency.** The `WorldSnapshot` feature-float shape must be validated jointly against all four capability types before Phase 2, not designed one-sided.
3. **"Reduced quality, never unsupported" is unproven** — Phase 0 validated the *best* device, not the worst. Floor hardware must be profiled before Phase 2.
4. **zh-Hant typography is a visual-judgment risk** — a design that looks premium in EN can look thin in zh-Hant. Build key screens in both languages by end of Phase 1; get a native HK reader's opinion.
5. **Interior *content volume*, not logic, is the real cost of districts.** The manifest de-risks logic reuse, not art/content cost. Budget each interior as its own line item per district from Phase 1 — don't let it hide inside "district #2 will be faster."

No fatal flaws otherwise: Unity 6/URP, additive-scene interiors, SO+JSON manifests, GPU-instanced crowd, custom flow-field, continuous single city, seeded-deterministic capability evaluation all fit the constraints.
