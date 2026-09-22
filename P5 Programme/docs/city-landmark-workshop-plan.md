# Optional AI City Landmark Workshop

## Status and demo boundary

This is a post-demo implementation plan.  The pre-demo shipped bundle must
contain **no** Landmark Workshop runtime code, feature flags, catalog entries,
storage migrations, or asset additions.  This document, its asset briefs, and
future reference sheets are documentation-only material under `docs/`.

The workshop is optional.  A child who never opens it must have exactly the
same city experience as before: no tutorial, quest, badge, progression gate, or
interruption may require a landmark.

## Child experience

Add a **Landmark Workshop / 地標工作坊** shelf beside City Essentials and the
existing themed packs in the current model library.  A template card opens a
small bilingual customizer with a live preview and only **Place / 放置** and
**Cancel / 取消** as primary actions.  Placed landmarks are a single city
object, so existing controls can move, rotate, resize, duplicate, lock, delete,
undo, and redo the whole composition.  Selecting a landmark later exposes
**Customize landmark / 自訂地標**, without adding clutter to the ordinary object
inspector.

Templates are available immediately.  Existing badges may be decorative parts
of a plaza but must never unlock or block a template.

### First-wave templates

| Template | Bounded choices and behaviour |
| --- | --- |
| **Champion Plaza / 冠軍廣場** | Pedestal, paving, statue finish, pose, badge display, and curated plaque symbols.  It renders immediately even when a Champion is unavailable.  v1 uses a fixed-pose preset Champion; an imported Champion on another device falls back to a plainly labelled generic statue. |
| **Pixel Mural / 像素壁畫** | A fixed 16 × 16 editor with curated palette, clear, undo, fill, and optional symmetry.  It accepts no free text.  One small nearest-filtered canvas texture is rebuilt and disposed after edits. |
| **Festival Plaza / 節日廣場** | One of several bounded arrangements, lantern palette, banner pattern, and centerpiece.  Use existing lantern, gazebo, planter, and market assets plus procedural paving.  Lanterns follow the existing time-of-day system through emissive materials only—never per-lantern lights or a city-wide Festival Mode in v1. |
| **Smart Lamp / Gate / 智慧燈／閘門** | Always offers an honestly named proximity/threshold rule mode that shows sensed value, threshold, action, and human override.  Live AI is available only after a compatible `.cap` validates, passes self-test, and declares the supported event source and mapping.  Until the Workshop exports that exact contract, rule mode must never be described as trained AI. |

Do not attempt runtime mesh baking for custom Champions until a separate
post-demo prototype proves it works with both preset and imported rigs.

## Data and architecture

Extend the existing prop library; do not create a second placement or save
system.  Each placement occupies one record in the existing props envelope:

```js
{
  id: "tpl_champion_plaza",
  instanceId,
  x, y, z, yaw, scale, locked,
  landmark: {
    version: 1,
    config: { /* validated, template-specific fields */ }
  }
}
```

Create a landmark registry.  Every template entry supplies localized metadata,
footprint, performance weight, defaults, a configuration validator, renderer,
updater, and disposer.  Schemas remain template-specific—there is no generic,
unrestricted metadata bag.  Add prop-library APIs to update an `instanceId` and
commit through the current persistence/history path.  Editors must not write to
localStorage directly.

Preserve unknown records and unknown fields byte-for-byte where practical.
Unsupported template records remain saved but invisible, with repair/delete
choices rather than a false “loading” state.  All landmark state stays in the
existing props key, so Champion File and cloud saves carry it automatically.
Custom imported GLB binaries remain device-local.  Do not change the Champion
File version unless tests show that additive prop records cannot round-trip.

Renderers return one root group synchronously, use a procedural placeholder,
lazily load optional GLBs, and cancel stale async work.  The renderer owns
cleanup of textures, materials, animation handles, and disposable geometry.
Register that root with the existing grab system so a composition moves as one
unit.

Measure landmarks with weighted complexity, rather than their number of child
objects.  Keep animation scheduling centralized; pause distant/offscreen work,
respect reduced motion, and follow the established Smooth Mode/quality choice.
Do not introduce FPS-triggered quality switching.

## Delivery sequence

1. Behind a development flag, implement registry, shelf, schemas, placement,
   editing, and Pixel Mural.
2. Add Festival Plaza using existing assets.
3. Add Champion Plaza with the generic fallback; add preset-Champion support
   only after the rig spike.
4. Add Smart Lamp/Gate in transparent rule mode.
5. Enable by default only after regression, visual, and device testing.
6. Keep higher-risk work separate: arbitrary custom-Champion statues, live
   `.cap` control, Paint Pot/material overrides, weather, routes, trams,
   drones, and city-wide events.

## Asset brief and acceptance gate

Functional prototypes use procedural geometry and existing CC0 assets.  At
most three generated defining pieces are considered initially: a universal
monument/plaza centerpiece, a distinctive smart gate or lamp housing, and a
festival arch or centerpiece.

For each candidate, prepare front, side, rear, and three-quarter reference
sheets on neutral backgrounds.  Specify dimensions, low-poly construction, no
text, no brands, and no copyrighted style reference.  Preserve these sheets in
`docs/city-landmark-workshop-reference/` when commissioned; they are not
shipped library assets.

Use no more than four Hunyuan attempts per core piece in the first daily batch,
reserving eight of twenty generations for corrections.  Accept a generated
asset only after its terms permit CC0/public-domain dedication and its
provenance is recorded in the library manifest.  Target under 2 MiB (under
15,000 triangles for a hero), under four materials, embedded textures no larger
than 512², grounded Y-up orientation, and a procedural fallback.

## Test and acceptance plan

- Unit-test every configuration validator, defaults, corrupt values, unknown
  versions, pixel encoding, and weighted complexity calculation.
- Confirm legacy prop records remain unchanged and landmark records survive
  local reload, Champion File round-trip, cloud-save round-trip, and restore on
  a device without custom GLBs.
- E2E-test the library shelf; cancel-without-mutation; placement and
  customization of every template; move, resize, duplicate, lock, delete,
  undo, redo, and reload.
- Cover English and Traditional Chinese, keyboard navigation, touch target
  sizes, reduced motion, Smooth Mode, storage failure, missing assets, failed
  GLB loads, and interrupted asynchronous loading.
- Verify a child who never opens the shelf sees no new interruption and
  unchanged city behaviour.
- Run `npm run test:all`, the library audit, built-bundle E2E tests, and visual
  checks at street/tablet and aerial views.  Test a real older iPad or
  representative school tablet before production enablement.

Demo safety is met only when the pre-demo bundle has none of these runtime
changes and all staged material remains under `P5 Programme/docs/`.
