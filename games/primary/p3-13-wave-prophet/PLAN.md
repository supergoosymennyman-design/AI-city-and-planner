# Wave Prophet — Game Plan

> **Game ID:** `p3-13-wave-prophet`
> **Entry Point:** `games/primary/p3-13-wave-prophet/index.html`

## Overview

| Field | Value |
|---|---|
| **Track** | Primary |
| **Band** | P3 (Age 8) |
| **Lesson** | 13 — Predictive Traffic Flow & Emergency Routing |
| **Source** | `source/primary/lessons/lesson-13/p3/prompt.md` |
| **AI Concepts** | Predictive modeling, shockwave theory, multi-agent systems, anomaly detection |
| **Tech Stack** | Vanilla HTML/CSS/JS, Canvas API |
| **AI Assistant** | Cascade — passive STT/TTS predictive traffic AI |

## Learning Objective

Students learn **predictive modeling and preemptive action**. They manage an AI-powered smart intersection where translucent "Forecast Bands" show incoming traffic waves 5 seconds before they arrive. The kid adjusts green light timers to absorb these waves before they become jams.

## Narrative Arc

"Cascade is WaterCity's new predictive traffic AI. It can see traffic waves forming before they reach the intersection. But seeing isn't enough — someone has to ACT on the predictions."

1. Cascade shows a simple forecast (L1)
2. Kid balances two competing forecast waves (L2)
3. Kid handles a sudden surge (L3)
4. Kid coordinates two sequential lights (L4)
5. Kid maintains flow under continuous changing forecasts (L5)
6. Quiz certification (L6)

## AI Visibility

- Level banners: "LEVEL 1: PREDICTIVE MODELING — How AI Sees the Future"
- Cascade state badge: 🔵Observer → 🟢Reader → 🟡Predictor → 🟠Coordinator → ⭐Prophet
- End-of-level recaps: "🧠 You just taught Cascade: **Predictive Modeling** — AI watches trends to predict what happens next."
- Quiz: 10 questions on prediction, forecasting, shockwave theory

## Level Design

### Level 1 — Read the Future (Predictive Modeling)
- **Banner:** 🔮 LEVEL 1: PREDICTIVE MODELING — How AI Sees the Future
- Single N-S road. A translucent blue forecast band appears, stretching from the North — wider band = more cars arriving in ~5 seconds.
- Kid taps **+3s** to extend green light. The band shrinks as cars pass through.
- 3 rounds: 8-car wave, 15-car wave, 25-car wave.

### Level 2 — The Balancing Act (Multi-Signal Coordination)
- **Banner:** ⚖️ LEVEL 2: MULTI-SIGNAL COORDINATION — Juggling Two Forecasts
- Two forecast bands: North (big wave arriving in 4s) + East (small wave arriving in 2s).
- Kid must give 8s green to North first (absorb the big wave), then switch to East. Wrong order = gridlock.
- 3 rounds with different wave sizes and arrival times.

### Level 3 — The Sudden Surge (Anomaly Detection)
- **Banner:** ⚡ LEVEL 3: ANOMALY DETECTION — Spotting the Unexpected
- Normal traffic flow. Suddenly a thick red band appears from the West (stadium exit).
- Kid must quickly drain current lane (shorter red for crossing traffic) and extend green for the surge.
- A countdown timer adds pressure. 3 rounds: 15-car surge, 30-car surge, 50-car surge.

### Level 4 — Green Corridor (Multi-Agent Coordination)
- **Banner:** 🟢 LEVEL 4: MULTI-AGENT COORDINATION — Two Lights, One Goal
- Two traffic lights in sequence (200m apart). Cars leaving Light A become a forecast at Light B.
- Kid sets timers at BOTH lights so cars pass both without hitting a single red.
- Bonus for "Perfect Wave" (all cars pass both greens).

### Level 5 — The Perfect Absorber (Reinforcement Learning / Optimization)
- **Banner:** 🏆 LEVEL 5: OPTIMIZATION — The Perfect Wave Absorber
- Continuous mode. Forecast bands from all 4 directions update every 2 seconds.
- Kid continuously adjusts +/- timers to maintain **Global Flow Score ≥ 90%** for 60 seconds.
- If score drops below 70%, visual jam appears. 3 difficulty tiers.

### Level 6 — Predictive Traffic Exam
- **Banner:** ✏️ LEVEL 6: PREDICTIVE TRAFFIC EXAM — AI Literacy
- 10 multiple-choice questions. Pass: 7/10.
- Covers: predictive modeling, forecast bands, multi-agent coordination, anomaly detection, optimization.

## Companion: Cascade 🌊

- State badge: 🔵Observer → 🟢Reader → 🟡Predictor → 🟠Coordinator → ⭐Prophet
- Personality: Calm, forward-thinking. "The forecast shows a dense wave from the North in 5 seconds. Prepare the green light now."
- Intents: `what_is_prediction`, `what_is_forecast`, `what_is_shockwave`, `what_is_coordination`, `hint`

## Visual Design

- **Theme:** Midnight blue `#0B132B` with translucent glowing forecast bands (rgba blue/amber)
- **Intersection:** 4-way birds-eye view on canvas with animated car dots
- **Forecast bands:** Animated rectangular bands that grow/shrink in width, colored blue (normal) or red (surge)
- **Flow Score:** Semi-circular speedometer gauge (green → yellow → red)
- **Typography:** Fredoka One (headings), Nunito (body), monospace (timer + score)

## Interaction Modes
1. **+3s / −3s timer buttons** — adjust green light duration
2. **Tap lane** to switch which direction gets green
3. **Forecast band observation** — visual-only, kid reads band width to decide priorities
4. **Flow Score gauge** — passive feedback
5. **Quiz** (Level 6)
