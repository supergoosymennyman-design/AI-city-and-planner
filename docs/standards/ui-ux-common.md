# UI/UX Standard — Common (both tracks)

> **Shared source of truth** — the accessibility + design *contract law* that is identical for
> **every** AI-Education game, kindergarten and primary. Track-specific *look* lives in the two
> sibling docs; this doc holds what never changes between them.
>
> Every game follows **this doc PLUS its track doc**:
> - Kindergarten → [`kindergarten-ui-ux.md`](kindergarten-ui-ux.md) ("Sticker Lab + Bo")
> - Primary → [`primary-ui-ux.md`](primary-ui-ux.md) ("Command Deck")
>
> **No shared UI package — the boundary is the VIBE, not a library.** There is no `@edu/ui`;
> each game owns its own UI (its own tokens, components, characters). The *only* rule is that it
> **matches the vibe** in this doc + the track doc + the render previews. Roles:
> `kid-ux-reviewer` **checks vibe-match + a11y** · the `blueprint` skill **references** the vibe.
> Change the vibe here first, then bring games to it.

## Who we design for
Kindergarten (K2–K3) and primary (P1–P6) children on **tablets**, English-primary,
offline-preferred. Many are **pre-readers**; some are **deaf, non-verbal, blind, or
motor-impaired**. A design that needs reading, hearing, speaking, or fine motor control to
operate **structurally excludes** a child. We commit to **WCAG 2.2 AA + W3C COGA**.

## 1. Own your UI — match the vibe
Each game builds its **own** UI (its own design tokens, buttons, characters) — there is no
shared component package to import. Freedom in *how*; the **boundary is the vibe**: the look in
this doc, the track doc, and the render previews. Define your tokens once per game (a `:root`
block) so the look is consistent *within* the game; keep real interactive elements as native
`<button>`s (keyboard + focus for free) at the a11y floor below. The reference for the look is
the track preview (`*-ui-ux.preview.html`) — read it and match it; don't reinvent the vibe.

## 2. Two-channel redundancy (contract law — golden rule #6 / PLAN §6b R17)
Every core **instruction**, **feedback**, and **action** must be reachable through **≥2
independent channels**, declared in `manifest.a11y` and rejected by `validate-contracts` if
single-channel.
- `instructionChannels`: ≥2 of `audio | visual | symbol`. **Audio instruction MUST have a
  visual/symbol twin** — a deaf pre-reader can read neither text nor audio.
- `inputChannels`: ≥2 of `tap | voice | camera | keyboard | switch`, **including `tap`**.
- **Voice (STT) is Android-Chrome-only and never required** — it degrades silently to tap.

## 3. Touch targets & input
- **Minimum touch target ≥44px.** (Kindergarten raises this to 64px — see its track doc.)
- `touch-action: manipulation` (kill the 300ms tap delay + double-tap zoom).
- **Every drag has a tap equivalent.** Keyboard + `:focus-visible` on every control;
  switch-navigable.

## 4. Motion & flash safety (PLAN §6b R19)
- Honour **`prefers-reduced-motion`** (each game's CSS zeroes animation globally via the
  reduced-motion media query; games also branch in
  JS to swap animated transitions for instant ones — see `manifest.a11y.reducedMotion`).
- Enforce **WCAG 2.3.1 flash limits** (≤3 general/red flashes per second) on bursts / cascades /
  fast-forward — a genuine **seizure safety** hazard, not a nicety.
- **No surprise autoplay.** Audio is teacher/child-initiated with a persistent mute ("calm mode").

## 5. Low-vision & colour
- High-contrast support, OS text-size respect, scalable Canvas text/zoom.
- **Colour is never the only cue** — pair hue with shape/icon/label (e.g. a score uses ★/☆
  *shape*, not colour; a city system pairs its colour with an icon). Every palette is
  distinguishable under common colour-vision deficiency.

## 6. Canvas accessibility (PLAN §6b R18)
Any Canvas/SVG interaction needs an accessible equivalent: a **Parallel DOM** (ARIA roles/labels
for tiles/cards/inspector) + **keyboard/switch navigation** + **live-region** announcements for
the AI's spoken line. A pretty Canvas with no DOM mirror is invisible to screen readers. (Critical
for the primary City sim; applies to any game that draws on Canvas.)

## 7. Honest AI + encouraging tone
The AI is **honest** — when it gets something "wrong", that is the *taught/configured* behaviour
(Big Idea 3), never a bug to hide. Feedback is **encouraging, never punitive**; results are tiered
and truthful rather than a flat "Great job!". (Kindergarten is **no-fail**; primary may have
fail/retry but it stays constructive — see each track doc.)

## 8. Honest inherent exceptions
If a lesson's *content* is intrinsically sensory (naming a colour, hearing a rhythm), say so
plainly in the blueprint's a11y-scope section — it's a **documented inherent limit**, not an
oversight — and list mitigations (CVD-safe palette, shape-coded score, a tactile/audio pairing for
teachers with an affected child). Everything *around* the sensory core still meets this standard.

## 9. Offline / no-CDN
Fonts, icons, and any assets are **self-hosted + SRI**, bundled for offline use — **no
third-party CDN at runtime** (golden rule #4). This includes the track display fonts and the AI's
face/expression assets.

---

### Enforcement (so this doc isn't just words)
- **`validate-contracts`** — rejects `manifest.a11y` with single-channel core actions / missing `tap`.
- **`kid-ux-reviewer`** — reviews each game against this doc **and** its track doc; FAILs on a
  missing channel, undersized targets, flash/motion violations, colour-only cues, voice-required
  paths, or a UI that drifts from the vibe (track doc + preview).
- **a11y lint + Playwright** (tablet viewport) + a **manual AT audit** (screen reader + switch) and
  an **SEN child** in the week-5 playtest (lint catches ~⅓; it can't detect "the deaf child has no
  path").
