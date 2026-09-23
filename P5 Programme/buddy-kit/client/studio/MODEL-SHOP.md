# Model Shop

Ported selectively from David's PR #6 (`df6b9cb6`). The current Studio retains its
generation, rigging and motion tools. The older Studio copy and its dependencies
were not imported.

Open the left rail to browse models. Search or select a model category, preview a
card, then choose **Add** or drag its handle onto the viewport. Add seats the model
beside the existing build; dragging seats it at the drop point. The six bundled
models are small placeholder primitives, not a finished art collection.

Purchases use demo credits and levels. **Tree** displays the proposed eleven-node
ML skill tree. Neither credits nor achievements are connected to lessons. The
development server exposes clearly labelled demo controls; production builds hide
them. This is not evidence of curriculum mastery or a secure reward ledger.

## Document ownership

Each placement is one ordinary Studio undo unit. Geometry, appearance and transforms
use the existing document snapshots and IndexedDB autosave. Undo/redo, delete,
duplicate and reload therefore behave like other imported shapes. Shop initialization
never restores meshes. New scene invalidates pending shop loads; resetting demo
progress leaves the scene intact.

The shop's `studio.shop.v1` localStorage entry contains purchases, progress and panel
preferences. Legacy `placed` records are cleared and never replayed. Shop progress
is browser-local and is not included in a cross-product passport.

Purchases, rewards and panel changes re-read saved state inside a browser Web Lock,
so simultaneous tabs cannot overwrite each other's purchases. Storage events refresh
open panels. Browsers with shared storage but no Web Locks refuse edits with feedback;
failed storage writes also refuse the transaction. Unknown schema versions are kept
unchanged, including on boot. Controller mutations and the achievement seam return
promises and must be awaited.

Model imports share one pending download per filename. Each consumer receives its
own clone. A 15-second deadline covers thumbnails and previews as well as placement;
clearing the loader cancels pending consumers and disposes late results.

The shared Workshop/champion-file credit system is deferred for discussion. These
fixes preserve the existing demo economy and do not choose earning or starter-credit rules.

## Content and future connection

- Put static GLBs under `public/models/` and register them in `catalog.json` there.
  Categories come from the model catalogue, independently of learning categories.
  Rigged models use the Studio's normal Import GLB flow.
- `public/skill-tree.json` holds the proposed learning graph. Node IDs must remain
  stable; names and rewards are content decisions, not inferred lesson completion.
- `window.__skillTree.applyAchieved(ids)` is the future producer seam. It accepts
  known node IDs, settles prerequisites and grants each reward once. Repeated IDs
  grant nothing; unknown IDs are reported as ignored. No producer is connected.
- No cloud service, account or additional package is required for the shop.

## Verification

`npm test` includes the ported pure-module tests and current-Scene regressions for
placement, undo/redo, reload, deletion, invalid assets and stale/timed-out loads.
With a development server running, `node checks/shop.cjs http://127.0.0.1:5187`
checks the real tablet interface and catalogue-failure recovery. `npm run build`
checks the production bundle.

Verified locally on 2026-09-23: 2,123 Studio checks passed; production build passed;
tablet checks passed for categories, search, add, purchase, drag, undo/redo, reload,
skill rewards, catalogue retry and missing-model feedback. The subsequent commit preparation corrected the stale Workshop gallery assertion
to require the new 10/4/4 Training/Dev/Test split.
