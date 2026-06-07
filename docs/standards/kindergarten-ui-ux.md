# Kindergarten UI/UX — "Sticker Lab + Bo"

> The **look & feel for the kindergarten track (K2–K3)** teachable-machine games. Read this
> **with** [`ui-ux-common.md`](ui-ux-common.md) (the shared accessibility/design contract law) —
> this doc only covers what's *specific* to kindergarten.
>
> Visual reference (render): [`kindergarten-ui-ux.preview.html`](kindergarten-ui-ux.preview.html).
> Values implemented in `packages/ui/src/tokens.css` (kindergarten theme).

## Vibe
**Bright, warm, cartoonish — a sunny sticker-book.** Warm cream paper, soft pastel background
blobs, thick dark cartoon outlines, glossy "sticker" buttons that physically depress, chunky
rounded type, gentle bouncy motion, confetti joy. Designed for pre-readers who bond with
characters but must never be patronised into confusion.

## 1. Visual identity
- **Type:** chunky rounded display (**Baloo 2**) + rounded body (**Nunito**) — self-hosted
  (no CDN). Warm and friendly; legible for pre-readers.
- **Palette (candy on warm cream):** tomato `#ff5a4d`, sun `#ffc02e`, grass `#3fce7c`,
  sky `#37b6ff`, grape `#9b6cff`, bubble `#ff6fb5`; warm paper `#fff6e6`; warm-brown ink
  `#3a2a20` (**never pure black**). Colour is decorative — always paired with shape/label.
- **Form:** thick `3px` ink outlines on everything; hard "sticker" shadow that shrinks on press;
  generous rounding. Motion is bouncy but gentle (honours reduced-motion).

## 2. Bo — the AI you teach
A friendly **screen-robot** whose **screen is its face**: pre-readers read its emotion instantly,
and because the face is on a *display*, it reads as a machine showing a picture — not a living
mind that already knows things (keeps Big Idea 3 honest).
- **Fixed expression set (our own SVG, self-hosted, identical on every device):** **Hello**
  (idle) · **Hmm?** (doesn't know yet, `?`) · **Listening** (sound waves; push-to-talk) ·
  **Learning!** (wide eyes + sparkle, just taught) · **Knows it!** (happy, correct) · **Oops**
  (taught-wrong → wrong, honest). These six + the body = every KG game; no new art per lesson.
- Bo's spoken lines are **always mirrored on-screen** in a speech bubble (two-channel).
- Bo boots up knowing nothing; what it learns appears on the **"🧠 Bo knows" shelf** — its visible
  memory, so kids see it only knows what the class taught.
- "Bo" is a working name (a locale may rename it).

## 3. Screen skeleton — the same three every game
A pre-reader who learns one game can play all 20. Always: **instruction banner top · Bo + the
subject centre-stage · big sticker actions bottom.**
1. **Teach** (teacher-led) — Bo shows "Hmm?"; teach by tap **or** voice (optional).
2. **Recognise** (child plays) — Bo asks; answer by tap (always) **or** mic (optional); label +
   colour, never colour alone.
3. **Celebrate** (honest result) — Bo beams "Knows it!"; score in ★/☆ **shape**; tiered + honest
   (a low score teaches the mistraining lesson, never a flat "Great job!").

## 4. Targets, pacing, tone
- **Touch target floor is 64px** (`--edu-tap-min`) — bigger than the common ≥44px, for little hands.
- Pacing fits a **25-minute teacher-led** lesson; one primary action per screen.
- **No-fail:** kindergarten games never punish; the AI's "wrong" is the honest taught behaviour.

Everything else (two-channel, motion/flash safety, colour-blind safety, Canvas a11y, offline) is
in [`ui-ux-common.md`](ui-ux-common.md).
