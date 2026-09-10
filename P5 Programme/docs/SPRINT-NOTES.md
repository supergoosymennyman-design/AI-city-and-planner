# Sprint notes (autonomous run, 2026-09)

## Git: commits deferred
The git working tree contains ~200 pre-existing deletions (.ai/, .claude/ agent
config from before this work) and the ENTIRE "P5 Programme/" folder is untracked
(229 files incl. large reference zips/PDFs). A blanket `git add -A` commit would
lock in unrelated deletions and add huge reference files — too risky to do while
the repo owner is AFK. DECISION: no commits this sprint; work is preserved in the
working tree + deploy output. A deliberate commit (scoped to P5 Programme/ with a
proper .gitignore for the big reference files) should be done with the owner.

## Sprint log
- Sprint 0: wrote docs/capability-bridge.md, docs/badges-and-tiers.md, updated
  docs/tool-integration-map.md. No code touched.
- Sprint 1: badges — city-common/badges.js + champion-file badges key + HUD corner
  emblem (lowest tier) + Logbook shell. (in progress)
- Sprint 1 DONE: badges.js + champion-file `badges` key + HUD corner emblem (lowest tier "Builder") + Logbook shell. Unit tests pass (6 new), e2e green, deployed live.
- Sprint 2 DONE: cap-runtime.js (parse/validate/descriptor, Stage 1) + unit tests (3 new) + Capability Panel UI (📦 plant a machine, honest "not connected yet" display). e2e green, deployed live.
- Sprint 3 DONE: runInference() numeric k-NN + runSelftest() in cap-runtime.js (8 unit tests) + "Try my machine" demo in the Capability Panel. Live 3D gate mount deferred (needs Workshop exporter + real event source — per spec cut line). e2e green, deployed live.
- Sprint 4 DONE: champ-recipe.js (.champ parser/validator, handoff side) + champion-recipe.md spec + 4 unit tests. No behavior change → no deploy needed.
- Sprint 5 DONE: 4-word mnemonic cloud codes (backward-compatible with legacy NOVA-XXXXXX) + "Continue my city" resume entry + word-code UI hints. Unit 100+ / e2e 10 green, deployed live.

## FINAL STATUS (all sprints complete)
- Sprint 0: spec docs ✅ (capability-bridge.md, badges-and-tiers.md, tool-integration-map.md, champion-recipe.md)
- Sprint 1: badges ✅ (model + transferable Champion File key + HUD emblem lowest tier + Logbook shell)
- Sprint 2: .cap Stage 1 ✅ (cap-runtime parse/validate + Capability Panel plant, honest "not connected")
- Sprint 3: .cap Stage 2 ✅ (numeric k-NN runtime + selftest + "Try my machine" demo; live 3D mount deferred to Workshop-team export)
- Sprint 4: .champ recipe ✅ (schema + parser + shared premade-gear ids; 3D assembler deferred to authoring tool export)
- Sprint 5: word-mnemonic codes ✅ + resume entry ✅
- Commits: DEFERRED (git tree has pre-existing deletions + untracked P5 Programme folder — needs owner to decide tracking scope)
- Deploys: all sprints deployed to p5-city-sim; live-verified (word codes, resume, badges, capability panel)

---

# Sprint notes — AI-depth cycle (2026-09-10, gemini-pro agent run)

A second, deeper cycle targeting the AI spine: teach the algorithms more clearly,
make the planner's optimisation real (not just linear), and make the AI visible.
Plan of record: the five themes in `docs/ai-concept-map.md` +
`docs/city-design-benchmark.md` + `docs/planner-ux-teardown.md` (all written this cycle).

- **Sprint 0 — research + audit (docs).** Wrote `city-design-benchmark.md`
  (genre lessons under tablet constraints), `ai-concept-map.md` (real AI vs
  named-AI gap matrix + the L1–L4 honest ladder), `planner-ux-teardown.md`.
- **Sprint 1 — City Planning Academy.** New pure `city-pregame/lesson-core.js`
  (unit-tested) + `app.js` rewrite: Room 1 gets a draggable weight lab; Room 3
  now SHOWS Dijkstra expanding (settle-before-mark, 350m winner) then the ant
  challenge; Room 4 adds the escape-the-local-optimum beat (Explore restart);
  a 4-room journey strip + per-room "why this matters in the planner" bridge.
  8 new tests (`tests/pregame-lesson.test.mjs`).
- **Sprint 2 — Planner legibility.** `walkability.js` gains `homeReachRoutes()`
  (4 new tests). Planner Walk view draws the selected home's REAL routes (green
  within 400m, red dashed when too far). Goals modal gets a live score preview
  (updates as mayors/sliders change). Receipt gains a "fastest way to raise your
  score?" predictor wired to My move.
- **Sprint 3 — Optimizer Explore.** `optimize.js` gains a `strategy:'explore'`
  multi-restart search (restart #0 = the caller seed, so Explore ≥ Greedy
  always; never worse than input; deterministic; roads still sacred). Plan modal
  gains Greedy/Explore chips that compare the two plans; 5 new property tests.
- **Sprint 4 — Hub honesty.** Replaced the dead "Scenarios" accordion (4 removed
  apps) with a live **AI Journey** trail (Academy → Planner → 3D City + the four
  real recipes). Confirmed the 3D quest entry already shows honest "⏳" for
  undeployed minigames and echoes the planner score/goals.
- **Sprint 5 — Recognition.** Planner milestone toasts (ratcheted in
  localStorage, recognition-only, never gates): first home, every home served,
  fully walkable, quiet, spread, score 80+, score 95+. Coach copy mentions Explore.
- **Sprint 6 — Verify + fix.** Fixed a real e2e harness bug (`static-server.mjs`
  docroot resolved to the wrong path in source mode) and a real deploy gap
  (`deploy-city-apps.sh` was not copying the new `pregame/lesson-core.js`).
  Unit **128 pass**, library audit PASS, full built-bundle e2e **12/12 pass**
  (incl. the 3 journey specs that were previously skipped), import-graph OK.

Commits: still DEFERRED (same untracked-folder reason as the first cycle).
Deploy: city-sim + home deployed and live-verified (see run log).

