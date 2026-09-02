# Badges & Tiers — the Inspector's progression

**Status:** DESIGN (v0.1). Client-only — no external-team dependency.
**Goal:** recognise, never gate. A child earns a badge by CREATING and PROVING a
real AI ability; the badge is the *record of the proof*, not a reward for time or
clicks, and never a key to content.

## The core rule (the line that reconciles "no unlocks")

> A badge is a **retroactive diploma**. Recognition validates what the child just
> did; it never dictates what they are allowed to do next.

Nothing is ever greyed out or hidden behind a badge. Every part of the Workshop is
available on day one. The badge appears only AFTER the evidence exists.

## The tiers (conceptual depth, not points or time)

Role-named (deliberately NOT metallic ranks — "Bronze/Gold" invites social
comparison; role names invite identity):

| Tier | Name | What it means | Typical evidence |
|---|---|---|---|
| 1 | **Builder** | "It works" — a single trained machine maps inputs to outputs | one pile, trained, reacts |
| 2 | **Skeptic** | "You proved it" — honest split, held-out test | study vs held-out, two scores, not just memorising |
| 3 | **Auditor** | "You can find its limits" — abstention + error tracing | confidence threshold set; catches "not sure" on tricky cases; traces a wrong answer to data |
| 4 | **Architect** | "You compose systems" — ensembles, cascades, monitoring, feedback | multiple tested machines wired; confidence flows between them |

These are the same depth axes as the Workshop's own pedagogy (fit → evaluate →
diagnose → adjust → compose). They are NOT the same as the capability-bridge
stages (what the City can run) — see `tool-integration-map.md` (two axes).

## The Evidence Protocol (what makes a badge honest)

A badge must permanently embed the telemetry of the machine that earned it:

- the held-out (never-met) score,
- the abstention rate / the confidence threshold the child set,
- a snapshot of the data split (study / check / sealed counts),
- a short "why" line in plain words.

It is an **immutable certification stamp**, not a sticker. The badge never says
"100%!" — it says "92% on 14 crates it had never seen; said 'not sure' below 0.62."

Awarded **mechanically by the Evaluator** (the split/held-out/evidence), never by a
teacher click, never by attendance.

## Anti-patterns (the three ways it goes wrong — ban these)

1. **The Skinner Box** — "Train 50 models!" (rewards mindless repetition without checking quality).
2. **The Attendance Sticker** — "Complete the tutorial!" (rewards presence, not demonstrated capability).
3. **The Overfitter's Trap** — "Achieve 100% accuracy!" (rewards deleting hard edge-cases or testing on training data to chase the number).

Any badge whose trigger is *quantity, time, or a perfect score* is corrupt by
definition.

## Display model (in the app)

Primary surface = a **single small tier emblem in a HUD corner** (top-right of the
3D AI City, near the mission counter), PUBG-style: instantly readable, no
leaderboard. For now it shows the **lowest tier (Builder)** — the award engine is
not wired yet (see below).

- **Tap the emblem** → the **Inspector's Logbook**: a passport/Pokédex-style
  collection of earned badges, each flipping to its **Evidence Card** (held-out
  score, threshold, edge-case examples).
- Optional cosmetic: the champion may *wear* an earned badge (sash/pin) — pure
  identity, never a content gate.

## Transferability

Badges live in the **Champion File** (a `badges` array in the portable schema,
plus a key in `champion-file.js`'s `CF_KEYS`), so they follow the child across
devices and lessons via the existing save/restore + cloud codes. A badge earned on
one iPad shows on the next after restore.

## Where the award comes from (and why it's not wired yet)

Badges are triggered by **capability evidence** — the `.cap` bundles a child
exports from the Workshop (see `capability-bridge.md`). The evidence source does
not exist on our side yet (Workshop team builds the export; we build the City
runtime). Until it does, the programme shows the **general idea**:
- the emblem (lowest tier) is visible and harmless;
- the award rule engine is a pure, unit-testable module keyed to a generic
  "capability evidence" shape, so it activates the moment evidence flows —
  no rework needed.

Tier progression is a **ratchet** (monotonic): a badge is never lost.

## MVP for this sprint

1. `badges` slot in the Champion File (transferable, backward-compatible).
2. Small tier emblem in the City HUD corner — **shows "Builder"** (lowest tier).
3. Tap → minimal Logbook shell (no evidence cards yet — placeholder copy
   "your badges will light up as you prove your machines").

Nothing else — no award logic, no gating, no leaderboard.
