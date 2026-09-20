# Cool Grid Architect — Game Plan

> **Game ID:** `p3-10-cool-grid-architect`
> **Entry Point:** `games/primary/p3-10-cool-grid-architect/index.html`

## Overview

| Field | Value |
|---|---|
| **Track** | Primary |
| **Band** | P3 (Age 8) |
| **Lesson** | 10 — Intelligent Power Grid Management |
| **Source** | `source/primary/lessons/lesson-10/p3/prompt.md` |
| **Tech Stack** | Vanilla HTML/CSS/JS, DOM grid rendering |
| **AI Concepts** | Edge computing, load balancing, dynamic pricing (P3 intro) |

## Learning Objective

Students learn how AI Data Centers need strategic placement (cool locations = less energy on cooling), how renewable energy sources (solar, wind) work differently depending on geography, and how to balance multiple factors (cooling, power, distance) to optimize an AI city's smart grid.

## Levels

| # | Name | AI Concept | Goal | Items |
|---|------|------------|------|-------|
| 1 | Cool the Data Center | Edge Computing | Place Data Center on cool tile (mountain/river) | Data Center |
| 2 | Power It Up | Load Balancing | Place power source matching terrain | Solar Panel, Wind Turbine |
| 3 | Close But Cool | Trade-off Optimization | Balance cooling vs. proximity to city | Data Center |
| 4 | Mixed Energy Grid | System Design | Place all 3 items on best terrains | Data Center, Solar, Wind |
| 5 | Master Architect | System Optimization | Maximize Eco-Score under token budget | Data Center, Solar, Wind |

## Interaction

- Tap item in drawer → select it (highlights)
- Tap grid tile → place item with real-time score feedback
- Grid cells show color-coded preview (green=good, yellow=ok, red=poor) when item is selected
- Remove placed items by tapping them

## File Structure

```
index.html      Entry point (all UI)
style.css       Design system + layout
game.js         Game logic, state machine, levels
levels.js       Level data, terrain defs, scoring
audio.js        Web Audio SFX
manifest.json   PWA manifest
PLAN.md         This file
test/index.test.js  Unit tests
```

## Color Palette (Energy Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg` | `#0F172A` | Background |
| `--color-surface` | `#1E293B` | Panels |
| `--color-primary` | `#3B82F6` | Buttons, active state |
| `--color-success` | `#22C55E` | Good placement |
| `--color-warning` | `#EAB308` | OK placement |
| `--color-danger` | `#EF4444` | Bad placement |

## Touch Targets

- All interactive elements ≥44px
- Grid tiles ≥40px minimum
- Item slots ≥60px
- Result buttons ≥48px
