# 3D Studio â€” Hidden Features & Gotchas

**When debugging `3d-studio/`, read this first.** These are deliberate behaviors or subtle
traps that are easy to "fix" back into bugs. Add new entries as they are discovered.

## Rendering & input

1. **Light playful UI theme** â€” the app uses a warm cream/white theme with pill buttons, the
   Fredoka web font, and a sky-blue 3D viewport background (`#c6e0ff`). If the viewport ever
   looks "too dark" or "too bright" for new art, the scene background lives in `scene.js`
   and the grid/labels in `viewport.js`. Axis/FRONT labels carry a white halo so they read on
   the light background. A welcome overlay shows on every page load (no storage) and must be
   dismissed before interacting.
2. **GLB import auto-normalization** â€” imported models are centred on the origin and scaled
   to ~1.7 units tall. This silently rewrites the transform ("why did my model shrink?").
3. **Click-vs-drag selection** â€” selection only commits on a real click (â‰¤5px pointer travel,
   left button, gizmo not dragging); orbit/pan drags must never deselect. Check `PICK_TOL` /
   `down.moved` in `main.js`. Deselecting a shape (shift-click) must NOT move the "current"
   selection glow.
4. **Raycaster hits front faces only** â€” primitives use `DoubleSide`, but imported
   materials may not; picking can silently miss back faces.
5. **Color management** â€” three outputs `SRGBColorSpace`; color pickers and the painted
   shape colours are affected when comparing hex values. Selection no longer tints shapes:
   selected objects get an OUTLINE instead (a slightly-larger BackSide clone â€” a plain child
   for loose shapes, a shared-skeleton skinned sibling for bound ones), so the object's own
   colour stays visible. Outlines live in `studio.outlines` and are excluded from
   `studio.shapes`, picking, and snapshots.
6. **DRACO decoder** â€” imports rely on decoder files copied to `public/draco/`. Wipe `public/`
   and compressed GLBs fail silently.
7. **OrbitControls damping** â€” needs `controls.update()` every frame or the camera feels dead.
8. **TransformControls API drift** â€” r185 made it extend `Controls`, not `Object3D`: add
   `transformControls.getHelper()` to the scene, never the controls object. Re-check on every
   three upgrade.

## Rigging & skinning

9. **RigRoot must stay at the origin; skinning is identity-bindMatrix.** `buildSkeleton()`
   must call `rig.root.updateMatrixWorld(true)` BEFORE `new THREE.Skeleton(...)` (else the
   inverse-bind matrices are identity and every bound shape is offset by its bone's position),
   and every SkinnedMesh uses `DetachedBindMode` (r185 defaults to `AttachedBindMode`, which
   fights a shared-skeleton rig). Never move/scale RigRoot â€” move bones instead. **Clear
   skeleton detaches bound shapes back to the scene before disposing** (they live under
   RigRoot).
10. **`skinIndex`/`skinWeight` must be itemSize 4** â€” a per-vertex vec4 `(index, 0, 0, 0)` /
   `(1, 0, 0, 0)`. With itemSize 1, `weight !== 0` passes for `undefined` on the last vertex
   and `applyBoneTransform` throws.
11. **Bind pivot re-centring** â€” `bindLimb` re-centres the baked geometry, sets the mesh's
    position to that centre, and binds with `mesh.matrixWorld`; the skinning pivot stays at
    the bone while the gizmo appears at the shape's centre. Regression sign: a SkinnedMesh
    rendering at world origin with parts swinging around the model centre means the bindMatrix
    no longer equals the mesh's matrixWorld.
12. **Skeletonize is a geometric guess.** Per-shape bones from a shape-level spanning tree;
    root = shape closest to the component's centre (degree only a tie-break). Roles are
    labelled by position + depth: front/back split so a quadruped's front legs get SHOULDER
    and back legs HIP (biped vs quad decided by the count of depth-1 legs); left/right is
    split on the root's centre line. **Purely per-shape by design:** two boxes glued into one
    part become two bones (join with "Make one bone"); a deep-overlap merge was deliberately
    NOT added. Wrong labels are fixed with the Properties "Body part" dropdown.
13. **Bones use Mixamo BASE names without `mixamorig:`** â€” a colon in a track name
    (`mixamorig:Hips.quaternion`) breaks three's `nodeName:property` parsing and drops the
    animation on GLB export. `roleFromName` still strips the prefix for imports.
14. **Detached limbs are allowed** â€” a shape may join a bone it does not touch (halos,
    floating parts). The only forbidden action is merging shapes already bound to two
    different bones.

## Animation

15. **Gait axes + fold direction are per-rig-family.** Biped arms hang sideways (swing on Z),
    quadruped front legs hang down (swing on X): `AXES` in `src/animation/gaits.js`, keyed by
    `rig.axisFamily || rig.template` (skeletonize sets `axisFamily`). Knee/elbow folds can
    need opposite signs per family â€” `AXES.quadruped.LEG_*` carry `{ axis: 'x', sign: -1 }`.
16. **Gait entries:** knees/elbows fold one-way on the `sw` waveform (`max(0, sin)`), so a
    single time sample can land in the straight half â€” sample a full cycle. A bias-only entry
    must still include `amp` (else `undefined * sin` = NaN corrupts a bone quaternion and the
    part vanishes). Bone rotation is Euler (XYZ); keep amplitudes moderate.

## Undo, history & persistence

17. **Snapshot undo** â€” restore rebuilds the whole document from a snapshot, so ANY mutation
    made outside `scene.js` methods silently survives undo. Keep all writes inside `scene.js`.
18. **Undo/redo restores the selection** (full multi-selection via `selectedIds`). Imported and
    custom shapes store their vertex/index arrays. Duplicated imports retain the custom-geometry
    marker so they survive snapshot restore too.
19. **Static import placement survives snapshot restore.** Auto-save (IndexedDB, see item 33) uses
    the same `takeSnapshot`/`restoreSnapshot` path. Nested static imports have their ancestor
    transforms baked into the saved geometry, including shear, because restore rebuilds shapes
    directly in `studio.group`. Taking a snapshot does not change the live imported geometry.
    This preserves shape placement; it does not serialize GLTF animations.
19b. **A snapshot carries a shape's LOOK, not just its shape** (09-20). `geo` stores `uv`,
    `normals` and vertex `colors` alongside `positions`; `obj.appearance` stores each material's
    surface settings, its geometry groups, and its **base-colour map as a data URL**
    (`src/edit/material-ops.js`). Without this a textured model came back as flat clay after one
    Undo. Three rules hold it together: only a shape that needs it gets an `appearance` (an
    ordinary clay primitive gets none, so normal documents stay small); the encode is cached on
    the texture, so repeated snapshots re-encode nothing; and a rebuilt material keeps the data URL
    on `userData.appearanceSource` even if the image never decodes, or a document would lose its
    texture one Undo at a time. **Base colour only** — `SNAPSHOT_TEXTURES` is deliberately one
    slot, because every extra slot writes another full-size image into every undo step.
19c. **Never touch `mesh.material` directly** — go through `src/edit/material-ops.js`. A generated
    model can have one material PER PAINTED REGION, and `mesh.material.clone()` then throws
    `clone is not a function` while `mesh.material.color.set(…)` silently writes to the Array.
    `appearance.spec.js` pins `ui/properties.js` and `ui/tree.js` against the bare forms; put
    `// material-array-safe` on a line that genuinely handles only single-material internals.
19d. **A snapshot stores TYPED arrays, and shares them between snapshots** (09-20). `geo.positions`
    and friends are the attribute's own array type, copied once per (attribute, `version`) into a
    WeakMap in `snapshot.js`; `version` is what three.js bumps on `needsUpdate = true`, which every
    in-place geometry write here performs. So an unchanged shape is stored ONCE however deep the
    history goes, an edited one is copied afresh, and older snapshots keep the values they were
    taken with. Measured on a 941,400-face model: one snapshot 224.7 MB → **86.2 MB**, and fifty
    undo steps of a model nobody re-sculpted ~8.6 GB → **86.3 MB**. Two rules protect it: the copy
    is a `.slice()`, never the live buffer (or an edit would rewrite its own history), and restore
    builds `new Float32Array(stored)`, never an alias. Texture data URLs are shared the same way,
    by reference off the texture. **Consequences:** a snapshot is no longer plain JSON — IndexedDB
    clones it natively, but `src/ai/prompt.js` converts to real arrays at the one boundary that
    stringifies, and it must keep doing so. Plain-array documents from older builds still restore.

## Export

20. **Shared-skeleton export** â€” limb segments are separate SkinnedMeshes on one
    `THREE.Skeleton`; some GLB consumers emit duplicate joint nodes. Verify round-trips in
    Blender when it matters.

## Gear fit (Fit mode)

 76. **Dressed/fitted bakes re-map skeletons onto the CLONED bones (`remapSkeletonBones`)** —
     three r185 `SkinnedMesh.copy()` hands the clone the SAME `Skeleton` as the source (live
     bones); GLTFExporter indexes joints via its node-map of the exported clone, finds nothing for
     the live bones, and writes `skin.joints: [null, null, ...]` (`JSON.stringify` turns the
     undefined lookups into `null`) — a SPEC-INVALID file that Blender refuses with "unable
     to read the file" (Khronos validator: 36 `INVALID_INDEX` per file). The fix walks the cloned
     tree, matches each skinned mesh's live bones to the CLONED bones by NAME, and rebuilds
     `skeleton` via `new THREE.Skeleton(clonedBones, live.boneInverses)` — reusing the live
     inverse-bind matrices keeps the bind-time pose identical. Applied in BOTH `bakeDressed` (whole
     model) and `bakeFittedGLB` (single pre-fitted piece). Validation: Khronos validator drops from
     42 errors to 0; regression test #57. The exporter keeps `bindMatrix` in the IBM math; remap
     only fires when EVERY live bone resolves by name (partial skeletons are left untouched).

21. **Fit works on the CURRENT document only** â€” no bundled champion, no autoload. Entering
    Fit mode without a rig shows the guard hint; a rig must be added in Rig mode or imported.
    Fit mode rides the SAME `TransformControls` as Build/Rig/Pose, so Move/Rotate/Scale feel
    identical everywhere.
22. **Rigged characters are refused on upload** â€” `isRigged` scans for `isSkinnedMesh`/`isBone`;
    gear must be a plain prop. Skeleton rigs (Back rigs, Planner Array) have NO skeleton nodes
    so they pass the check.
23. **Fitted gear is parented to the socket BONE**, not the scene, so it follows the skeleton
    in Pose/Play. The dressed export pastes the gear's live TRS under a cloned bone; the fitted
    export writes a `fitLocal` node (`championFit` = bone key) so a downloaded "pre-fitted"
    piece only re-attaches cleanly to models with that same bone name.
25. **Gear undo is a SEPARATE stack from the document snapshot undo** â€” Ctrl+Z while a piece is
    active routes to `FitController.undo()`. Undo coverage: load/add, bind, unbind,
    gizmo drag (one unit per drag), remove. Editor-related transforms are excluded.
26. **Proportional scale by default; SHIFT unlocks per-axis stretch** (`stretchEnabled`, tracked
    on window Shift key listeners). Without SHIFT the dominant axis ratio is applied to all
    three; with SHIFT each axis stays free.
27. **Proportional scaling needs the drag baseline** â€” `onGizmoDragging` captures
    `group.scale` at drag start (scale mode only). The dressed download clones `studio.group`
    while temporarily hiding the rig's `SkeletonHelper` â€” that class crashes `Object3D.clone`
    (`Cannot read properties of undefined (reading 'isBone')`), which is why `bakeDressed` uses
    `detachDuring` rather than a plain clone.
28. **The shared TransformControls must STAY enabled** â€” a past bug had `FitController.hideGizmo()`
    set `enabled = false` on the SHARED gizmo; the next `updateGizmo()` then re-attached a helper that
    three r185 had already made unclickable (`onPointerHover`/`onPointerDown` early-return when
    `!enabled`): the gizmo rendered in Build/Rig/Pose but dragged nothing. Fix: `detach()` alone makes
    the controls inert (pointer handlers return when `object === undefined`), so the fit controller
    never touches `tc.enabled`.
29. **Pre-fitted bakes re-attach at their authored pose** â€” loading a piece baked by
    `bakeFittedGLB` (carries `championFit` + `fitLocal`) attaches under the socket BONE without
    a generic re-seat (`readPrefitMeta` + `attachPrefittedGroup`), preserving the fitter's gizmo
    tuning through the download â†’ re-upload round trip. Legacy world-relative bakes fall back to
    the world-preserving `attach()` dance. `championSlot` is written as the bone key, so eviction
    still applies one-piece-per-bone.
30. **Gear binds to a BONE, not an art-plan slot** â€” a fitted piece is parented under a named
    bone on the current rig (`entry.boneKey`). On load it is auto-seated to a GUESSED bone
    (`guessBone`: chest â†’ head â†’ hips â†’ first bone) so it lands "on the champion", and the piece
    is bound to that bone. The gear Details panel lists every bone; picking one rebinds and re-seats
    the piece (`bindActiveToBone`), and "Unbind" frees it to the scene ROOT keeping its world pose
    (`unbindToSceneRoot`) so it no longer follows the skeleton. One piece per bone â€” binding to an
    occupied bone evicts the prior occupant. When a piece's bone disappears (rig rebuilt) the piece
    is silently UNBOUND rather than dropped.
31. **Fit toolbar groups the controls** â€” the Move/Rotate/Scale tools are one "Transform" dropdown
    (mirroring Build mode), the fitted/dressed exports are one "Download" dropdown, and the (now
    bone-based) binding controls live in the gear piece's Details panel, not the toolbar. The old
    Done button (it only deselected) was removed â€” deselect by clicking empty space.
32. **Selection outlines are group-level SIBLINGS with FIXED absolute padding** â€” a plain mesh's
    outline was a child with a fixed `.scale`; when the mesh scaled, the child's world scale grew
    the outline thicker, and `Object3D.clone` deep-cloned the leftover outline into duplicates.
    Outlines are now siblings that copy the source mesh's world position, rotation AND scale each
    frame in `syncOutlines()`, then ADD a fixed `OUTLINE_PAD` (0.05 world units) converted to local
    scale via the geometry's half-size â€” so the outline hugs the silhouette at a CONSTANT thickness
    whether the shape is tiny or huge. Orphaned outlines (source removed) are disposed. Skinned
    outlines follow the same rule (re-bound at the source's scale) â€” see item 42.
33. **Auto-saved champion + wardrobe (IndexedDB)** â€” `src/persist.js` saves the document as the
    same `takeSnapshot` JSON the undo stack uses, plus each fitted gear piece as a baked fitted
    GLB (championFit + fitLocal), both format-versioned so a stale store is loudly ignored
    (never silently mis-attached) instead of resurrecting broken gear. On boot the persisted
    champion is restored before gear is re-worn (gear needs the restored bones). New scene clears
    the store. Persisted-buffer restore reuses `readPrefitMeta`/`attachPrefittedGroup`, so a
    reload keeps each piece at its authored pose. NOTE: champion restore shares the undo snapshot
    limitation â€” imported/`custom` meshes (kind !== primitive) are NOT rebuilt on restore.
34. **Fit gizmo attaches immediately on load and hides when nothing is selected** â€” loading gear
    calls `setActive(entry)`, which attaches the shared gizmo (defaulting to the current mode,
    usually Move) instead of waiting for a tool button to be re-clicked; `setActive(null)`/`done()`
    keep the gizmo hidden when no piece is active, and the gizmo buttons only render in the
    active-piece block.
35. **Delete deletes the WHOLE selection, not just the primary** â€” `doDelete` used `studio.selected`
    (the single primary), so after deleting the primary the other selected shapes had no affordance
    to go (`selected` was null and Backspace reported "Nothing selected"). It now deletes every
    mesh in `studio.selection` (`selectedMeshes()`), clears the selection, and pushes ONE undo unit
    so Undo restores them all. Bones are rejected (they belong to the skeleton). The Properties
    Delete button matches.
36. **Champion vs. gear distinction in Fit mode** â€” gear never lives in `studio.selection` (it is
    parented to bones / the scene root under the FitController's control). Clicking a fitted piece
    makes it the ACTIVE gear (gizmo target); clicking a champion body part now DESELECTS the gear
    so the gizmo detaches and Delete targets the champion shape, not leftover gear. The bind-to-bone
    panel only renders in Fit mode while a gear piece is active â€” it never appears for champion
    objects.
37. **Fit-mode undo/redo was crashing (fixed)** â€” `captureWardrobeState` snapshot entries stored
    only the serialized pose (`p/q/s` + `boneKey`/`pristine`) and NOT the `group` object reference,
    so `restore()` did `entry.group.position.fromArray(...)` on `undefined` â†’
    "Cannot read properties of undefined (reading 'position')" whenever Undo/Redo ran while gear was
    active, killing the whole toolkit. Fixed by persisting the live `e.group` reference in the
    snapshot (the group object identity is stable across an op â€” only its pose/binding change), so
    Undo/Redo re-attach and re-pose the correct, existing group instead of rebuilding from scratch.
    Verified in browser: rebind helmet Torso0â†’RightShoulder1 â†’ Undo reverts to Torso0 â†’ Redo returns
    to RightShoulder1, no console errors.
38. **Gear uploads are named after the file, de-duplicated** â€” a loaded gear entry is named exactly
    the uploaded filename (extension stripped), e.g. `red-samurai-helmet.glb` â†’ `red-samurai-helmet`.
    If that name already exists in the wardrobe, a short numeric suffix is appended
    (`red-samurai-helmet`, then `red-samurai-helmet_1`, then `_2`, â€¦) via `uniqueGearName`, so no two
    pieces are ever indistinguishable. Verified in browser: uploading the same helmet a second time
    produces `red-samurai-helmet_1`.
39. **Shape transforms are persisted (rotation/scale no longer reset on reload)** â€” two holes were
    silently dropping transform changes from the auto-save: (a) gizmo drags only ever emitted
    `'transform'`, never `'changed'`, so the debounced champion save never fired for a
    move/rotate/scale drag; the drag-end handler now emits `'changed'`. (b) the Properties
    Position/Rotation/Scale/Bend fields mutated the mesh/bone but never emitted `'changed'`; a
    debounced `scheduleTransformSave()` now commits them. Verified in browser: set box scale 2.5 +
    rotation 30Â°, reload â†’ both survive.
40. **Pose restores onto bound shapes (undo/redo + reload)** â€” `restoreSnapshot` set the pose on the
     temporary mesh and then called `bindLimb`, which builds a fresh `SkinnedMesh` at identity pose
     (scale 1 / rotation 0), dropping the pose for any bone-bound shape. Restore now re-applies
     position/rotation/scale to the skinned mesh `bindLimb` returns, so a bound shape keeps its tuned
     scale/rotation through Undo and after reload.
41. **Gizmo transforms undo via a TRANSFORM LEDGER, not a snapshot** â€” a drag (single object or the
     group of selected meshes) records the before/after TRS per object via `studio.pushTransform(ops)`.
     `undo`/`redo` replay only that TRS delta (`applyTransform`, re-binding skinned shapes) instead of
     tearing down and rebuilding the whole document. This stops gizmo undo from resetting a bound
     shape's scale/rotation and from dropping its outline. Structural ops (add/remove/attach/skeleton)
     still use `pushUndo()` and a full snapshot. The studio undo stack now holds BOTH unit kinds;
     `pushTransform` skips empty/no-change op lists.
42. **A skinned outline tracks the source's ACTUAL scale** â€” skinned outlines used to be pinned to a
     fixed 1.03 overage (bones should deform, but they can't square the user's gizmo scale). Now
     `rebindSkinnedOutline` re-binds the shell at the source node's current world scale + a constant
     pad whenever that scale changes, so a rescaled bound shape's outline hugs it. Plain-mesh outlines
     were already correct.
43. **Clearing/replacing the skeleton UNBINDS (does not destroy) fitted gear** â€” `scene.clearRig()`
     now emits `before-rig-change` BEFORE `dispose()` wipes the bone children; the FitController
     reparents every bound gear out to the scene root (world pose kept) via `onBeforeRigChange`. So
     "New scene" / "Clear skeleton" frees the gear from its bones instead of disposing its geometry.
     `FitController.clearAll()` additionally empties the wardrobe + fit undo stacks for "New scene".
44. **Gear shows by its real filename in the tree, immediately** â€” on load the gear's leaf meshes are
     renamed to the upload filename (`red-samurai-helmet`, not the GLB's internal `Gear_â€¦`) and
     `studio.emit('changed')` is fired so the "My Shapes" list re-renders without a deselect/reselect.
45. **Rig-mode bindings are surfaced in Details, not the tree** â€” the My Shapes list no longer appends
     `â†’ boneName` to a bound shape's name. Instead, in Rig mode a selected shape shows a **"Bind to
     joint"** section in the Details panel (a bone dropdown + status line), mirroring how Fit mode binds
     gear pieces. Binding a shape still calls `rig.bindLimb` with the same one-shape/one-joint guard as
     the ðŸ”— Joints â†’ Attach button (which is kept and still works); selecting a joint attaches, selecting
     the blank option detaches.
46. **The Gait dropdown is an immediate-trigger action menu** â€” styled like âž• Add shape / ðŸ¦´ Skeleton
     (a `âš¡` lightning caret on the right from `.dd.action`, no `â–¾` arrow, no âœ“ on the active gait), with
     the **ðŸŽ¬ Gait** label reusing the old clapper symbol as the left icon. It still calls
     `onPlayGait(name)` on choose.
47. **Restoring a BOUND shape no longer double-bakes its transform** â€” `bindLimb` bakes the mesh's
     current world matrix into the geometry, so `restoreSnapshot` used to apply the stored
     position/rotation/scale BOTH into the baked vertices AND onto the skinned node, doubling the scale
     (e.g. a 2.5Ã— shape came back ~6.25Ã—) and corrupting rotation on undo/reload. The restore now binds
      a primed shape at IDENTITY and moves/rotates/scales only the skinned node, matching the live flow
      so a reloaded bound shape renders at exactly its saved size.
48. **Switching a bound shape to another joint JUST re-binds it** â€” the Details "Bind to joint" dropdown
      (and any bind target) no longer refuses a bound shape. Picking a DIFFERENT joint while one is set
      auto-detaches the old binding (`detachLimb`, world pose kept) then attaches to the new joint in one
      undo unit; picking the blank option still detaches. The prior "already attached â€” detach first"
      rejection is gone.
49. **Modes refresh the Details panel** â€” `PropertyPanel` listens to `studio.on('mode')` (not just
      `select`/`transform`/`changed`), so the Rig-mode "Bind to joint" section, gear binding section, etc.
      appear/disappear the moment you switch modes instead of waiting for a selection change.
50. **Shift-clicking a JOINT adds to a joint multi-selection that coexists with shapes** â€” `studio`
      keeps `selectedJoints` (a Set of bones) separate from the mesh `selection`, so you can shift-pick
      several limbs AND a joint at once. The ðŸ”— Joints dropdown's **Attach** then binds every selected
      shape to that single joint (error toast if more than one joint is selected); a new **Detach from
      joint** button unbinds every selected bound shape (unbound shapes are silently ignored). `bindLimb`
      clears shape selection internally, so multiselect loops capture shape references first.
51. **Outlines are parented as siblings but track the source's WORLD pose** — `syncOutlinePosition` copies the source's world matrix into the shell's local transform. That is safe only when the shell's parent is the identity scene root; a gear leaf (or any shape) bound under a NON-identity bone/gear group re-baked the parent transform a second time, landing the outline at ~2× the offset. It now expresses the shell in its parent's LOCAL frame (parent inverse × world), so bound gear outlines hug the piece exactly. Removing the currently-selected (gizmo-active) gear piece also re-attaches the shared gizmo to the surviving piece or detaches+hides it, so no dead gizmo lingers at the world origin.
52. **Gear outline is re-anchored on the piece's true centre** — a GLB mesh often isn't centred on its own local origin (its pivot is offset, e.g. seated against a socket). `syncOutlinePosition` enlarges the shell as a scale factor about the mesh ORIGIN, which shifts the enlarged centre away from the source's for pivot-offset meshes — the outline then sits slightly off and reads as a slightly-displaced blue copy. `createOutline` now records the geometry's local centre (`outlineCenter`) and `syncOutlinePosition` subtracts pad/h × centre (rotated into shell frame) from the shell's position, keeping the outline concentric on the gear (identical centre, ~0.06 world pad). Centred shapes (the common case) are unchanged.
53. **Persistence keeps pre-skeletonization scale/rotation** — `bindLimb` bakes the mesh's `matrixWorld` (incl. any scale/rotation applied BEFORE skeletonizing) into the geometry, then the skinned node sits at identity — so a snapshot that only saved the node transform dropped that pre-bind pose on reload. `bindLimb` now records the baked rotation/scale in `userData.bakedRot`/`bakedScale` when non-identity; `takeSnapshot` persists them and `restoreSnapshot` re-bakes them into the fresh primitive before `bindLimb`. Post-bind gizmo tuning on the node (the normal case) still uses the node transform only, so it must NOT be double-applied.
54. **Gear recognises itself** — every gear mesh (and its root group) carries `userData.isGear` (set in both `addGear` and `addGearFromPersisted`). Details hides the Color + Pick controls for gear (their paint is baked-in) yet keeps Name/Position/Rotation/Scale/Duplicate/Delete; the My Shapes tree renders a ⚙ glyph instead of the champion colour square for gear pieces.
55. **Outlining is DISABLED for gear pieces** — gear geometry (clothing etc.) is too complex/irregular for a reliable outline shell, so `syncHighlights` skips any mesh flagged `isGear` (the shape-outline loop and the pending-outline condition both early-out). Champion shapes still get outlines as before.
56. **Bound shapes animate around the SAME pivot after reload** — `bindLimb` binds with the skinned node's `matrixWorld`, so live binding satisfies `bindMatrix === node transform`. `restoreSnapshot` rebuilt a fresh primitive at identity, bound it (bind matrix = identity/primitive-centre), THEN moved the node to the stored transform — leaving `bindMatrix ≠ node transform`, so the skinning pivot was offset and Play-mode deformed shapes swung around the wrong point after reload/undo. Restore now re-binds the skinned mesh from its updated `matrixWorld` (`rig.rebind`) right after applying the transform, restoring the invariant that live binding has.
57. **Gear shape-objects live in their own "Gear (N)" sub-group** — the My shapes block splits `studio.shapes` into champion parts (`Shapes (N)`) and gear piece objects — any mesh flagged `isGear`, shown with the ⚙ cogwheel —`Gear (N)`, rendered only when at least one exists. The earlier standalone "Gear (N)" wardrobe list (and its per-row ✕ remove button + `FitController.removeEntry()`) is gone; these rows are plain selectable tree items like champion shapes. Because `studio.shapes` only traverses the scene group, bound/fitted gear (parented under skeleton bones) is NOT listed here; only gear mesh objects under the scene root show up in the Gear group.
58. **The joint's green line is rebuilt on every rig change** — `SkeletonHelper` snapshots the bones it draws at construction time, and `buildSkeleton` used to create it only once, so a joint added later ("Add joint") never showed its parent→child line. `buildSkeleton` now calls `refreshHelper()`, which disposes the old helper and recreates it from `rig.root`, so any new joint (and its ball) gets its green line immediately. The helper is flagged `userData.isSkeletonHelper` and is only referenced by `main.js` (`.visible`) and `skeleton.js`, so recreating the instance is safe.
59. **"Attach to joint" moves the WHOLE "one bone" collection** — `toolbar.attach()` used to skip every shape that was already bound, so a merged (Make one bone) piece could never be re-attached as a unit, and the Details dropdown's inline detach+rebind split the collection by moving a single member. Both paths now route through `rig.reattachToBone(bone, shapes)`, which gathers every bound mesh sharing the source's `boundBone`, detaches each bound member (world pose kept) and binds them all to the target in ONE undo unit. A bound-to-another-bone shape is now attachable (the rigHint reads "this shape bends in another bone — Attach moves it (whole collection too)"), and attaching never shifts the shape's world position.
60. **An OCCLUDED joint ball can't steal a click** — `pickAt` used to select the first ball on the ray (`hits.find(isJointBall)`) regardless of depth, so a joint ball sitting BEHIND a shape (e.g. after a pose swings a limb) made the shape impossible to pick. The ball now wins only when it is the nearest hit (`ballHit.distance <= meshHit.distance`, tie preserved so flush-mounted beads stay pickable); otherwise the nearest shape is selected.

61. **Clay sculpting studio opens shapes in an overlay** — Details → `🧱 Sculpt` (hidden for
    gear pieces) opens the selected shape in the `#clay-app` overlay. One shape is sculpted at
    a time: the PRIMARY of the selection (a tree-row pick inside the overlay switches target).
    Tools: **Draw / Grab / Pull / Paint / Smooth / Carve** plus size/strength sliders, a **+ / −**
    Push↔Pull toggle, and a **Mirror** checkbox. While the overlay is open, the mode hotkeys
    (`1`–`5`) are suppressed so a stray key doesn't destabilise the edit. `✅ Done` writes the
    live geometry back (`setSculptedResult` → shape becomes `kind:'custom'`) and only pushes an
    undo unit when something actually changed (paint counts); `✕ Cancel` discards.
62. **Sculpt brush weights never silently no-op** — the brush gathers all vertices inside the
    radius AND always includes the hit triangle's own vertices with a floor weight of 0.12. A
    big brush on a low-poly face still deforms, and a tiny brush can carve into a face interior
    (with zero gathered vertices the old code did nothing and "felt broken").
63. **Sculpt falloff is clamped before the smoothstep** — the falloff `x²(3−2x)` explodes when
    fed `d/r > 1` (x goes negative → weights ~130 → strokes that launched the surface by tens of
    units, a shape-destroying blob that then PERSISTED to IndexedDB). Weights clamp `d/r` with
    `Math.min(1, …)` first; strokes now move a sane fraction of a unit each.
64. **Sculpt mirror uses the geometry mirror, not the coordinates** — when Mirror is on, a stroke
    on one side is replicated by looking up the exact mirror vertex via `mirrorMap`
    (vertex→mirror partner, built once per load with a SPATIAL HASH — 27-cell lookups, so it stays
    cheap even at the now-thousands-of-vertices sculpt densities) instead of snapping to the nearest
    symmetric spot. Pull/Carve/Smooth mirror vertex-wise; the Grab tool mirrors by gathering around
    the mirrored cursor point. Pairs are reciprocal, so both sides stay exactly symmetric; vertices
    sitting ON the mirror midplane map to themselves.
65. **Painted shapes swap their material via a cloned painted material** — `bakePaint` clones the
    target's material, injects a `paintMap` sampler through `onBeforeCompile` (skinning kept) and
    sets a per-clone `customProgramCacheKey` so the paint shader gets its own program. Done bakes
    the canvas into a JPEG `dataUrl` (1024×512 equirect) stored in `geo.paint`; reload/undo/redo
    re-create the painted material. **Removing paint must `delete material.customProgramCacheKey` —
    setting it to `null` makes three's `getParameters` throw `customProgramCacheKey is not a
    function`.** Outline materials are never touched.
66. **The clay camera must target the geometry's LOCAL centre** — the overlay aims at
    `T = (cX, cY, cZ)`, the shape's bounding-box centre in its own local frame (for bound shapes
    that's offset from the node's world position). A speculative "aim at the mesh's world
    position" fix broke picking for a box placed at y=0.5 and was reverted: the camera follows
    the geometry, not the node.
67. **Sculpted (custom) geometry persists positions verbatim** — `takeSnapshot` stores
    `geo.positions`/`geo.index` for custom shapes; `restoreSnapshot` rebuilds from those arrays.
    For a BOUND custom shape the restore MUST use `rig.bindLimb(bone, mesh, { skipBake: true })`
    — the stored positions are already in the baked+re-centred frame, so the normal bind
    (which re-bakes `matrixWorld` and re-centres to the NEW bounding box) would translate the
    sculpted surface by the recentre delta. Regression test #49.
68. **`window.__clay` is a public debug seam** — the clay instance is exposed globally; `clay.api`
    covers `paintData()`, `brush()` and the tool getters, and `clay.debug` adds `pickAt(x,y)`,
    `sculptOnce(x,y)`, `weightsAt(x,y)`, `state()`. Used by the Playwright regression checks;
    keeps working as the integration evolves.
 69. **Shapes are densified when they enter clay (`prepareForSculpt`, `src/clay/remesh.js`)** —
    primitives are far too coarse to sculpt: a box has only 8 corners, a sphere a coarse grid wrap.
    On `loadShape` the raw positions are passed through `weld` (merge vertices that coincide within
    ~1e-4, quantised at `K = 1e4`) then an adaptive midpoint-subdivision pass that runs
    `while (tris*4 <= targetTris && levels < maxLevel && vcount + tris*2 <= maxVerts)` (defaults:
    `targetTris 24576`, `maxLevel 6`, `maxVerts 30000`). The density target is deliberately HIGH —
    sculpted shapes are meant to be genuinely high-res (the painted reference spheres carry ~10k
    vertices) — so a box lands at ~12k tris / ~6.1k verts, a sphere at ~23.5k tris / ~11.8k verts,
    and a torus at ~24.5k tris / ~12.3k verts. Midpoints are linear, so the silhouette survives:
    a cube stays a cube, just with a finer grid.
 70. **Sculpting never opens holes — welding kills the seam-ghosts** — primitives duplicate
    coincident vertices at their sewing seams (box: 24 verts for 8 corners; sphere: seam + pole
    rings) and the brush moved ONE copy, tearing a gap when you pushed a cube edge or the sphere's
    "equator". Welding at load closes that: the mesh that reaches the brush is a single watertight
    manifold, and every brush stamp moves the seam copies together. Asserted by test #50-52
    (`openEdges === 0` after weld, after displacement, and after sculpting the rim of a cube).
 71. **Shapes sculpted before this fix can keep residual open seams** — a shape sculpted back when
    vertices weren't welded has copies that already drifted apart by more than the weld tolerance,
    so loading it can't fuse them (typically a handful of open edges near corners). Re-pushing the
    shape can't un-drift them either; only re-sculpting with the current build avoids them. Fresh
    shapes are clean (watertight).
 72. **Densified geometry is clay-only — the scene keeps the light primitive** — `prepareForSculpt`
    runs inside `loadShape`; `origPos`/`basePos` and `currentIndex()` come from the subdivided
    array. Only `✅ Done` replaces the scene mesh (via `setSculptedResult(mesh, positions, index,
    paint, basePositions)` → rebuilds the BufferGeometry, regenerates skin attributes and re-binds
    skinned meshes with `bindMode: 'Detached'`; no index = legacy in-place overwrite). So
    un-sculpted shapes keep their low-poly primitives and GLB exports stay lean. Undo restores the
    scene from the light snapshot; redo replays the dense topology. Regression tests #50-53;
    verified in-browser (reload keeps the dense mesh, undo/redo round-trip exactly).
 73. **`window.__studio` is a debug seam too** — exposed next to `__clay` so the live scene can be
    poked/measured from the console (used by the Playwright geometry checks). Note **reloading the
    page clears the undo history** — persistence restores the document, not the undo ledger.
 74. **Hard edges stay hard after sculpting (`sharpenNormals`)** — the welded box corner is ONE
    vertex touching three faces, so a plain computeVertexNormals averages them into a rounded,
    "soft" corner with banded shading (the boxes-look-soft report). The clay studio never lets
    that reach the screen: it RENDERS a crease-aware sharp COPY — `sharpenNormals(positions,
    index)` splits every (vertex, face) pair whose face normal deviates >25° from the vertex's
    smooth normal into its own flat copy; smooth regions stay shared (spheres, sculpted bumps
    keep smooth shading). The brush keeps working the welded mesh, so this is display-only —
    coordinates are copied, never moved; `remap` lets the paint anchors (`basePos`) follow the
    copies. **✅ Done hands the sharp copy out**, so the scene's corners are flat too, and the
    stored topology keeps them that way across undo/redo/reload (snapshot restore now recomputes
    normals). Shapes sculpted before this fix keep soft corners until they visit the clay studio
    again. Regression tests #54-55.
 75. **The clay Mirror control is a segmented Off/On toggle, OFF by default** — mirror was a bare
    checkbox that defaulted ON; it's now a labelled Off/On pill (teal highlight + aria-pressed),
    and every new session starts with mirror OFF (`open()` resets it; regression checks assert
    the active state). And **Done with nothing sculpted never rewrites the shape**: the write-back
    is gated on `progressed` (paint or displacement), so a no-op Done leaves the primitive
    untouched instead of silently densifying it.

76. **Rigged GLB imports become a NATIVE rig (`adoptImportedGroup`)** — a skinned model is
     adopted, not left as a foreign SkinnedMesh: the old skeleton is flattened into ONE
     world-baked SkinnedMesh per (dominant) bone (`_flattenSkinnedToBone`), joint balls are
     stripped, the Mixamo bone chain is re-parented under RigRoot with **relative** rest deltas
     (`childLocal = capturedChild − capturedParent`, × scale), and root-only `snapY` puts the
     feet at y≈0. Bone rest locals ARE the pose (no `resetPose()`). The result is a normal
     animated rig: gaits run, joint balls are clickable, outlines/gizmos align (pivot sits on
     the visual centre, drift ~0). Gotchas learned the hard way: three r185 `getX(index)` is
     ITEM-indexed (`array[index*itemSize]`) so skin reads must use the raw typed arrays;
     absolute bone positions + hierarchy DOUBLE-count the author's scaling (positions must be
     relative deltas, `bone.scale = 1`); geometry needs `scale × |mesh.scale.x|` at adopt time
     (normals + boundingBox recomputed) or the baked shape is the wrong size; `adoptImportedImported`
     passes name/userData into the temp mesh before `bindLimb`, and **never calls `resetPose()`**.
     Multi-bone meshes collapse to their dominant bone (a whole-body mesh with all weights to
     `Head` rides the head bone rigidly — that's the trade-off). `roleFromName` tolerates
     `mixamorig` prefixes + trailing digits. Regression tests cover `import-fix:` block.

## AI Optimization (LLM-assisted)

77. **AI output is PRIMITIVES ONLY** — the model may return just the seven primitive kinds
    (`box, sphere, cylinder, cone, torus, octahedron, plane`). `kind:'custom'` and any `geo`
    block are rejected by design: AI-generated meshes cannot be sculpted or skinned, so the
    feature refuses them instead of importing them. An unknown kind is rejected with the
    allowed list spelled out in the error message.
78. **The parser takes the first fenced block that VALIDATES, not the first block** — models
    often print a schema example before the real answer. `parseAIResponse` walks every
    ```json fence in order and accepts the first one that both parses AND passes
    `validateObjects`; only after that does it fall back to any fence, then to the whole
    reply as raw JSON. Do not "fix" it to grab block #1 — that selects the example.
79. **The preview is a THIRD WebGL context** — the main viewport and the clay overlay already
    hold two, and `AIPreview` adds a third on `#ai-preview`. Browsers allow only a handful of
    live contexts, so `dispose()` is required (it calls `forceContextLoss()`), and it is
    idempotent — disposing twice is safe. The main viewport's context is never touched.
80. **Undo ownership is split, and must stay split** — the add/drag path (`onApplyAdd` in
    `main.js`) calls `studio.pushUndo()` once itself, while `replaceSelection` owns its own
    single push (item 17). Never wrap a replace in another push: that would make one AI
    action cost two `Ctrl+Z` presses. Exactly one push per applied action means one `Ctrl+Z`
    fully reverts it.
81. **Replacing a bone-bound (skinned) shape leaves no orphaned outline** — the skinned mesh
    AND its outline are removed. The outline is a sibling of the mesh under the same bone, so
    `scene.remove()` does not dispose it by itself; `replaceSelection` always calls
    `setSelection()` right after, which clears and disposes every outline before rebuilding
    the new selection's (`syncOutlines()` is the per-frame safety net). The rig stays intact
    (18 bones) and still animates a gait, and one undo restores the replaced shapes. Measured
    on a real biped rig in task 14.
82. **`node test.mjs` is the test entry point** — there is no `npm test` script in the
    studio's `package.json`. Run the suite from the studio directory; it prints
    `N passed, M failed` and exits non-zero on any failure.
83. **The sidebar splitter maps over `#split-region`, not `#sidebar`** — `#scene-section`,
    `#splitter` and `#properties-section` are wrapped in `<div id="split-region">` so the two
    panels' percentage basis resolves against the region the splitter actually divides.
    Before that wrapper, appending the third `#ai-section` made `updateSplit` map the cursor
    over the full sidebar while the panels shared only ~350px: the handle jumped ~77px on
    pointerdown and tracked at ~0.48×. After the wrapper the jump is ~0.00px and tracking is
    1.000× in both directions.
84. **The AI preview renders at most 150 objects** — `PREVIEW_MAX_OBJECTS = 150`; only the
    first 150 shapes are built into the preview scene. This caps the RENDER only: the apply
    payload is uncapped, so **Replace** / **Add as new** still apply every returned shape.
85. **Dev-server notes** — the dev server needs **Node 20** (Vite 8 will not boot on Node
    18). In Playwright, `page.goto(url, { waitUntil: 'networkidle' })` **hangs against the
    Vite 8 dev server** (its HMR websocket never idles) — use `{ waitUntil: 'load' }` and
    wait for `#viewport` instead.
86. **`window.__aiPanel` and `window.__raycastToWorld` are AI debug seams** — exposed by
    `main.js` next to `__studio`/`__clay` (items 68 and 73) so the AI panel can be driven and
    the preview->viewport drop can be probed from the console or Playwright. `__aiPanel` is the
    live `AIPanel` instance (preview, apply hooks, `destroy()`); `__raycastToWorld` is the same
    pixels->world function handed to the panel's preview drag, so a test can resolve a drop
    point without simulating a full gesture. Read-only conveniences; the panel wiring still owns
    the real seams.

## Deferred features (deliberately not built)
- Raw vertex/edge/face editing (shape-based modelling instead).
- Model travel / forward motion (in-place only; the interactive-3D team owns locomotion).
- IK foot-planting (only needed with travel).
- CSG booleans, mirror modifier, UV editing.
- **Auto-fit button** (removed 2026-09-02): one-click "seat to defaults" is redundant with
  binding + the gizmo; a re-seat helper can return later if needed. See
  the commented-out `autoFit()` in `fit-controller.js`.

## AI generation (task 013)

- **`window.__gen`** is the Make-it-real panel. Calling `__gen.setService({ runStep, checkAll })` swaps
  in a fake service, so the whole flow can run without paid generation. Committed headed checks
  live under `checks/gen-*.cjs`; generated screenshots go in `.superpowers/3d-studio-gen-checks/`.
- **Snapshots use their own renderer** (`captureViews` in `src/ai/gen-snapshot.js`), with
  `preserveDrawingBuffer` on, reading each view straight after `render()`. The viewport's renderer
  clears its buffer, so capturing from it returns black.
- **Each generation is one editable model.** `bakeAndPlace` in `src/ai/gen-place.js` copies all
  submesh triangles with their captured world transforms into one Mesh. Preparation never
  mutates the document; the panel commits it synchronously once, with one Undo entry. Its
  `userData.generated` flag survives undo/redo/reload. No rig is attached by this feature.
- **The bake carries appearance, not just triangles** (09-20). It walks one RUN per geometry
  GROUP, not one per mesh, so a source with two painted regions keeps both materials instead of
  only `material[0]`. It copies `uv`, the source `normal` (through the inverse-transpose matrix)
  and vertex `color`. It calls `computeVertexNormals()` **only when no source had normals** — a
  recompute over the baked triangle soup has no shared vertices, so it facets every smooth curve.
  Source normals are used only when EVERY run has them; a half-filled normal buffer renders black.
  A source with no map and no vertex colours still falls back to studio clay, as before.
- **Texture bytes never reach the LLM.** `shapeObject` in `src/ai/prompt.js` deletes `appearance`
  and, under `includeGeo`, forwards only `positions`/`index`/`basePos`. The model cannot act on an
  image and one data URL would dwarf the prompt. (This also stopped a baked `paint` data URL that
  used to be shipped whenever `includeGeo` was on.)
- **Static plain imports already preserve parent placement** through snapshots (fixed in
  `0b9098c6`); do not reintroduce the old "import placement is lost" limitation.
- **Cancelled work is isolated.** Panel sessions and operations have separate identities. Late
  results, errors, checks and cleanup cannot affect a newer operation or add an obsolete model.
- **The overlay owns the keyboard** while it is open, just as Clay Studio does.
- **Settings** live in `localStorage['studio.gen.config']`, as `{ providers: {step: id}, keys: {id: key} }`.
- **The sample** is `public/samples/dino/`. It is always labelled "Sample", never presented as the
  child's result.
- **Both 3D Spaces wrap their file output.** `shape_generation` in tencent/Hunyuan3D-2mv
  (`gradio_app.py:356`) and Hunyuan3D-2.1 (`gradio_app.py:456`) each
  `return (gr.update(value=path), model_viewer_html, stats, seed)`, so `data[0]` is
  `{__type__: 'update', value: {…FileData…}}`, NOT a bare FileData. `fileUrl()` unwraps it. Reading
  only `.url` made every 3D step die with "the Space sent no file" (found live 09-20). A fake that
  returns a bare `{url}` will not catch this — the regression in `gen-hf-spaces.spec.js` sends the
  wrapped shape through the real adapter.
- **Failures say which thing broke.** `toGenError()` keeps the GenError's `detail` and redacts it
  against the saved keys before display: the child reads the fixed public sentence, the adult reads
  the reason. Dropping detail (as it did until 09-20) makes a live failure undiagnosable.
