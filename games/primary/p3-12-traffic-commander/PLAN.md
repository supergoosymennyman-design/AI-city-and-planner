# Traffic Commander — Game Plan

> **Game ID:** `p3-12-traffic-commander`
> **Entry Point:** `games/primary/p3-12-traffic-commander/index.html`

## Overview

| Field | Value |
|---|---|
| **Track** | Primary |
| **Band** | P3 (Age 8) |
| **Lesson** | 12 — Adaptive Traffic Signal Optimization |
| **Source** | `source/primary/lessons/lesson-12/p3/prompt.md` |
| **Game ID** | `p3-12-traffic-commander` |
| **Entry Point** | `games/primary/p3-12-traffic-commander/index.html` |
| **Tech Stack** | Vanilla HTML/CSS/JS, Canvas API, CSS Animations |
| **Architecture** | Self-contained single-page game, all 6 levels unlocked from start |
| **AI Assistant** | Flux — passive STT/TTS traffic controller |

## Learning Objective

Students learn how **inductive loop sensor networks** and **AI traffic control systems** manage urban traffic. They train an AI assistant (Flux) by: reading sensor data to understand queue lengths, predicting when lanes will overflow, filtering false signals (bikes vs cars), prioritizing the most urgent lanes, and setting automation thresholds — culminating in an AI literacy quiz.

## Narrative Storyline

The player is a **Junior Traffic Engineer** at **GridCity**. The city has installed **Flux**, a brand-new AI traffic controller with inductive loop sensors buried under every intersection. But Flux is COMPLETELY UNTRAINED — it can detect cars but has no idea what to do about them.

**The Arc:**

1. **Opening:** GridCity is in gridlock. The mayor deploys Flux. "Flux can feel every car on every lane. But it doesn't know when to turn the light green. It can't tell a bus from a bicycle. You're the Junior Traffic Engineer — TRAIN IT."

2. **Levels 1–5:** The kid trains Flux through 5 stages:
   - 🟡Untrained → 🟢Sensing (Lv1: teaches sensor reading)
   - 🟢Sensing → 🔵Predicting (Lv2: teaches load prediction)
   - 🔵Predicting → 🟣Filtering (Lv3: teaches signal filtering)
   - 🟣Filtering → 🟠Prioritizing (Lv4: teaches multi-lane priority)
   - 🟠Prioritizing → ⭐Autonomous (Lv5: teaches automation thresholds)

3. **Level 6:** The kid earns their **Traffic Commander Certification** by passing a 10-question AI literacy quiz.

4. **Closing:** "Flux: Day 1 (confused, random flushes, fooled by bikes)" vs "Flux: After Training (managing 4 lanes autonomously). This AI didn't come out of a box this way. YOU trained it."

## AI Visibility — Clear to Outside Observers

1. **Level banners** — "LEVEL 1: SENSOR DATA — How AI Reads the Road"
2. **Flux AI Dashboard** — Persistent right-side panel showing Flux's training progress, concepts mastered, stats
3. **Flux state badge** — Changes color/icon with each level completed
4. **End-of-level recaps** — "🧠 You just taught Flux about: Load Prediction"
5. **Quiz** — 10 questions mapping 1:1 to AI concepts
6. **Conclusion** — Side-by-side before/after comparison

## UI Layout — Multi-Lane Dashboard Design

```
┌──────────────────────────────────────────────────────────────┐
│ 🚦 Traffic Commander    [L1][L2][L3][L4][L5][L6]  🔧📝⚙️   │
├──────────────────────────────────────────────────────────────┤
│ LEVEL BANNER with AI concept name                             │
├───────────────────────────────────┬──────────────────────────┤
│                                   │ ┌─ FLUX AI STATUS ────┐ │
│ ROAD SURFACE (birds-eye)         │ │ Status + state badge │ │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐             │ │ Concepts: ████░░    │ │
│ │🚗│ │🚗│ │  │ │  │             │ │ Stats, Confidence   │ │
│ │🚗│ │  │ │  │ │  │             │ └──────────────────────┘ │
│ └┬─┘ └┬─┘ └┬─┘ └┬─┘             │                          │
│  │    │    │    │                │  📝 Transcript drawer    │
│ ═╧════╧════╧════╧══             │                          │
│ ║S║  ║S║  ║S║  ║S║             │                          │
│ ║██║  ║█║  ║█║  ║█║             │                          │
│ BAR GRAPHS (subterranean)        │                          │
│ A: ██████████░░ 65%              │                          │
│ B: ████░░░░░░░░ 20%              │                          │
│ C: ████████████ 95% ⚠️           │                          │
│ D: ░░░░░░░░░░░░  0%              │                          │
│                                   │                          │
│ 🚦 F L U S H  [tap a lane]       │                          │
├───────────────────────────────────┴──────────────────────────┤
│ 🤖 Flux: "Lane C is about to overflow!"                       │
└──────────────────────────────────────────────────────────────┘
```

### Three Visual Zones

1. **Road Surface** (top canvas) — Birds-eye view of lanes with animated car sprites
2. **Underground Cutaway** (middle) — Cross-section showing inductive loop sensors glowing
3. **Bar Graphs** (bottom) — Animated bars per lane with color grading: green→amber→orange→red

### Flux AI Dashboard (Persistent Right Panel)

```
┌─ FLUX AI ──────────────────┐
│ 🤖 Flux                    │
│ Status: 🟠 PRIORITIZING    │
│                            │
│ ─ Concepts ─────────────── │
│ 🟢 Sensor Data  ████████  │
│ 🟢 Prediction   ████████  │
│ 🟢 Filtering    ████████  │
│ 🟠 Priority     ████░░░░  │
│ ⬜ Automation   ░░░░░░░░  │
│                            │
│ ─ Stats ────────────────── │
│ Vehicles:   47             │
│ Flushes:    18             │
│ Falses:      2             │
│ Confidence: 72% ██████░░  │
└────────────────────────────┘
```

## Level Design — All 6 Levels Unlocked from Start

---

### Level 1 — The First Light

**AI Concept:** SENSOR DATA — How AI reads the physical world

**Banner:** 🚗 LEVEL 1: SENSOR DATA — How AI Reads the Road

**Mechanics:**
- Single lane view with road surface, inductive loop sensor below, and bar graph
- A car arrives → sensor glows amber → bar fills slowly
- Traffic light shows RED
- Kid must press **Flush** when bar hits the RED zone (80%+)
- Flush too early (green zone) → "Wasted green light! Not enough cars yet."
- Flush too late (bar overflows) → gridlock animation + red flash
- 3 rounds with different vehicles: sedan (slow fill), family van (medium fill), delivery truck (fast fill)
- Each vehicle has different metal mass → different fill speed

**What Flux learns:** High bar = long wait = time to flush. Low bar = no queue = wait.

**Win condition:** Flush in the correct zone all 3 rounds.

**Recap:** "🧠 You just taught Flux: **Sensor Data** — AI gets information about the world through sensors. The inductive loop is how Flux 'sees' cars!"

---

### Level 2 — Rush Hour

**AI Concept:** LOAD PREDICTION — AI predicts when queues will overflow

**Banner:** 📊 LEVEL 2: LOAD PREDICTION — How AI Sees the Future

**Mechanics:**
- Single lane view. Multiple cars (3–7) queue on the sensor
- Bar fills at different speeds based on car count
- A **dotted prediction line** extends above the bar showing projected fill in ~3 seconds
- A timer shows "Overflow in X seconds"
- Kid must flush BEFORE the prediction line reaches the overflow ceiling
- 3 rounds: 3 cars (slow fill), 5 cars (fast fill), 7 cars (very fast fill)

**What Flux learns:** More cars = faster fill rate = need to flush sooner. Watch the TREND to predict overflow.

**Win condition:** Flush all 3 rounds before overflow.

**Recap:** "🧠 You just taught Flux: **Load Prediction** — AI watches how fast the bar rises and PREDICTS when it will overflow."

---

### Level 3 — False Alarm

**AI Concept:** SIGNAL FILTERING — AI ignores noise and false signals

**Banner:** 🚲 LEVEL 3: SIGNAL FILTERING — Don't Believe Everything You Sense

**Mechanics:**
- Single lane. Different road users appear on the sensor in sequence
- **Bike** (low metal mass) → bar fills to ~10% and stops. Kid must NOT flush. After 10s, a real car arrives → bar shoots up → NOW flush.
- **Motorcycle** (medium metal) → bar fills to ~30%. Kid must NOT flush. Wait for car.
- **Pedestrian** (negligible metal) → bar barely moves. Kid must NOT flush.
- Flushing early = "Wasted green! That was just a [bike/motorcycle/person] — not real traffic!"
- Each scenario passes when kid correctly waits for actual vehicle traffic

**What Flux learns:** Not everything on the sensor is a car. Different metal masses give different readings. AI must FILTER weak signals and react to strong ones.

**Win condition:** Correctly identify all 3 scenarios without false flushes.

**Recap:** "🧠 You just taught Flux: **Signal Filtering** — AI ignores weak signals (bikes) and acts on strong ones (cars)."

---

### Level 4 — Crossroads Commander

**AI Concept:** PRIORITY OPTIMIZATION — AI compares inputs and picks the most urgent

**Banner:** 🚦 LEVEL 4: PRIORITY OPTIMIZATION — Who Goes First?

**Mechanics:**
- 4 lanes (A/B/C/D) shown simultaneously in a 2×2 intersection
- Each lane has its own: road surface, loop sensor, bar graph (fill color), traffic light
- All 4 bars fill simultaneously at different rates
- Kid taps a lane to flush it → that lane's light turns green, bar resets
- Kid must flush the lane with the HIGHEST bar FIRST, then the next highest, etc.
- Overflow in one lane → gridlock animation → try again
- 3 rounds with different traffic distributions

**What Flux learns:** I have limited green lights. I compare ALL lanes and pick the one with the longest queue.

**Win condition:** Successfully manage all 3 rounds without any lane overflowing.

**Recap:** "🧠 You just taught Flux: **Priority Optimization** — AI compares many inputs and serves the most urgent first."

---

### Level 5 — Auto-Pilot

**AI Concept:** AUTOMATION — AI manages traffic with a human-set threshold

**Banner:** 🤖 LEVEL 5: AI AUTOMATION — Flux Runs the Show

**Mechanics:**
- 4 lanes running simultaneously in auto-mode
- A **Trigger Level slider** (40%–90%) sets Flux's automation threshold
- **Too low (40%):** Flux flushes constantly — "Wasted Cycles" counter increases, lanes barely fill
- **Too high (85%):** Flux barely flushes — lanes overflow, gridlock
- **Just right (~70%):** Smooth traffic flow, zero waste, no overflow
- 3 sub-rounds: Morning rush (uneven traffic), Midday (moderate), Evening (heavy)
- Kid adjusts the slider and watches Flux autonomously manage the intersection
- "Wasted" and "Overflow" counters update live

**What Flux learns:** With the right rule from a human, AI can manage complex systems autonomously.

**Win condition:** Complete all 3 rounds within waste/overflow limits.

**Recap:** "🧠 You just taught Flux: **Automation** — AI follows the rules humans set, so it can manage traffic all by itself."

---

### Level 6 — Traffic Commander Exam (Quiz)

**AI Concept:** AI LITERACY — Comprehensive assessment

**Banner:** ✏️ LEVEL 6: TRAFFIC COMMANDER EXAM — AI Literacy

**Format:**
- 10 multiple-choice questions, 3 choices each
- Progress bar: X/10
- Immediate feedback on each answer: ✅ green for correct + explanation, ❌ red for incorrect + correct answer + AI concept name
- Pass: 7/10 → certificate screen "Certified Traffic Commander" with all 5 AI concepts listed
- Fail: <7/10 → retake button with encouragement

**Questions:**

| # | Question | Choices (correct in bold) | AI Concept |
|---|---|---|---|
| 1 | How does Flux know when cars are waiting at a red light? | **A: Inductive loop sensors under the road detect the cars** / B: A camera watches the road / C: Cars honk their horns | Sensor Data |
| 2 | Why should Flux NOT flush the light for a bicycle? | A: Bikes can go through red lights / **B: Bikes have less metal so the sensor barely registers them** / C: Bikes don't need roads | Signal Filtering |
| 3 | When the bar graph fills faster than normal, what does Flux know? | A: It's a holiday / B: The sensor is broken / **C: More cars are arriving = risk of overflow soon** | Load Prediction |
| 4 | With 4 lanes and one green light, which lane should Flux flush first? | A: The one with the most green paint / **B: The lane with the highest bar (longest queue)** / C: Lane A because it's first | Priority |
| 5 | What happens if you set Flux's trigger level to 40%? | **A: Flux flushes too often and wastes green lights** / B: Traffic flows perfectly / C: Nothing changes | Automation |
| 6 | What happens if you set Flux's trigger level to 90%? | A: Flux flushes every 2 seconds / B: Traffic flows perfectly / **C: Flux barely flushes and lanes overflow** | Automation |
| 7 | What's the difference between the sensor reading for a bike vs. a car? | A: Nothing, they look the same / B: Bikes are faster / **C: A car has more metal, so the sensor reading is much stronger** | Signal Filtering |
| 8 | Why does Flux need sensors buried under the road? | **A: AI needs data from the physical world to make decisions** / B: Sensors look cool / C: Sensors power the traffic lights | Sensor Data |
| 9 | Can Flux manage traffic perfectly without any human help? | A: Yes, AI is perfect / **B: No, Flux needs a human to set the right trigger level** / C: No, AI never works | Automation |
| 10 | What is the most important thing YOU taught Flux today? | A: How to beep loudly / B: How to count cars / **C: How to sense traffic, predict overflow, filter noise, prioritize lanes, and run on its own** | All Concepts |

## Flux AI Assistant — Conversation Layer

Same passive AI pattern as previous games:

- **Passivity:** Flux NEVER speaks unprompted. Visual-only idle cue: "Tap a lane or say 'Flux' for help!"
- **STT:** `webkitSpeechRecognition` / `SpeechRecognition`, continuous listening
- **TTS:** `SpeechSynthesisUtterance` with rate/volume/voice controls
- **Text fallback:** When mic denied → text input appears
- **Settings:** ⚙️ modal with rate/volume/voice/mute/mic toggle
- **Transcript:** 📝 drawer with conversation history
- **AI State Indicator:** Idle → Listening (green pulse) → Thinking (yellow) → Speaking (blue wave)

**Level-specific idle prompts:**
- Lv1: "Watch the bar! Flush when it turns RED — that means cars have waited long enough!"
- Lv2: "See the dotted line? That's the PREDICTION! Flush before it hits the top."
- Lv3: "Careful... bikes barely register. Don't flush weak signals — wait for cars!"
- Lv4: "Four lanes! Compare the bars and pick the HIGHEST one first."
- Lv5: "Set the trigger slider! Too low = waste, too high = gridlock. Find the sweet spot!"
- Lv6: "Read each question carefully. You've learned all this — show what you know!"

**Intents:** help, hint, check, explain_concept, encourage, vehicle_info, greeting, off_topic

## Visual Design System

### Color Palette (Traffic/Urban Theme)

| Token | Hex | Usage |
|---|---|---|
| Asphalt | `#1C2331` | Backgrounds, road surface |
| Signal Green | `#2ECC71` | Go, flush, success |
| Sensor Amber | `#F39C12` | Sensor glow, caution |
| Gridlock Red | `#E74C3C` | Overflow, errors, danger |
| Flux Blue | `#3498DB` | AI assistant, dashboard |
| Progress Teal | `#1ABC9C` | Bar graphs low zone |
| Lane White | `#ECF0F1` | Road markings, text on dark |
| Dashboard Dark | `#2C3E50` | Flux panel background |
| Warning Orange | `#E67E22` | Bar graph mid zone |

### Typography
- Headings: `Fredoka One` (playful, rounded)
- Body: `Nunito` (clean, legible, good at small sizes)
- Dashboard stats: `monospace` for numbers

### Touch Targets
- All interactive ≥56px height
- Lane tap zones ≥80×80px
- Slider handle ≥48px
- Quiz option buttons ≥56px

### Accessibility
- `prefers-reduced-motion`: disable animations, static bar fills
- `prefers-contrast: more`: increase borders, high contrast mode
- ARIA labels on all interactive elements
- Keyboard nav (Tab + Enter)
- `aria-live="polite"` for feedback areas

## Technical Architecture

### File Structure

```
games/primary/p3-12-traffic-commander/
├── index.html            Entry point + all UI containers
├── style.css             Full design system + animations + layout
├── game.js               State machine + 6 level orchestrations
├── traffic.js            Traffic simulation: vehicles, queues, fill rates, prediction
├── sensors.js            Inductive loop sensor engine: bar graphs, glow, metal mass
├── flux.js               Flux AI assistant: dashboard panel + conversation + passivity
├── intents.js            Intent classification + level-specific templates
├── quiz.js               10 MC questions with scoring + certificate
├── renderer.js           Canvas drawing: road, underground cutaway, bars, traffic lights
├── audio.js              Web Audio SFX (car, flush, alarm, overflow, bike, success)
├── settings.js           Settings modal (rate/volume/voice/mute/mic)
├── transcript.js         Conversation history drawer
└── manifest.json         PWA manifest
```

### Dependency Order

```
levels.js (inline) → traffic.js → sensors.js → renderer.js → quiz.js → audio.js → intents.js → transcript.js → settings.js → flux.js → game.js
```

### State Machine

```
LOADING → MENU → LEVEL_SELECT → PLAYING → RESULT
                                        ↓
                                   CERTIFICATE (Lv6 pass only)
```

## Edge Cases & Success Criteria

1. **All levels winnable** — builder must trace win conditions; debug mode reveals answers
2. **Anti-frustration** — wrong bar graph interpretation gets gentle correction, not punishment
3. **Level switch safety** — clear interval/timeout on level switch, clean state reset
4. **False flush penalty in Lv3** — flushing on a bike should waste but not hard-fail (teachable moment)
5. **Slider persistence in Lv5** — slider value resets per round but stores per-level
6. **No child PII** — all data in-memory, nothing sent to server
7. **Offline** — PWA manifest caches all assets
8. **Settings persistence** — localStorage saves rate/volume/voice/mute/mic preferences
