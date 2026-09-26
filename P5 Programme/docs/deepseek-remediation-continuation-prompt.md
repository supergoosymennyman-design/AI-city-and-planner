# Continuation prompt — Passiona Stage 6 remediation (post-review)

You are continuing the Passiona P5 programme in
/Users/kai/Documents/AI-education-shrink (macOS, zsh, git repo). Branch
plan/passiona-deepseek. This prompt is self-contained; you have no memory of the
prior conversation. Do the work below in order; do not skip the concurrency check.

## MISSION
Close the accepted findings from two external reviews of the Stage-1-to-6 work.
The product core (evidence-based economy, `.cap` v2, recycling, driving, stages)
is done and tested; this is targeted hardening plus adopting an in-flight change
from another agent. Same rhythm as every stage: read → change one thing →
verify → commit → short handoff note.

## READ FIRST (mandatory, in this order)
1. repo `AGENTS.md` and `P5 Programme/AGENTS.md` — golden rules: canonical source
   is `P5 Programme/buddy-kit/client/`; NEVER edit `deploy/` (build output); no
   child PII; models CC0 only; no AI-slop.
2. `P5 Programme/docs/deepseek-s6-handoff.md` — what Stage 6 shipped, the
   remaining-issues list, and the S6c addendum (which already marks the Studio
   adapter RESOLVED). Your remaining work is items 1, 3 and 4.
3. `P5 Programme/docs/deepseek-s6-review-remediation.md` — the ledger reward-scope
   and typed-evidence contract. DO NOT weaken it.
4. `P5 Programme/docs/deepseek-studio-wallet-adapter-prompt.md` — the spec/checklist
   for the Studio adapter you REVIEW in Step 0 (it is now committed, not pending).
5. `~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` §2 (rewards/market),
   §3 (envelope; MINIMUM shared interfaces), §4 (stages), §5 (completion).

## LOCKED DECISIONS (do not relitigate — the owner decided these)
- Economy is PER-PROJECT, not global. "Shared wallet" means shared across APPS
  within one project (plan §3: switching projects swaps the wallet + progress).
  REJECT any proposal to lift the wallet to a global/child-level store.
- `copyProject` keeps the FULL clone (wallet + claimed + achievements travel), as
  plan §3 states ("a project copy preserves achievement IDs and claimed rewards").
  Document that a copy is an independent fork with no single-project advantage.
  Do NOT reset the copy's economy.
- Keep the ORDERED badge ladder (Builder→Skeptic→Auditor→Architect) but fix the
  skip: a higher tier must require the whole lower ladder's evidence.
- Keep the optional City-road driving mode. Keep planner-driven milestones.
- `skill-saved` AND `tutorial-task` must become existence-checked (see Steps).
- Do not change reward amounts, scope ids, or the `.cap` v2 contract.

## CONCURRENCY PROTOCOL (a real hazard here; two near-misses already)
Another agent (v4.1 flash) has been editing this working tree concurrently.
- BEFORE anything: `git status`, `git log --oneline -5`, and a quiescence check —
  snapshot mtimes of `P5 Programme/buddy-kit/client` + `tests` (JS/mjs), wait ~60s,
  re-snapshot; if anything changed, STOP and ask the owner to pause the other agent.
- If you find files you did not write, do NOT commit a mixed tree. Reconcile first.
- Never commit while another writer is active.

## STEP 0 — adopted state (ALREADY DONE + VERIFIED — do not redo)
`f704594 feat(platform): Studio/Workshop envelope wallet adapter (S6c)` landed the
adapter; `098b686` added its prompt doc. An independent pass verified it:
  - `node --test tests/*.test.mjs`  → 561 pass / 0 fail (was 553)
  - `npm run test:imports`          → OK (168 files)
  - `npm run test:library`          → PASS
  - `npm run build:city`            → OK
  - studio `npm test`               → 2159 pass / 0 fail
  - browser (source + built): wallet, market-actions, full-journey, studio-wallet → pass
  - `studio/dist` rebuilt; the handoff's remaining-issue item 2 is marked RESOLVED
    with an S6c addendum.
Treat that as the BASELINE. Only re-run it if you suspect drift; do NOT rebuild or
re-commit it. Start the real work at Step 1.

## STEP 1 — existence checks for the last two reward types
Today only held-out-eval / city-install / abstain-demo are existence-checked
(inside `recordChallengeOutcome`, `city-common/project-store.js`). `skill-saved`
(`workshop/publish-capability.js` commit(), ~line 94) and `tutorial-task`
(`city-pregame/app.js` ~line 172) are validated by shape+scope only.
- Add `recordSkillSaved(capabilityKey)` to the store: ONE `mutate`; look up
  `current.capabilities[key]`; if absent, refuse; if present and its self-test
  passes, record `skill-saved` scoped to `challengeOfCapability(cap)`
  (`city-common/challenges.js`). Repoint `commit()` at it for BOTH the new-publish
  and the reused-key branches.
- Add room completion to the envelope (`project.progress.tutorialRooms = {N:true}`)
  and `recordTutorialTask(room)`: verify the room is completed in the envelope
  inside one `mutate`, then record `tutorial-task` scoped `academy-room-<N>`.
  Update `city-pregame/app.js` to mark completion AND call the store path.
Tests (unit): a fabricated skill-saved ref and an UNCOMPLETED room cannot mint;
a published capability and a completed room can. Mirror each in
`tests/project-economy.test.mjs`.

## STEP 2 — achievements, badge ladder, and store cleanup
- BADGE LADDER FIX (`city-common/achievements.js` `badgeAchievement`): return the
  highest tier only when the WHOLE ladder below it is satisfied — architect needs
  both challenges installed AND `held-out-eval` AND `abstain-demo`; auditor needs
  `held-out-eval` too. Update `tests/achievements.test.mjs` to prove you cannot
  reach architect without the lower evidence.
- `writeBadges` (called inside `recordChallengeOutcome`): the envelope copy is
  authoritative; move the localStorage MIRROR out of the `mutate` callback (run it
  after commit) and `console.warn` on failure instead of a bare `catch {}`.
- Read freshness: make `readEconomy`, `readSection`, `readCapabilities`,
  `readInstallations`, `readChallenges`, `readAchievements` re-read IndexedDB
  rather than the cached `active` (the two-tab guarantee is correct by IDB scope
  locking, but cached reads can be stale after another tab writes).
- `city-common/ledger.js`: in the `already-paid` repair branch, build a NEW economy
  object instead of pushing in place (match the other success paths).
- `city-common/skill-stages.js` `stageOf` already calls `installCapability` once
  (a prior review said twice — that was a prompt artifact, NOT the code). If
  `installCapability` re-runs self-tests, add a small memo so a render is cheap.
Commit: `feat(platform): existence-check remaining rewards + badge ladder + store cleanup (S6c)`.

## STEP 3 — two-tab concurrency proof (turns an argument into evidence)
New Playwright spec: two PAGES in ONE browser context (shared IndexedDB), firing
`recordChallengeOutcome` and `purchase` concurrently; assert no lost award and no
double-spend. The store already reads+writes inside one IDB `readwrite` transaction
(`project-store.js` `mutate`, get and put on the SAME `tx`) — this test proves it
empirically. Commit separately.

## STEP 4 — durability (iOS ~7-day eviction)
New `city-common/persistence.js`: `requestPersistentStorage()` (guarded
`navigator.storage.persist()`, fire-and-forget) + a quota estimate helper. Call it
at boot from each app shell (city-builder, planner, pregame, hub, market). Add a
startup IDB health check: if the envelope is empty on a returning device, offer
restore from Champion File / cloud code. Unit test the helper (no-op under Node).
Document in the handoff that `persist()` is only a SUGGESTION and the Champion File
+ cloud codes remain the real safety net.

## STEP 5 — purity + migration/oversized proof
- Extract the non-transactional body of `recordChallengeOutcome` into a pure
  `applyChallengeOutcome(current, challengeId, outcome, events)` called INSIDE
  `mutate` (keep the evidence-existence check inside the transaction — do NOT move
  it above the transaction; that reintroduces TOCTOU). Unit-test it without IDB.
- Fold in the abstention gate: `abstain-demo` requires ≥1 CORRECT graded answer in
  the SAME run (not merely `abstained > 0`). Update the recycling and test-track
  callers to pass the correct/graded counts, and the unit tests.
- Playwright migration spec: seed an OLDER serialized envelope (no `challenges`,
  no `projects.badges`, legacy economy) into IndexedDB, boot the City, assert the
  upgrade + earning work without throwing.
- Oversized-project export test (CI): build a near-cap project and assert the
  downloadable file is complete — "never silently omit models/progress".
Commit: `feat(platform): pure challenge-outcome, migration + oversized-export proof (S6c)`.

## STEP 6 — documentation
Update `P5 Programme/docs/deepseek-s6-handoff.md`: copy semantics documented
(independent fork, plan §3); remaining-issue #2 resolved; the new existence checks,
badge-ladder fix, two-tab proof, migration/oversized tests, and `persist()` caveat
recorded. Update/retire `deepseek-studio-wallet-adapter-prompt.md` (it was a
checklist; the work is now in). Commit as `docs: ...`.

## OPTIONAL (owner's call) — guard the drive deep-link
The only remaining functional gap (handoff remaining-issue item 1). The City's
`?skill=drive` hand-off loads the Driving starter and replaces whatever was on the
Workshop table; it autosaves first, so nothing is lost, but the swap is silent. A
safe fix needs a small "is this the child's own machine" accessor added to
`workshop/game.js` (17k lines — be conservative, additive only), then gating
`openDriveStarter()` in `workshop/publish-capability.js` on it. Bounded, its own
commit. Do this only if the owner asks; it is NOT required for Steps 1–6.

## VERIFICATION (run after EVERY change; report raw output)
    cd /Users/kai/Documents/AI-education-shrink
    node --test tests/*.test.mjs        # 561 pass / 0 fail at f704594 (was 553); re-check after your changes
    npm run test:imports
    npm run test:library
    npm run build:city
    # source browser checks
    E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
      --project=chromium full-journey.spec.mjs recycling.spec.mjs test-track.spec.mjs \
      wallet.spec.mjs market-actions.spec.mjs badges-capabilities.spec.mjs studio-wallet.spec.mjs
    # built bundle (rebuild first)
    E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8398 npx playwright test \
      --config "P5 Programme/tests/e2e/playwright.config.mjs" --project=chromium full-journey.spec.mjs market-actions.spec.mjs wallet.spec.mjs
Gotcha: bare `/workshop/` is the legacy embed stub; add a query string to reach the
canonical Workshop.
Gotcha: `npm run test:demo` includes `tests/champion-storage-browser.mjs`, which
expects a server on :8378. A connection-refused there is a harness environment
expectation, NOT a regression from any of your changes — do not chase it.

## ALREADY CORRECT — DO NOT "FIX" (verify by reading, then cite, don't rewrite)
- Recycling routing: `routeDecision(decision, abstained, mapping)` takes NO
  ground-truth parameter, so routing by truth is impossible by construction;
  covered by `tests/recycling.test.mjs:57`. Not prose-only; leave it.
- Driving stop-order: collision → off-road → model stop → goal, with the exact
  boundary regression at `tests/driving.test.mjs:76` ("a model that stops inside
  the goal margin is an emergency stop, never a goal"). Leave it.

## DO NOT DO (declined / out of scope)
- No global/per-child wallet. No changing `copyProject` economy semantics.
- No flattening the badge ladder into orthogonal badges. No cutting the City-road
  mode. No cutting planner milestones. No changes to reward amounts, scope ids, or
  `.cap` v2. Never edit `deploy/` for a fix.

## DELIVERABLES
Ordered commits (each its own, each verified): existence checks; achievements+cleanup;
two-tab proof; durability; purity+migration; docs. (The Studio adapter is already
committed as `f704594` — do NOT re-commit it. The drive deep-link guard is optional
and only if the owner asks.) No production deploy — publishing is a separate action.
Report at the end with test counts and commit hashes.
