# Kid UI/UX Standard — the crayon design language

> **Single source of truth** for how every AI-Education game looks and how every child operates
> it. This doc *names* the rules; the concrete values live in
> [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css) and are enforced by the
> `kid-ux-reviewer` agent + `validate-contracts` + a11y lint / Playwright. Consolidates what was
> previously split across [PLAN.md §6b](../PLAN.md), `tokens.css`, and the reviewer prompt.
>
> Roles: `tokens.css` **implements** this · `@edu/ui` **packages** it · `kid-ux-reviewer`
> **enforces** it · the `edu-frontend` skill **teaches** it · the `blueprint` skill **references**
> it. Change the standard here first, then the implementation.

## Who we design for
Kindergarten (K2–K3) and primary (P1–P6) children on **tablets**, English-primary,
offline-preferred. Many are **pre-readers**; some are **deaf, non-verbal, blind, or
motor-impaired**. A design that needs reading, hearing, speaking, or fine motor control to
operate **structurally excludes** a child. We commit to **WCAG 2.2 AA + W3C COGA**.

## 1. Visual identity — "crayon colouring-book"
Warm paper surfaces, hand-drawn wobble, sticker-lift shadows, rounded type. Set by the *Color
the Rainbow* reference game and encoded as tokens. **No hardcoded colours/fonts/sizes in
games** (golden rule #3 spirit) — always use the tokens / `@edu/ui`.

- **Type:** `--edu-font` (rounded, resolves to SF Rounded on iPad — no CDN/Google Fonts).
- **Surfaces & ink:** warm paper (`--edu-bg`), **never pure black** ink (`--edu-ink`) — softer
  for young eyes.
- **Palette:** the teachable crayon colours (`--edu-red/-blue/-yellow/-green`) + warm
  crayon-orange brand (`--edu-primary`). Colour is **decorative/secondary**, never the only cue.
- **Shape & motion feel:** generous rounding (`--edu-radius`), bouncy ease
  (`--edu-ease-bounce`), the signature chunky "sticker" button that physically depresses.

## 2. Components — use `@edu/ui`, grow it deliberately
Compose games from `@edu/ui` primitives so accessibility is inherited for free; **never** hand-
roll a styled `<div>` button. The library is intentionally **young** — today only `Button` is
built; `AICharacter / Dialog / DragBoard / Slider / Progress` are planned. **Grow `@edu/ui`
when the 2nd/3rd game needs a primitive, never speculatively (YAGNI)** — and every new primitive
must meet the a11y floor below before games use it.

## 3. Touch targets & input
- **Minimum touch target ≥44px; kindergarten floor is `--edu-tap-min: 64px`.** Check real
  interactive elements, not decorative ones.
- `touch-action: manipulation` (kill the 300ms tap delay + double-tap zoom).
- **`tap` is always present** (golden rule #6). Every drag has a **tap equivalent**. Voice
  (STT) is Android-Chrome-only and **never required** — it degrades silently to tap.
- Keyboard + `:focus-visible` on every control; switch-navigable.

## 4. Two-channel redundancy (contract law — golden rule #6 / §6b R17)
Every core **instruction**, **feedback**, and **action** must be reachable through **≥2
independent channels**, declared in `manifest.a11y` and rejected by `validate-contracts` if
single-channel.
- `instructionChannels`: ≥2 of `audio | visual | symbol`. **Audio instruction MUST have a
  visual/symbol twin** — a deaf pre-reader can read neither text nor audio.
- `inputChannels`: ≥2 of `tap | voice | camera | keyboard | switch`, **including `tap`**.

## 5. Motion & flash safety (§6b R19)
- Honour **`prefers-reduced-motion`** (tokens.css zeroes animations globally; games also branch
  in JS to swap animated fills for instant ones — see `manifest.a11y.reducedMotion`).
- Enforce **WCAG 2.3.1 flash limits** (≤3 general/red flashes per second) on bursts/cascades /
  fast-forward — this is a genuine **seizure safety** hazard, not a nicety.
- **No surprise autoplay.** Audio is teacher/child-initiated with a persistent mute ("calm
  mode").

## 6. Low-vision & colour
- High-contrast support, OS text-size respect, scalable Canvas text/zoom.
- **Colour is never the only cue** — pair hue with shape/icon/label (e.g. score uses ★/☆ shape,
  not colour). Palette is distinguishable under common colour-vision deficiency.

## 7. Canvas accessibility (§6b R18 — primarily the City)
Canvas/SVG interactions need an accessible equivalent: a **Parallel DOM** (ARIA roles/labels
for tiles/districts/inspector) + **keyboard/switch navigation** + **live-region** announcements
for the AI's spoken line. A pretty Canvas with no DOM mirror is invisible to screen readers.

## 8. Pacing & tone
Fits the lesson length (KG: 25-min teacher-led). Feedback is **encouraging, never punitive**;
kindergarten games are **no-fail**. The AI is **honest** — when it gets something "wrong," that
is the taught behaviour (Big Idea 3), not a bug to hide.

## 9. Honest inherent exceptions
If the lesson *content* is intrinsically sensory (naming a colour, hearing a rhythm), say so
plainly in the blueprint's a11y-scope section — it's a **documented inherent limit**, not an
oversight — and list mitigations (CVD-safe palette, shape-coded score, a tactile/audio pairing
for teachers with an affected child). Everything *around* the sensory core still meets this
standard.

---

### Enforcement (so this doc isn't just words)
- **`validate-contracts`** — rejects `manifest.a11y` with single-channel core actions / missing
  `tap`.
- **`kid-ux-reviewer`** — reviews each game against §3–§8 above; FAILs on a channel a build
  lacks, undersized targets, flash/motion violations, colour-only cues, voice-required paths.
- **a11y lint + Playwright** (tablet viewport) + a **manual AT audit** (screen reader + switch)
  and an **SEN child** in the week-5 playtest (lint catches ~⅓; it can't detect "the deaf child
  has no path").
