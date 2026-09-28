# Integration hardening verification

Implementation is in canonical source. Deployment remains gated on successful
verification; no production deployment was performed during this work.

## Review groups

1. `city-common/project-store.js`, `project-binding.js`, `workspace.js`:
   transactional recovery, wallet migration provenance, bound operations,
   coordinated activation and workspace adapters.
2. `backup-coordinator.js`, `custom-models.js`, `champion-city/custom-skin.js`,
   `workshop/toolbox/champion-session.js`: complete archives, scoped persisted
   work and assets, staged new-project restore and rollback.
3. Hub/City/Planner/Academy/Workshop/Studio controls: shared download/restore,
   editor flush and validation, City-snapshot cloud labels.
4. Achievements, reward persistence, Workshop publication/handoff and Market:
   evidence denominators, replay-safe retry, source-machine resumption,
   ownership-checked equipment and normal prop placement previews.
5. Regression tests and the Studio build step in `deploy-city-apps.sh`.

Existing city-model edits were preserved. Additional City activity and Workshop
exercise changes appeared concurrently in the working tree. Their new activity
persistence path was connected to the shared reward flush. Older journey tests
were updated to exercise that current UI.

## Evidence and release limitations

- The latest complete unit run passed 593 of 594 tests. Its only failure was
  an existing optimizer runtime bound (seed 11: 530 ms against 500 ms).
  Another Node test run was active in the shared workspace during verification.
  The added reward-retry and delayed-switch regressions pass in the focused
  storage run. An earlier 589-test unit run passed completely.
- Import graph, library audit, build and whitespace checks passed.
- Built Chromium/WebKit project isolation, archive/reference integrity,
  rollback and concurrent-wallet coverage passed in focused runs.
- Actual Hub download/upload restores editable Champion sections in an empty
  browser. Actual Studio download/upload restores editable geometry and a
  runnable Workshop machine (isolated built-browser run passed).
- Both installed activity models were revised, downloaded, restored into a
  fresh browser and rerun; predictions changed with revisions and restored
  claims did not mint rewards again. Driving source-machine handoff passed.
- The broader source run passed accessibility (English/Chinese, tablet and
  failed-restore controls), activity backup, badges and Buddy checks, then hit
  an Evidence-tab click timeout in the 18-building `building-purposes` fixture.
  The remaining source sweep was stopped after that failure.
- A later combined built run also encountered timeouts. A fresh source activity
  run reproduced the recycling screen stuck at “Loading…”; replacing its
  per-frame WebGL context query with context-loss events did not resolve it.
  Those repeated runs were stopped after reproducing the failures. Passing targeted runs
  do not establish that the full release suite is green. Resolve these timing
  failures, then complete source and built release checks before deployment.

The reproducible commands are in the root `package.json`. See
[project-backup-and-recovery.md](project-backup-and-recovery.md) for the backup
contract and limits. No cloud API or storage limit was expanded.
