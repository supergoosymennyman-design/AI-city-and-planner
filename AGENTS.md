

# AGENTS.md — AI-Education Games Platform

Web-app games teaching AI literacy to **kindergarten (K2/K3)** and **primary (P1–P6)** children — one game per lesson.

> **⚠️ Second, separate project: the Passiona P5 Programme** lives in
> `P5 Programme/` — a Hong Kong school AI-literacy programme for P5 (~age 10),
> built as a 3D AI City + AI Champion (live at
> https://p5-home.clover-marquis.workers.dev/). It is NOT part of the
> kindergarten/primary pipeline below. Read `P5 Programme/AGENTS.md` before
> working there — it has its own layout, deploy script, and verification rules.

## Repo layout
```
source/       Lesson source docs (kindergarten + primary) + examples + toolbox reference
games/        Built game output (kindergarten/<id>/, primary/<id>/)
docs/         Curriculum reference (lessons.json registry)
.opencode/agents/   Canonical agent definitions (source of truth)
.opencode/agents/   Canonical agent definitions (source of truth) — the .ai/.claude symlink dirs were removed 2026-09
```

## Workflow
1. **Run the orchestrator** with a source lesson path → it drives the pipeline.
2. **game-planner** asks 30+ questions across 6 rounds, refining a game spec → writes `games/<track>/<id>/PLAN.md`.
3. **game-builder** builds the game from PLAN.md (agent chooses architecture).
4. **game-tester** tests the built game.
5. **game-breaker** adversarially tries to break it.

## Golden rules
- **Agents decide architecture.** No enforced framework, no contract, no monorepo.
- **Source material is in `source/`.** Port concepts, don't clone code.
- **Toolbox in `source/toolbox/` is reference.** Use it if helpful, ignore if not.
- **No child PII.** Camera/mic data stays in-memory.
- **Each game is self-contained** in `games/<track>/<id>/` with its own tooling.
- **Design quality matters.** Games must avoid AI-slop patterns (purple gradients,
  glassmorphism, bounce UI, flat type hierarchy) and use age-appropriate polish.
  See the builder's design quality section and the Impeccable anti-pattern catalog
  at `https://impeccable.style/slop`. Optional: `npm install` at project root adds
  the Impeccable CLI for automated design checking (`npm run detect`).

## The 5 agents

| Agent | Expertise |
|---|---|
| **orchestrator** | Parses requests, validates lessons, runs the pipeline, reports results |
| **game-planner** | Deep K2/K3/primary curriculum knowledge, 6-round Q&A with 30+ domain-specific questions, writes PLAN.md |
| **game-builder** | Knows established patterns from examples, tablet-first design, fallback patterns, multi-modal handling, builds bespoke games |
| **game-tester** | Verifies AI narrative arc (K2: "AI doesn't know → learns → demonstrates"), multi-modal fallbacks, two-channel a11y, primary sim mechanics |
| **game-breaker** | Thinks like a malicious child — wrong inputs, out-of-order, silence, rapid mashing, creative destruction, device failures |

## Source material reference
- `source/kindergarten/` — 20 K2 lesson scripts, Phase 1 (2D inputs) and Phase 2 (3D/body/sound)
- `source/primary/` — primary lesson docs (20 lessons, AI City Architect capstone)
- `source/examples/poor examples/` — what NOT to do (spaghetti code, no AI, server dependency)
- `source/toolbox/` — reference AI implementations (STT, TTS, camera, joints)
