# AI Literacy Platform — Architectural Blueprint (v1)

Status: **FROZEN** (v1, 2026-08-23)
Owner: AI2School platform team
Scope: theme-swappable, offline-first, deterministic 3D educational platform for ages 6–11, bilingual EN/zh-Hant, shipped as installed software.

This document is the single source of truth for platform architecture. The workshop team, any future AI model, and all engineers build against this document — especially §4 (the capability contract), which is a frozen, versioned interface.

---

## 1. Scope & Non-goals

### In scope
- A **theme-agnostic 3D shell**: camera, avatar/locomotion, navigation, missions, HUD/minimap, save/progress, companion hook.
- A **workshop ↔ simulation contract** (frozen, §4) so externally-built AI capabilities plug into any theme.
- **Theme modules as data**: AI City (first), Spaceship (acceptance test), futuristic Laboratory, futuristic Theme Park (planned).
- A **design system** shared across every theme (tokens, components, anti-slop rules, i18n, a11y).
- **Downloadable software** installed on devices — not a browser tab.

### Devices & quality tiers
| Tier | Devices | Bar |
|---|---|---|
| **Tier 1 (primary)** | iPad, macOS | Full fidelity, validated 30 fps, all polish |
| **Tier 2 (must work)** | Android tablets, Windows | Boots + runs at reduced quality preset; never a hard "unsupported" block |

Most students use iPads (some Macs). Android/Windows must **work**, not necessarily match fidelity. Implemented via Unity **URP Quality Levels** (High for Tier 1, Medium/Low for Tier 2), auto-selected at startup by device capability.

### Non-goals (explicitly out of scope)
- **Voice (TTS/STT)** — deferred. Not important for the primary programme. Leave a one-line hook only.
- **The Workshop itself** — built by an external party. We own and freeze the *contract*; they build to it. Nothing we build depends on the workshop existing.
- **Cross-architecture bit-identical replay** — same-device reproducibility is the requirement (§8).
- **Accounts, PII, server state** — none. Local-only profiles per device.
- **Browser delivery** — this is installed software. (The marketing site is a separate website.)

---

## 2. Engine Decision

**Decision: Unity 6 LTS (URP), C#.**

Rationale (recorded so it's not relitigated):
1. **The developer is an AI coding agent, not a hired game dev.** Unity C# is the single most-represented engine+language pair in agent training data → the most reliable generated code. No senior human catches subtle engine errors, so "fewest agent mistakes" is the dominant factor.
2. **Licensing is not a blocker.** Unity Personal is free under $200k revenue *and* funding — no path to that line for years. Godot's licensing advantage is therefore moot.
3. **Apple-first, but must-run everywhere.** Unity has the most mature iPad/macOS/Windows/Android export pipeline of any engine; URP targets Metal/Vulkan/DX11 with GLES3 fallback.
4. **Champion animations already exist as Mixamo clips** — Unity's humanoid retargeting is best-in-class.
5. LTS = stable API (less drift risk for agent-generated code). Mature GPU instancing (`Graphics.DrawMeshInstanced`) for crowds.

**Fallback: Godot 4.x** — only if the Phase 0 spike surfaces a hard blocker (license activation in CI, or procedural scene authoring proves painful). Re-evaluate at the Phase 0 gate, once, cheaply.

### Quality tiers → URP Quality Levels
- **High** (iPad/Mac): shadows on, full agent budget, post-processing on.
- **Medium/Low** (Android/Windows): shadows off/reduced, agent budget scaled, no post. Deterministic seed keeps simulation identical across tiers; only rendering differs.

---

## 3. Platform Layering

```
┌───────────────────────────────────────────────────────────┐
│ Theme content (data + assets)                              │  City / Spaceship / Lab / Park
│   manifest + models/audio + locale/{en,zh-Hant} + [tool]    │
├───────────────────────────────────────────────────────────┤
│ Workshop (EXTERNAL — someone else builds it)               │  builds capabilities against §4 contract
├───────────────────────────────────────────────────────────┤
│ Capability Runtime (pure, deterministic, engine-agnostic)   │  Evaluate(capability, snapshot, rng) → decision
├───────────────────────────────────────────────────────────┤
│ Core Shell (theme-agnostic engine layer)                    │  camera, avatar, locomotion, nav, missions,
│                                                               │  HUD, minimap, save/progress, companion hook
├───────────────────────────────────────────────────────────┤
│ Engine runtime                                               │  Unity 6 LTS (URP) — scene graph, fixed tick, renderer
└───────────────────────────────────────────────────────────┘
```

### What lives in each layer
- **Core Shell (code, theme-agnostic):** camera rig (orbit + soft-follow, parameterized by manifest), `AgentController` (movement + animation state machine), navigation wrapper (expose `RequestPath(from, to, agentProfile)`), data-driven mission engine (trigger → condition → reward), HUD/minimap host (renders manifest-declared POIs), view-stack + dialog system, save/progress (local profile slots, no PII), companion service interface (optional, sandboxed — currently a hook only).
- **Capability Runtime:** the sandboxed executor that turns a child-built capability into a decision each tick. §4. Engine-agnostic, pure, seeded. **The layer most worth getting right** — every theme inherits it.
- **World Manifest (data):** terrain, props, agent types + their capability slots, systems/metrics (formula trees), missions (graphs), camera params, locale references. Schema in §5.
- **Workshop (external):** builds capability blobs against §4. We do not ship it.
- **Theme modules (data + assets, not code):** City, Spaceship, Lab, Theme Park. Manifest + art + locale + optional `theme_tool`.
- **Theme-specific tools (opt-in extension point):** e.g. City's 2D planner — self-contained, referenced by the City manifest, invisible to the shell.

### Code vs data — the rule that matters most
**Code (shell):** capability runtimes, locomotion/pathfinding, camera behaviors, mission engine, UI shell components, save system, companion safety-filter engine.
**Data (theme):** terrain/prop placement, agent spawn rules, mission *graphs* (not logic), metric *formulas* as a constrained expression tree (`{op, terms}`), locale strings, cosmetic catalogue.

A formula tree can't accidentally become theme-specific code smuggled into "data." This is a deliberate portability + safety choice.

---

## 4. Frozen Contract (v1) — Capability ↔ Simulation

**This is the interface the workshop team codes against. Do not change without a major-version bump and full migration.**

```csharp
// Engine-agnostic — no Unity types allowed in this file. Testable headless.
public interface ICapability {
    string TypeId { get; }          // "threshold_v1" | "classifier_v1" | "router_v1" | "optimizer_v1"
    int SchemaVersion { get; }
    JsonNode Parameters { get; }    // e.g. { "threshold": 0.62 }
    JsonNode TrainingTrace { get; } // worked examples the child used — replay/explainability, never PII
}

public readonly struct WorldSnapshot {
    public readonly IReadOnlyDictionary<string, float> Features; // themes define features; runtime never knows
}

public readonly struct CapabilityDecision {
    public readonly string Label;       // classifier output
    public readonly float Confidence;   // classifier output
    public readonly int RouteIndex;     // router output
    public readonly float[] Allocation; // optimizer/budget output
}

public interface ICapabilityRuntime {
    // Pure function. Same capability + same snapshot + same seed → same decision, forever.
    CapabilityDecision Evaluate(ICapability capability, WorldSnapshot snapshot, DeterministicRng rng);
}
```

**Why this shape:** a classifier trained in the City and one trained in the Spaceship are byte-identical `{type, parameters}` blobs — the runtime has no idea what a "building" or "cargo container" is. Only the *binding* — what feature vector a theme's agent exposes, and what it does with the returned label — is theme content, declared in the manifest's `capabilitySlot`.

**Determinism boundary:** `Evaluate()` must be a pure function — no wall-clock, no engine global RNG; only the passed `DeterministicRng` seeded from the run seed. Build it as a plain class with zero Unity `Node` dependency, and write it against a headless unit-test suite before it touches the engine.

**Capability types (v1):** `threshold_v1`, `classifier_v1`, `router_v1`, `optimizer_v1`. Start with `threshold_v1` (simplest) end-to-end before building the others.

**Optimizer note:** the City's existing metrics/optimizer/walkability engine is ported as **`optimizer_v1`** (algorithm + kid-language explanation strings, not the JS implementation). Whether the City 2D planner unifies with `optimizer_v1` is explored in Phase 3 — not forced.

---

## 5. World-Manifest Schema

```json
{
  "themeId": "spaceship",
  "shellVersion": "^1.2",
  "displayName": { "en": "Spaceship", "zh-Hant": "太空船" },
  "designTokens": { "accent": "#3E7CB1", "accentSecondary": "#F2A65A" },
  "terrain": { "kind": "heightmap", "asset": "terrain/deck.res", "bounds": [64, 64] },
  "navMesh": "nav/deck_navmesh.res",
  "camera": { "rig": "orbit_follow", "minZoom": 4, "maxZoom": 18 },
  "props": [
    { "id": "cargo_bay_01", "mesh": "props/cargo_bay.glb", "transform": "...", "tags": ["cargo", "interactable"] }
  ],
  "agentTypes": [
    {
      "id": "cargo_drone",
      "model": "agents/cargo_drone.glb",
      "animationSet": "shared/quad_locomotion_v1",
      "count": { "min": 40, "max": 80 },
      "capabilitySlot": {
        "type": "router_v1",
        "snapshotBinding": "spaceship.cargo_routing.snapshot_v1",
        "decisionBinding": "spaceship.cargo_routing.apply_v1"
      }
    }
  ],
  "systems": [
    { "id": "fuel_economy", "kind": "metric", "formula": { "op": "weighted_sum", "terms": ["fuel_used", "delay_penalty"] } }
  ],
  "missions": [
    { "id": "m1_intro_router", "trigger": { "type": "onEnter" }, "objective": "capability.router_v1.trained", "rewardCosmetic": "badge_router_01" }
  ],
  "locale": { "en": "locale/en.json", "zh-Hant": "locale/zh-Hant.json" },
  "themeTool": null
}
```

(Schema is illustrative — trim/extend as needed in Phase 1, but **version it**.)

---

## 6. Theming Contract

A theme is a **directory, not a code branch**:

```
themes/spaceship/
  manifest.json
  assets/            (models, textures, audio — within the shared style budget, §7)
  locale/ en.json  zh-Hant.json
  theme_tool/        (optional — bespoke mode, e.g. City's 2D planner)
```

**A theme author implements:**
1. A manifest satisfying the schema.
2. Per-agent `capabilitySlot` declarations (which capability type + snapshot/decision binding).
3. Localized strings for every text key, **both** EN and zh-Hant — no key ships with one.
4. Art assets within the shared style budget (poly ceilings, texture-atlas rules, shared bone-count ceiling for animation retargeting).
5. *(Optional)* a `theme_tool` implementing the shell-defined `ITaskWindow` interface (`open()`, `close()`, `get_result()`).

**Shared for free:** camera/locomotion/nav, mission engine, HUD/minimap, save/progress, companion hook, capability runtime, workshop editors (when they exist), design-system components, localization pipeline, determinism/replay framework, avatar cosmetics (skins/accessories — theme-agnostic by design).

**The hard rule:** if adding a theme ever requires touching shell code, that's a **shell architecture bug**, tracked as a shell gap — not patched one-off in the theme. Enforce mechanically: a CI lint step fails a "theme content" PR whose diff touches any path outside `themes/<id>/` (with a reviewed exception process for genuine shell-gap fixes).

---

## 7. Design System

### Tokens, not per-theme UI
One shared token set — color, spacing, radius, elevation, type scale, motion durations/easings, icon set — consumed identically by every shell UI component. A theme supplies a bounded **skin**: 2–3 accent colors over one shared neutral base, plus theme iconography and ambient VFX. Themes never override spacing/typography/motion/component structure. Enforce with a lint that flags hardcoded hex/pixel literals in UI files outside the tokens resource.

### Visual direction (explicit)
Rejecting glass/neon/purple-gradient "AI slop." Reference feeling: a well-made museum exhibit or a Nintendo Labo booklet — solid flat-shaded low-poly forms; warm-neutral base UI (off-white/warm-grey chrome, not pure white or dark glass); exactly one saturated accent per theme; soft directional light (no rim-light/neon glow); silhouette-readable outlines; rounded-but-not-bubbly corners; friendly geometric sans for EN, **Noto Sans TC / Source Han Sans TC** for zh-Hant (free, high-quality), chosen so the EN face matches its weight/x-height character.

### Accessibility, mechanical not aspirational
- Every semantic color (success/fail/warning/selected) is paired with an icon or shape — never color alone.
- Palette run through deuteranopia/protanopia/tritanopia simulation as a standing QA checklist item.
- `prefers-reduced-motion` → token-level "calm mode": shortened/removed camera flythroughs and particle bursts, state changes as instant cuts/fades — an alternate motion-token set the whole system swaps to.

---

## 8. Determinism

- **Seeded PRNG** everywhere (no `Math.random`/`DateTime.Now` in logic).
- **Fixed physics tick** (Unity `FixedUpdate` semantics).
- **Same-device reproducibility** is the requirement — a child/teacher can replay the same seed on the same device. Cross-architecture bit-identical replay is **not** required (explicitly out of scope).
- Capability `Evaluate()` is the only randomness consumer, and only via the passed `DeterministicRng` (§4).

---

## 9. Build Order

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | **Engine spike** (hard timebox, GO/NO-GO): Unity CLI build on dev Mac; 60-agent `DrawMeshInstanced` crowd at 30 fps on a real iPad (floor device); smoke-test one mid Android tablet + one cheap Windows laptop at Low preset | GO/NO-GO; Godot fallback only here |
| 1 | **Freeze `ICapability` contract v1** + shell skeleton on a deliberately ugly grey-box theme (so nothing shell-side is theme-shaped) | Contract doc + reviewed; grey-box theme runs |
| 2 | **`optimizer_v1` runtime + City as first real theme** + 2D planner as `theme_tool` (proves the extension-point contract) | City playable end-to-end |
| 3 | **Design system + i18n + a11y hardening** (tokens, components, colour-blind/reduced-motion QA) | QA checklist passes |
| 4 | **Spaceship theme, data-only**, built by someone *not* a core shell engineer, using only manifest + content | Built without touching shell code |
| 5 | **Distribution pipeline** + classroom pilot | Installed on a real iPad + Android tablet + Windows box |

Note: Windows + Android build/test is the free iteration loop from Phase 0 onward (no Apple account needed). iPad signing/ASM only matters at Phase 5.

---

## 10. Distribution

| Platform | Channel | Cost / notes |
|---|---|---|
| iPad (primary) | **Apple School Manager + Custom Apps** (B2B, via school MDM) | Apple Developer Program **$99/yr** (single account, covers everything). Deferred to Phase 5. |
| macOS | Notarized direct download | Same $99 account covers notarization. |
| Android (must work) | Managed Google Play / signed APK sideload | One-time $25 Play fee, or free sideload. |
| Windows (must work) | Signed installer (MSI) | Code-signing cert (or Microsoft Trusted Signing) to avoid SmartScreen warnings. |

**Build-other-devices-first:** development and testing run on Windows + Android from Phase 0 — free, no Apple account. Register the Apple account only when ready to test on a physical iPad and run the ASM rollout (Phase 5).

---

## 11. Open Decisions & Risks

| Item | Status / default |
|---|---|
| iPad floor device | Confirm actual school procurement model before Phase 0 (default: iPad 9th-gen, A13, 3 GB) |
| Android floor device | Pin a model (e.g. Galaxy Tab A / Lenovo M-series) before Phase 0; enable GLES3 fallback |
| Windows floor | Celeron/Pentium-class, Intel UHD 600-class, 4 GB (Low preset) |
| Apple Developer account | Register at Phase 5; build Windows/Android first (free loop) |
| Workshop contract handoff | §4 is frozen v1; workshop team builds to it; integration later |
| `optimizer_v1` vs City planner unification | Explore in Phase 3; don't force |
| Agent-count budget | 60 on iPad/Mac (Tier 1); scaled down on Tier 2 |
| School IT/MDM maturity | Discovery step before finalizing Windows/Android distribution |
| Post-v1 capability types | Extend contract via versioned `_v2` types; never mutate `_v1` |
