# Verification record — 2026-09-23

Sources inspected before editing:

- Passiona: `7a54e37` (`AI-city-and-planner`), with pre-existing untracked
  `P5 Programme/docs/translations/` left untouched.
- Edward: `/private/tmp/edward-ai-education`, latest fetched `origin/main` `bcda729`.
  Working tree was clean. Integration source changes are mirrored there; no push/deploy.
- Studio reference: `/private/tmp/passiona-studio-review`, `a19b6fe`, clean and unchanged.

All implementation changes are currently **uncommitted**. Passiona’s canonical app
sources and tests contain the reviewable result; its deploy directories are build output.

Passing checks:

- Passiona unit suite: 419 tests, no failures or skips.
- Studio suite: 2,159 checks. Fixed the existing runner to await async specs; added
  async completion/rejection regression checks. Model Shop duplicate-download,
  cancellation, timeout, concurrency and unsupported-version checks now actually finish.
- Workshop pure suite: 1,316 tests; the added manifest fields required updating two
  expected field lists. The changed host test passes (9 tests).
- Shared economy/transport/context tests: zero-credit migration, stable IDs, duplicate
  awards/purchases, insufficient funds, foreign values, unsupported schemas, memory
  correction/deletion, and settings/ownership surviving gateway validation.
- Real Studio snapshot → JSON Champion File → restore: typed geometry/index arrays,
  skeleton, appearance and fitted GLB wardrobe. Signed zero is preserved as well.
- Real Chromium two-tab storage tests with and without Web Locks, wrong PIN, injected
  storage failure, legacy ownership import, unsupported outer/nested formats.
- Exact twelve-step localhost demo at 1024×768, including real private synthetic-data
  evaluation, direct Buddy edit/undo, memory, teacher award retry, purchase, repeated
  placement, placement undo/redo, portable save and return. No uncaught browser errors.
- Switching during a pending Buddy reply drops the reply/action. Replacing a snapshot
  with the same Champion ID invalidates stale transactions through a separate generation.
- Live configured-provider browser check: DeepSeek V4 Flash correctly named **60 credits**,
  **rocket-cone**, and **f1 Feeder** from the real Workshop request.
- Library audit passed (two existing orphan warnings).
- Production City + Workshop + Studio local packaging passed; nothing deployed.
- Built City Chromium smoke: 2 tests passed, including boot and instanced meshes.

Bug fixes found during the sprint include stale private-result handles breaking Buddy
context after reopening; the gateway reducing block/gear context to counts; missing
manifest fields dropping economy context; stale revision recovery; silent fitted-gear
export failure; and the non-awaited asynchronous Studio test runner.

Evidence logs/screenshots are under `/tmp/passiona-demo-verification/` and
`/tmp/demo-final-all.log`, `/tmp/studio-awaited-tests.log`, `/tmp/passiona-final-unit.log`,
`/tmp/workshop-live-browser.log`, `/tmp/passiona-city-smoke.log` on this machine.
These are disposable test artifacts, not student records.

Not claimed: a physical-tablet playtest, the entire City browser suite, live deployment,
privacy hardening, or the queued original City–Studio GLB editing integration.
