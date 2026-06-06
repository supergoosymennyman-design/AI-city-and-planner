---
lesson: 3
track: kindergarten
title: Color the Rainbow
ageBand: K2-K3
bigIdea: 3
aiRepresentation: rule-based
smeReviewed: false
reviewer: ''
owner: ''
---

# Lesson 3 — Color the Rainbow

> Extracted from `source/Kindergarten/This is how the Kindergarten games should work.docx`.
> This is the authoritative brief the game is built to (DoD pedagogy gate). The full
> 20-lesson extraction + `lessons.json` registry is a separate task (see PROGRESS).

## Simple AI explanation (teacher says, Part A)
"Friends, AI knows shapes, but right now AI sees everything in black and white! Today we
are going to teach AI about colours. We will colour shapes, and AI will learn the names of
the colours. Then AI will be able to see the rainbow just like us!"

## The teachable-machine truth (the core mechanic — do NOT soften)
The AI has **no built-in knowledge of colour**. It learns *only* the label the children
give it, with **no correction**. If the class colours a circle red but says "blue", the AI
learns that swatch is "blue" — and in the recognition game it will insist that red swatch is
"blue". That visible mistake **is** the lesson (Big Idea 3: an AI is only as good as its
training; `aiRepresentation: rule-based` — a 1-nearest-neighbour over taught examples).

## 25-minute flow
- **Part A — Teach Red (8 min):** colour an empty circle red → "AI, what colour is this?" →
  AI: "Hmm… I don't know this colour." → children: "Red!" → all: "AI, this is red!" →
  teacher taps *Teach* → AI: "Red! Like an apple! I'm learning!"
- **Part B — Teach Blue & Yellow (8 min):** colour a square blue ("AI, this is blue!" →
  "Blue! Like the sky!"); colour a triangle yellow ("AI, this is yellow!" → "Yellow! Like the
  sun! I know three colours now!").
- **Part C — Colour Recognition Game (9 min):** AI shows a colour it learned → "What colour
  is this?" → children name it → AI confirms against **what it learned** ("Correct! You are so
  smart!"). Wrong answers get the AI's learned label ("That's blue!").

## Inputs (two-channel, golden rule #6)
- **Voice (primary in the script):** children *say* "AI, this is red!" — STT captures it.
  Android-Chrome only; absent on iPad/Safari, so it is never required.
- **Tap / keyboard (always present):** colour swatches + named answer buttons; the "Fill it!"
  button completes the colouring without drawing.

## Accessibility scope (honest — flagged by kid-ux-reviewer)
Instructions, feedback, and every action are two-channel (spoken + on-screen; tap + voice +
keyboard). **But the lesson *content* is colour perception** — naming a colour you cannot see
is intrinsic to the objective, like a rhythm lesson needs hearing. So Part C's stimulus is
necessarily visual-colour; this game is **not** fully operable by a blind child, and that is a
documented, inherent exception — not an oversight. Mitigations in place: red/blue/yellow are
distinguishable under common colour-vision deficiency; score stars use ★/☆ shape (not colour)
so the score is readable without hue. Future enhancement: a colour-blind-safe pattern per
swatch. Teachers with a blind child should pair this with a tactile/audio colour activity.

## Learning objective
Teach an AI the names of the primary colours (red, blue, yellow) by colouring shapes and
naming them; recognise those colours; understand the AI only knows what it is taught.

## Observable success criteria
- Teaches the AI red, blue, and yellow by colouring a shape and naming each.
- Correctly names colours the AI shows in the recognition game.
- (Concept) Recognises that the AI repeats back exactly what it was taught.

## Common misconception this game must NOT reinforce
That the computer already "knows" colours. It does not — teach it wrong and it answers wrong.
