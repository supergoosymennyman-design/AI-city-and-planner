# Primary UI/UX — "Command Deck"  ⚠ DRAFT

> The **look & feel for the primary track (P1–P6)** AI City Architect games. Read this **with**
> [`ui-ux-common.md`](ui-ux-common.md) (shared accessibility/design contract law) — this doc only
> covers what's *specific* to primary.
>
> Visual reference (render): [`primary-ui-ux.preview.html`](primary-ui-ux.preview.html).
> No shared UI package — each primary game defines these values in its **own** `:root` token block
> (a reference implementation lands with the first primary game).
>
> **⚠ DRAFT — the *aesthetic* is settled; the *structure* is being reframed.** See "Open: reframe
> to a component kit" below. Do not treat the three-screen city flow as final.

## Vibe
**Cool, capable, data-rich — an architect's command deck.** For older kids (anchored on **P3–P6**,
ages 8–11) who'd find the kindergarten "Bo" look babyish. A clean city-builder/strategy feel:
soft blueprint-grid canvas, geometric type, crisp data panels, sliders/dials, charts, a calm AI
advisor. It makes kids feel *trusted and in command*, not coddled.

## 1. Visual identity
- **Type:** geometric display (**Sora**) + clean body (**Plus Jakarta Sans**) — self-hosted. Modern
  and grown-up; deliberately *not* the rounded kindergarten font.
- **Palette:** cool brand **indigo `#4f6bed` + teal `#11c2b0`** on a soft cool canvas
  (`#eaf0f8` with a faint blueprint grid). Each **city system** has its own CVD-safe colour —
  power `#f5a524`, water `#2aa7ff`, parks `#35c46a`, transit `#8b6cf0`, health `#f0566b`,
  housing `#ff8a5b`, waste `#9a7b5a` — always paired with an icon.
- **Form:** elevated cards with subtle shadows, crisp ~14–16px corners, snappier (less bouncy)
  motion than KG.

## 2. The AI Advisor — a console, not a mascot
The curriculum's "conversational trade-off analyzer" is a **calm panel** with an abstract AI glyph
(no face, no feelings) that **suggests and warns** ("the data center next to housing will spike
noise — move it by the river?"). The child stays the decision-maker; the AI never overrides.
Advice is two-channel (shown + readable aloud). *(The source doc leaves space for an optional
guide/narrator character later; the advisor console is the default.)*

## 3. What the primary programme actually is (drives the structure)
"AI City Architect" is **~20 lessons of *different* AI-concept mini-games**, each scaled across six
age columns **P1→P6** (same concept, harder each grade), ~45 min each — building toward the
**finale (L18–20)** where everything merges into one **live, deterministic City**. Examples:
- **Classification / feature detection / training:** Waste Sorters (annotate features → train a model)
- **Sensing + speed↔accuracy + optimization:** Subsurface Scanning (grid scan, charts, sliders, drill samples)
- **Pathfinding / multi-agent / rules:** Grid Movement, Drone Routing, Swarm, Delivery Loops
- **Scheduling / optimization:** Bus Scheduling, Traffic Lights, Traffic Waves, Air Traffic Control
- **Resource systems:** Healthy City, Water Supply, Power Grid
- **Data / economics / NLP:** Smart Monitoring, Tokenomics, Sentiment Analysis, Government Finances
- **The merge (L18–20):** Design → Optimize → Live-Simulate the City

## 4. ⚠ Open: reframe "city dashboard" → a 2D-sim **component kit**
A fixed *Build → Tune → Simulate a city* flow fits only the L18–20 finale, **not** the other ~17
varied games. So the primary standard will be a **kit of recurring components** the games compose,
all in the Command Deck look — the City is just *one assembly*:
- a **2D grid/map stage** (Canvas + Parallel-DOM mirror)
- **drag-drop placement** + **finger-path drawing** (each with a tap/keyboard fallback)
- **live data charts / readouts** (with text/aria labels)
- **sliders/dials** for tuning AI rules, with trade-off explanations
- a **"train-the-model" step** (annotate → train → plug in)
- a **"run simulation" mode** (deterministic; speed 1×–1000×, scrubbable timeline)
- the **AI Advisor** panel · a **status bar** (budget/tokens, sim speed)

**TODO before this leaves DRAFT:** revise `primary-ui-ux.preview.html` to show the kit across
several lesson types (e.g. Waste Sorters, Subsurface, Drone, City finale), confirm with the SME,
then lock the component list + tokens.

## 5. Targets, pacing, accessibility
- Touch targets ≥44px (the common floor; primary doesn't need the KG 64px but stays tablet-friendly).
- Pacing fits a **45-minute** lesson; more information density than KG is fine (readers).
- **Determinism (City contract):** sim is fixed-point + seeded — same inputs → same city.
- Canvas map/sim **must** have the keyboard/PDOM mirror from [`ui-ux-common.md`](ui-ux-common.md) §6.

Everything else (two-channel, motion/flash, colour-blind safety, offline) is in
[`ui-ux-common.md`](ui-ux-common.md).
