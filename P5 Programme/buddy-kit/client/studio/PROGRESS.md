# 3D Studio · task board (PROGRESS.md)

2026-09-23 — Workshop–Studio demo implemented locally (uncommitted; no deployment).
Shared Champion identity/economy, atomic IDB revision checks, teacher-PIN awards,
portable Studio binary work and authoritative Buddy context are integrated. The
12-step Chromium demo, concurrent tabs, failure paths and live DeepSeek check pass.
Passiona canonical sources and detailed verification:
`/Users/kai/Documents/AI-education-shrink/P5 Programme/docs/workshop-studio-demo/`.
Studio's async test runner was fixed; 2,159 checks now complete. City–Studio GLB
editing remains queued. This records implementation/testing, not human playtest approval.


> Each task is a block:
> `- [ ] **task NNN — Title**` · then `created by / approved by / start / end` · then
> `description`. States: `[ ]` open, `[~]` in progress (name the plan/ledger), `[*]` done — mark
> it in the same commit that lands the work, and fill `end:` then. `created by` and `approved by`
> are PEOPLE, never sessions or agents; `approved by:` is the human gate — a done task with
> `approved by: —` has NOT passed the owner's eye yet. **Numbers run
> consecutively down the document**; inserting renumbers what follows. The done blocks ARE the
> studio's development history (all dates 2026); commit detail lives in git and the ledgers.
> Laws, dead ends and trip-wires are in the appendix.
>
> **Run** `npm test` (= `node run-tests.mjs`, 224 unit tests; renamed from `test.mjs` so the repo's
> `node --test` sweep of `web/` does not pick it up without three.js installed) + `npm run build` before landing work.

## 0 · What the studio is

**23 September - Model Shop port:** selectively ported PR #6 into the current Studio.
Model categories now come from its catalogue; placements use the current document
undo/redo and autosave, without a second placement ledger. The skill tree and demo
credits remain disconnected from lessons. Existing generation, rigging and motion
work is preserved. See [MODEL-SHOP.md](MODEL-SHOP.md) for ownership and checks.
This is local implementation, not deployment or human playtest sign-off.

**22 September — Auto-rig implemented locally:** Rig mode now offers selected-model
UniRig generation using a temporary ≤5,000-point copy and the existing local bending
solver on the original geometry. Cached CLI credentials work through a development-only
proxy; published builds use a tab-held token. Live UI generation returned 36 joints on
the dinosaur while preserving its 101,744 vertices and material. Target scope survives
undo, redo, reload and studio GLB import; unrelated unrigged shapes stay unskinned.
Cancellation, stale responses and GPU failures are covered by headed checks.
[Implementation and verification](../../../docs/reviews/2026-09-22-auto-rig-implementation.md).
This is an implementation update, not a new human playtest approval or a deployment.

**19 September review:** the AI-generation plan needs the corrections recorded in
[`2026-09-19-3d-studio-ai-generation-review.md`](../../../docs/superpowers/plans/2026-09-19-3d-studio-ai-generation-review.md)
before implementation. Existing settings fallback, static import placement through snapshots, and
imported duplicate persistence are fixed with regression coverage (654 Node checks pass). This does
not mark task 013 built or approved.

3D Studio is a browser-based 3D modeller for primary-school children: make a character from
shapes, rig it with a joint skeleton, pose it, animate it with built-in gaits, and fit gear
pieces onto it. The finished character exports as a `.glb` you can drop into other tools.

- [*] **task 001 — The build experience**
  - created by: - · approved by: - · start: 09-01 · end: 09-03
  - description: add primitives (box, sphere, cylinder, torus, …), import existing models by
    drag-and-drop, and edit each object's name, colour, position, rotation and scale with the
    gizmo or the properties panel.
- [*] **task 002 — Rigging, posing and animation**
  - created by: - · approved by: - · start: 09-02 · end: 09-03
  - description: attach shapes to a joint skeleton (two-leg and four-leg templates), group
    shapes so they move together, detach them again, bend joints by dragging, and play built-in
    gaits (walk, trot, pace, gallop, run).

## 1 · Gear fitting

- [*] **task 003 — Gear binds to character bones**
  - created by: - · approved by: - · start: 09-02 · end: 09-03
  - description: in Fit mode, load a gear piece (helmet, shoulder pads, …), bind it to a bone so
    it moves with the character, tune its placement with the gizmo, unbind it to make it float,
    or remove it. One piece per bone; loading a second piece onto the same bone replaces the
    first.
- [*] **task 004 — Gear uploads keep sensible names**
  - created by: - · approved by: - · start: 09-03 · end: 09-03
  - description: a loaded gear piece is named after its file; re-uploading a name already in use
    appends a short suffix so no two pieces are indistinguishable.

## 2 · Reliability & persistence

- [*] **task 005 — Work is auto-saved**
  - created by: - · approved by: - · start: 09-03 · end: 09-03
  - description: the character and its fitted gear are restored on reload, so nothing is lost
    across a page refresh. Rotations and scaling of shapes are kept too.
- [*] **task 006 — Undo / redo works everywhere**
  - created by: - · approved by: - · start: 09-03 · end: 09-03
  - description: a full undo stack for the model plus a separate one for gear fitting, covering
    moves, resizes, binds, unbinds, loads and removals.
- [*] **task 007 — Fix bugs**
  - created by: - · approved by: - · start: 09-04 · end: 09-06
  - description: a sweep of user-facing bug fixes — gear pieces are no longer wrapped in outline
    shells, bound shapes animate around the same pivot after a reload (the restore path now
    re-binds the skinned mesh from its updated world matrix), and gear shape-objects group under
    their own "Gear (N)" sub-group in the shapes tree.
- [*] **task 008 — Rig attach bug fixes**
  - created by: - · approved by: - · start: 09-12 · end: 09-12
  - description: fix the three joint-attach complaints. Adding a joint after the skeleton kept no
    green parent→child line (the SkeletonHelper is now rebuilt on every rig change). Attaching a
    shape that was already bound to another bone used to be refused (the whole "one bone"
    collection now moves with it in a single undo, so merged pieces stay one piece). And a joint
    ball hidden BEHIND a shape no longer steals the click (pick is depth-aware; flush beads stay
    pickable). Attaching never shifts the shape's world position. Regression tests added for all
    three (node test.mjs: 160 passing, `npm run build` clean).

## 3 · Polish

- [*] **task 009 — Clay sculpting studio**
  - created by: - · approved by: - · start: 09-11 · end: 09-12
  - description: an in-app clay overlay for hand-shaping a shape — Details → 🧱 Sculpt opens the
    selected piece with Draw/Grab/Pull/Paint/Smooth/Carve brushes, size/strength sliders,
    push/pull toggle and mirror. ✅ Done writes the sculpted geometry (and paint) back into the
    scene and the undo stack; reloads preserve it. Fixed en route: brush never silently no-ops on
    low-poly faces, a falloff blow-up that sometimes persisted, mirror by geometry partner, a clay
    API misuse, and bound-shape restore double-baking geometry. Regression + Playwright tests for
    sculpt, undo/redo, paint, and reload persistence (`node test.mjs`: 199 passing, build clean).
  - **09-13 polish:** sculpting is now high-resolution — shapes are watertight-welded and densely
    subdivided before the brush (a box ~6k vertices, a sphere ~12k) — hard box edges keep their
    crisp flat shading, Mirror is an Off/On control that defaults off, and Done with no sculpting
    leaves the shape unchanged.

- [*] **task 010 — Exported models open in Blender**
  - created by: - · approved by: - · start: 09-16 · end: 09-16
  - description: fix the shipped bug where a downloaded dressed (and fitted) model GLB could not
    be opened in Blender ("unable to read the file"). Downloaded GLBs now load cleanly in Blender,
    with skinned characters and fitted gear intact (`node test.mjs`: 202 passing, build clean).

- [*] **task 011 — Dressed exports re-import cleanly**
  - created by: - · approved by: - · start: 09-17 · end: 09-17
  - description: fix the round-trip so a dressed champion saved and re-imported looks right in the
    studio. Each fitted gear piece is now exported exactly once (under its bone, in the original
    material), so it no longer reappears both in the Gear group and as a stray duplicate in
    Shapes — and a piece's fitted placement on its bone is kept when the body is normalised on
    import, so gear no longer sits slightly offset from its socket. Regression tests cover both
    the single-copy export and the socket alignment (`node test.mjs`: 224 passing, build clean).

## 4 · AI

- [*] **task 012 — AI Optimization sidebar**
  - created by: David · approved by: - · start: 09-17 · end: 09-17
  - description: a sidebar where the child chats with an OpenAI-compatible language model that
    proposes changes to the selected shapes, shows a small preview, and applies them (drag into
    the viewport, undo). Output is limited to the seven primitive kinds (Hidden features 77);
    replies are size-capped and keys are redacted from errors. The model is whatever the chosen
    server lists (Model dropdown); none is fixed in code. Merged into this repo 09-19 from David's
    `studio/ai-optimization` branch on top of task 011 (no conflicts, 642 tests). Changed on
    merge: the AI tests are `src/ai/tests/*.spec.js`; the default server
    (`catiecli.sukaka.top`, an unknown relay) was removed, so nothing is sent until an adult
    enters a server in Settings. Owner eyeball 09-19: "I don't think it is great": a language
    model placing primitives by coordinates gives lumpy results (see task 013).

- [~] **task 013 — AI generation: "Make it real" and "Make from words"**
  - created by: Edward · approved by: Edward (09-19) · start: 09-19 · end: —
  - description: a child's build (however crude) becomes a professional cartoon 3D model in its place,
    live in front of a client. Route A: four snapshots → one image edit of the 2x2 grid → multiview
    3D. Route B: words → picture → 3D. Each step is a swappable provider; the demo provider is
    Hugging Face Spaces with a key held on the device. Design:
    `docs/superpowers/specs/2026-09-19-3d-studio-ai-generation-design.md`; plan:
    `docs/superpowers/plans/2026-09-19-3d-studio-ai-generation.md`.
  - subtasks:
    - [*] spike 09-19: an ugly 13-block dinosaur → Qwen-Image-Edit 2511 with the "replace the blocky
      toy…" prompt (74 s) → Hunyuan3D-2mv from the four views (30 s): a clean model. Edit models
      given keep/same prompts, and FLUX image-to-image at ≤0.75 strength, only copied the blocks
    - [*] implementation verified 09-20 (plan tasks 1–10): settings, prompts, snapshots, one-model
      placement, progress bar, step runner, HF Spaces provider, flow, panel, toolbar wiring,
      labelled sample. Evidence on 09-20: `npm test` 919 passed / 0 failed; `npm run build` clean
      (`@gradio/client` lazy-loaded as its own 50 kB chunk); the three committed headed checks
      `checks/gen-capture.cjs`, `checks/gen-panel.cjs`, `checks/gen-studio.cjs` each exit 0 with
      assertions (octopus test build; four views differ, model lands beside the build at the build's
      height with a 0.3 gap, one Undo removes it, redo/reload keep its placement). 924 checks after
      the 09-20 review fixes. NOT owner-approved; live-verified separately below
    - [*] live check with the real services, 09-20 (plan task 11 steps 2-3, owner-authorized GPU).
      All four Settings rows read "ready". Route A on a 9-block octopus: Qwen edit 64.7 s -> a
      professional cartoon octopus consistent in all four views, keeping the build's colours;
      Hunyuan3D-2mv 19.4 s; "step n of 40" DID reach the browser; the model landed beside the build
      (minY 0, height 2.962 = build height, gap 0.3). Route B "a blue dragon with big wings":
      FLUX schnell 6.8 s (detail showed "step 1 of 4"), Hunyuan3D-2.1 27.2 s, same placement.
      No page errors, no GenErrors. Screenshots: `.superpowers/3d-studio-gen-checks/live/`.
      This run FOUND AND FIXED a P1: both 3D Spaces return `gr.update(value=FileData)`
      (2mv gradio_app.py:356, 2.1 gradio_app.py:456), which `fileUrl()` read as nothing, so every
      3D step died with "the Space sent no file". Regression added through the real adapter
    - [*] appearance survives the document, 09-20 (second review round, 4 findings, all reproduced
      first). The studio assumed every shape is ONE MeshStandardMaterial with a flat colour, which
      a textured model breaks four ways: (1) `takeSnapshot` stored positions only, so undo/redo/
      reload returned flat clay — it now stores `uv`/`normals`/`colors` and an `appearance` record
      (per-material settings, geometry groups, base-colour map as a data URL); (2) Duplicate,
      Delete, the colour control, the wireframe toggle, the tree icon and bone detach all assumed
      a single material — they now go through the new `src/edit/material-ops.js`; (3) the bake kept
      only `material[0]`, dropping a second painted region — it now walks one run per geometry
      GROUP; (4) the bake copied position+uv only, so smooth surfaces came back faceted and a
      vertex-painted source rendered black — it now carries source normals and vertex colours.
      Also stopped `includeGeo` shipping texture (and baked paint) bytes to the LLM.
      Evidence: `npm test` 964 passed / 0 failed (27 new in `src/edit/tests/appearance.spec.js`;
      the runner now also discovers `src/edit/tests/`); `npm run build` clean; four headed checks
      exit 0, including the new `checks/gen-texture.cjs`, which paints a known colour, puts it
      through the real Undo path and reads the pixel back — the encode/decode half of the round
      trip that Node cannot reach. Each fix was verified by reverting it and watching the matching
      test go red (12 reverts); two tests that could NOT fail were found that way and rewritten
    - [*] undo history made affordable, 09-20. Storing a generated model's vertices as
      `Array.from(typedArray)` cost 224.7 MB PER UNDO STEP for the measured 941,400-face model,
      rebuilt every snapshot — the appearance work above would have taken a 50-deep history past
      8 GB. `takeSnapshot` now keeps the attribute's own typed array and SHARES one copy per
      (attribute, `version`) across snapshots, so an unchanged shape is stored once however deep
      the history goes. Measured: one snapshot 224.7 MB -> 86.2 MB; fifty undo steps of a model
      nobody re-sculpted ~8.6 GB -> 86.3 MB. Correctness is what pays for it, and is tested:
      an edited buffer gets a fresh copy, older snapshots keep the values they were taken with,
      a restored mesh never writes through into its own history, documents saved as plain arrays
      by an older build still load, and `src/ai/prompt.js` converts to real JSON arrays at the one
      boundary that stringifies. 980 checks (16 new in `src/edit/tests/snapshot-size.spec.js`),
      build clean, four headed checks exit 0. Five reverts verified, including the two aliasing
      hazards. Does NOT reduce the face count — that stays open below
    - [ ] step 3b: the generic prompt on a vehicle and a humanoid build (not yet run)
    - [*] capture-scope replacement + model-owned controls, 09-22. The capture's shape ids travel
      through the real panel/main seam; the generated mesh replaces those shapes at their x/z
      centre and base (height matched), regardless of later selection. Deleted capture members are
      filtered; zero survivors falls back beside the live build. Remove + insert is one Undo unit.
      Every connected 3D model now owns its raw ranges/defaults/presets; the child sees one Detail
      control with the real face/vertex target, while Settings exposes the raw parameters. HF's
      `steps:30`/`octree_resolution:128` constants are gone: 2mv defaults to 5/256, 2.1 to 30/256,
      and `/on_export_click` runs as a required second call with reduction enabled. Evidence:
      1503 Node checks, clean Vite build, and all four headed generation checks green; the studio
      check changes selection after capture, replaces 8 captured shapes rather than the live ninth,
      and proves Undo/Redo/reload plus exact placement. The export call is fake-verified only and
      still needs one owner-token live confirmation. The Space's own code skips reduction on its
      textured branch, so the controllable HF reduced export is honestly advertised as untextured.
    - [ ] texture (tencent/Hunyuan3D-2mv has texture generation DISABLED on its deployment —
      "Texture Generation (Unavailable)" — and Hunyuan3D-2.1's published export path does not
      reduce faces when `export_texture` is true. The Studio therefore uses its reduced untextured
      shape output. A textured, tablet-sized result still needs another verified provider or a
      downstream texture/decimation path.)
    - [ ] the generic prompt on non-creature builds (vehicle, robot, house)
    - [ ] a second provider for the 3D step (Hunyuan3D has no paid provider on HF's list)

- [ ] **task 014 — Rebuild the rig for AI models only**
  - created by: Edward · approved by: Edward (09-19) · start: — · end: —
  - description: owner ruling — rebuild the rig from scratch for AI models only. It will bind to
    the single editable mesh marked `userData.generated`. Design and implementation are separate
    future work; this generation plan contains neither.

- [ ] **task 015 — Moving a free-form creature**
  - created by: Edward · approved by: Edward (09-19) · start: — · end: —
  - description: the built-in walks only know 2 or 4 legs; the child poses a free-form creature and
    records their own moves. Not designed yet.
---

## Appendix — laws in force

- **Gear binds to a named bone**, one piece per bone (the prior occupant is replaced); unbind
  lets a piece float.
- **Bone names must not contain a colon** — a colon in a bone name breaks animation playback and
  model export.
- **Fit mode reuses the same gizmo as the other modes** — keep it enabled; detaching it alone
  makes it inert.
- **Outlines are for champion shapes, never gear** — gear meshes (flagged `isGear`) are skipped
  by the outline pass; gear's paint is baked in, so it keeps its look. In the shapes tree, gear
  shape-objects group under their own "Gear (N)" sub-group; the Shapes block only lists champion
  parts.

## Appendix — dead ends (do not read these as current)

The second copy of a piece uploaded onto the same bone normally replaces the first (one piece per
bone), so a name-only de-duplication is sometimes hidden by that replacement.

## Appendix — trip-wires

- **The auto-save is debounced** — reload too quickly after an edit and the save may not have
  flushed yet; wait a beat before checking persistence.
- **Browser hot-reload can serve stale code** — after editing, do a full page reload before
  trusting a manual check; earlier "Details don't update" and "scale not saved" reports were
  stale-code false alarms.
- This model cannot visually verify rendering; ask a person to review visuals.
