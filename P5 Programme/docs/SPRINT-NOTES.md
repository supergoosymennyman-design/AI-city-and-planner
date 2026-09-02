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
