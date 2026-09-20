# Sonic Leak Hunter — Game Plan

> **Game ID:** `p3-09-sonic-leak-hunter`
> **Entry Point:** `games/primary/p3-09-sonic-leak-hunter/index.html`

## Overview

| Field | Value |
|---|---|
| **Track** | Primary |
| **Band** | P3 (Age 8) |
| **Lesson** | 09 — Smart Water Distribution Networks |
| **Source** | `source/primary/lessons/lesson-09/p3/prompt.md` |
| **Game ID** | `p3-09-sonic-leak-hunter` |
| **Entry Point** | `games/primary/p3-09-sonic-leak-hunter/index.html` |
| **Tech Stack** | Vanilla HTML/CSS/JS, Canvas API, Web Audio API |
| **Architecture** | Self-contained single-page game, all levels unlocked from start |

## Learning Objective

Students learn how **acoustic AI systems** detect anomalies (water leaks) in city water networks. They train an AI by labeling sound wave patterns, tune its detection sensitivity, handle edge cases the AI has never seen, judge AI confidence scores, and run a full timed city scan — culminating in a Water Department briefing quiz that tests supervised learning, classification, noise robustness, threshold tradeoffs, edge cases, probabilistic AI output, and human-in-the-loop AI.

## Narrative Storyline

The player is a **Junior Leak Detective** recruited by **Piper**, an AI assistant deployed by **WaterCity**. Piper can hear water pipes through acoustic sensors but **doesn't know what a leak sounds like** — it's never been trained.

### The Arc

1. **Opening:** A short comic-style intro shows WaterCity losing water to hidden underground leaks. The city manager deploys Piper — but it can't tell safe from leaky pipes yet. "Piper can hear everything — every drip, every flow. But it doesn't know which sounds mean trouble. That's where YOU come in!"
2. **Levels 1–5:** The kid trains Piper by classifying sounds, tunes its sensitivity, teaches it about brand-new sounds (edge cases), judges its confidence reports, and finally runs the whole city network on the clock.
3. **Level 6:** The kid earns their **Water Department Clearance** by passing the department's 10-question briefing on what they (and Piper) learned about AI.
4. **Closing:** A certificate screen shows "Piper v1.0 (knew nothing)" vs "Piper v2.0 (can protect the city)" — a clear demonstration that the kid taught the AI.

## Level Design — All 6 levels unlocked from start (top nav bar)

Each level's area is accessible via tabs at the top. No locking, no gating.

---

### Level 1 — Sort the Sounds

**AI Concept:** SUPERVISED LEARNING — AI learns from labeled examples

**Visual Banner:** "🎧 LEVEL 1: SUPERVISED LEARNING — Sort the Sounds"

**Mechanics:**
- Live animated waveform on canvas (neutral color — the kid judges by shape alone)
- Kid sorts 12 pipe sounds into NORMAL 💧 or LEAK 🚨
- 6 safe waves (3 easy smooth, 3 tricky noisy-safe) + 6 leak waves (3 easy spike, 3 tricky noisy-leak)
- Feedback after each sort; score tracked in the progress bar
- **Result:** "You sorted 12 pipe sounds! That's how AI classifies new data."

**Validation:** 7/12 to pass. Pass → next level.

---

### Level 2 — Tune the Sensitivity

**AI Concept:** THRESHOLD TRADEOFF — precision vs recall

**Visual Banner:** "🎛️ LEVEL 2: THRESHOLD TRADEOFF — Tune the Sensitivity"

**Mechanics:**
- One waveform with a horizontal threshold line
- Sensitivity slider (1–10) moves the line in real time
- "False Alarms" and "Leaks Caught" counters update live
- Mission: set the slider so the line ONLY touches the leak spike
- 4 sub-rounds with varying difficulty (tall spike, small spike, noisy-safe, noisy-leak)
- **Result:** "Setting the right balance means Piper catches leaks but doesn't cry wolf. That's the Threshold Tradeoff!"

**Validation:** Slider in correct range each round. All 4 sub-rounds passed.

---

### Level 3 — Edge Case Patrol (3D)

**AI Concept:** EDGE CASES / OUT-OF-DISTRIBUTION — AI gets confused by sounds it has never heard

**Visual Banner:** "🚧 LEVEL 3: EDGE CASES — Edge Case Patrol"

**Mechanics:**
- Each sound is rendered as a **3D neon oscilloscope tube** (Three.js: TubeGeometry + emissive material, slow orbit camera)
- 10 novel sounds Piper was never trained on:
  - Noise: Construction (jackhammer), Subway Rumble, Heavy Rain, Festival Chaos, Water Hammer (one bang), Traffic Vibration (cars passing)
  - THREAT: Pump Cycling, Pressure Surge (spike + ring), Corrosion Drip (tiny steady pulses), Sensor Flicker (dead sensor)
- Kid classifies each: 🔇 Just Noise or 🚨 Investigate
- Wrong answers show a teaching hint explaining the pattern
- WebGL not available → automatic 2D canvas fallback
- **Result:** "When AI sees something brand new, it can get confused — that's why humans stay in the loop!"

**Validation:** 7/10 to pass.

---

### Level 4 — Confidence Command (3D)

**AI Concept:** PROBABILISTIC OUTPUT / HUMAN-IN-THE-LOOP — AI gives probabilities, not certainties

**Visual Banner:** "💬 LEVEL 4: CONFIDENCE & PROBABILITY — Confidence Command"

**Mechanics:**
- 6 pipe locations, each shown as a **3D neon waveform tube** (same renderer as L3) + alert card (location, confidence %, reason)
- The **tube color signals Piper's confidence**: green >80%, amber 60–80%, red <60% — with a color legend shown under the alert card
- Kid sees the actual sensor wave AND Piper's confidence number together, then decides: ✅ Trust & Repair / 🔍 Inspect / ❌ Dismiss
- 3 real leaks, 3 false alarms at varied confidence levels
- Inspect is neutral — reveals the truth as a teaching moment
- WebGL not available → 2D canvas fallback with confidence text
- **Result:** "AI gives probabilities, not certainties. That's why humans make the final call!"

**Validation:** 4/6 to pass.

---

### Level 5 — Pipe Vision Inspector (3D pipe network)

**AI Concept:** AI DEPLOYMENT — use AI to find leaks, but inspect the pipes yourself

**Visual Banner:** "🔍 LEVEL 5: AI DEPLOYMENT — Pipe Vision Inspector"

**Mechanics:**
- A **3D water pipe network** (9 programmatic pipe segments + junction nodes) rendered in Three.js
- **Piper's pre-scan** colors the pipes: red = says leak, yellow = unsure, green = normal — with floating confidence % sprites
- **Piper is imperfect:** it flags a false alarm (red but not leaking) AND misses a hidden leak (green but leaking)
- Kid **orbits the network** by dragging, taps a pipe → info card (name, Piper's confidence, reason)
- **🔍 Inspect Sensor Data** — swaps to the pipe's 2D waveform so the kid can verify by eye (ties back to L1 skills)
- Decisions: 🛠️ **Repair** (uses 1 of 2 repair crews) or ✅ **Mark Safe**
- Score: repair real leak +2, repair hidden leak +3 (bonus — found what AI missed), clear safe pipe +1, wasted crew/missed leak 0
- 90-second timer (pauses while a pipe is selected); level ends when all 6 flagged pipes are decided or time runs out
- WebGL unavailable → fallback: pipes listed as tappable buttons
- **Result:** "AI narrows the search by flagging pipes, but it can miss leaks and raise false alarms. YOU inspect the sensor data and make the final call!"

**Validation:** ≥5 points to pass.

---

### Level 6 — Water Department Briefing

**AI Concept:** AI LITERACY — comprehensive understanding of how AI works

**Visual Banner:** "✏️ LEVEL 6: AI LITERACY — Water Department Briefing"

**Mechanics:**
- Framed as the **Water Department asking YOU questions** to clear Piper for the city
- 10 multiple-choice questions, 3 choices each
- Progress bar X/10; immediate feedback on each answer with a 💡 AI-concept tip for wrong answers
- No time limit
- **Result:** Pass (7/10) → certificate screen with "Piper v1.0 vs v2.0" comparison

**Scoring:** 7/10 to pass. Failing = retake button + encouragement.

## AI Visibility — Clear to Outside Observers

Every level must make the AI concept **visible, labeled, and explicit**:

1. **Level start banners** — Large colored banner at top: "LEVEL 1: SUPERVISED LEARNING" naming the concept
2. **Piper's avatar** — Shows state badge and changes with progress, with text label below
3. **Progress indicators** — Training progress bar (L1), threshold line + counters (L2), 3D bars (L4), timer + water score (L5)
4. **End-of-level recap** — "🧠 You just learned about: **Supervised Learning** — AI learns from labeled examples"
5. **Quiz explanations** — Every wrong answer shows "💡 The AI concept here is X — explanation"
6. **Final graduation** — Side-by-side: "Piper before you (Untrained)" vs "Piper after you (Trained on your data)"
## Piper AI Assistant — Conversational Layer

Piper serves as the game's Botly-style AI companion. Implements **passive AI** rules:

- **Passivity:** Piper NEVER speaks unprompted. Visual-only idle prompt ("🔊 Tap the mic or say 'Piper' for a hint!")
- **Speech-to-Text:** Uses `webkitSpeechRecognition` / `SpeechRecognition` API, continuous listening, interim results
- **Text-to-Speech:** Uses `SpeechSynthesisUtterance` with rate/volume/voice controls
- **Text fallback:** When mic unavailable → text input field appears
- **Settings:** ⚙️ icon opens modal with rate slider, volume slider, voice picker, mute toggle, mic toggle
- **Transcript:** 📝 icon opens conversation history drawer
- **AI State Indicator:** Visual element showing: idle/listening/thinking/speaking

**Intents:**

| Intent | Priority | Trigger |
|---|---|---|
| help | 95 | "Piper help", "how to play" |
| hint | 90 | "Piper hint", "where is it" |
| check | 85 | "Piper check", "am I right" |
| explain_level | 75 | "what does this level teach" |
| ai_concept | 70 | "what is supervised learning", "what is classification" |
| encourage | 60 | "good", "nice", "done" |
| greeting | 50 | "hi", "hello", "Piper" |
| off_topic | 0 | fallback |

## Technical Architecture

### File Structure

```
games/primary/p3-09-sonic-leak-hunter/
├── index.html            Entry point, all UI containers, import map, script loading
├── style.css             Design system (tokens + layout + components)
├── game.js               State machine + all 6 level render logic (incl. L5 pipe inspector + crews)
├── levels.js             Level metadata (title, instruction, AI concept, wave/edge/alert/city data)
├── piper.js              Piper AI: state machine, avatar rendering, conversation, passivity enforcement
├── waveforms.js          Signal generators: sine, leak, noisy, threshold + 6 edge-case generators
├── renderer.js           Canvas 2D engine: waveforms, grids (with ✓/✗ marks), threshold, quiz
├── three-renderer.js     Three.js 3D engine (module): neon tube oscilloscope + confidence bars (L3/L4)
├── vendor/three.module.js  Local Three.js r160 (import-mapped, offline-capable)
├── quiz.js               Quiz data (10 questions), scoring, feedback rendering
├── audio.js              Web Audio SFX (drip, alarm, success, fail, water-loss, deploy)
├── intents.js            Piper intent classification + response templates
├── settings.js           Settings modal: rate, volume, voice, mute, mic toggle
├── transcript.js         Conversation history storage & drawer
├── comic.js              3-panel cinematic intro
└── manifest.json         PWA manifest (offline-capable)
```

### Dependency Order

```
levels.js → waveforms.js → renderer.js → quiz.js → audio.js → intents.js → transcript.js → settings.js → piper.js → game.js
  (import map) three.module.js ──→ three-renderer.js (module, loads before DOMContentLoaded)
```

### State Machine (game.js)

```
LOADING → MENU → LEVEL_SELECT → PLAYING → RESULT
                                        ↓
                                   CERTIFICATE (Lv6 only)
```

- `LEVEL_SELECT` always available; switches between any level instantly
- State resets per level switch (except persistent settings)
- `RESULT` shows pass/fail + AI concept learned + retry/next buttons
- `CERTIFICATE` shows after Lv6 pass

## Design Decisions

### Color Palette (Water/Liquid Theme)

| Token | Hex | Usage |
|---|---|---|
| `--color-deep` | `#0C2D48` | Background, dark UI |
| `--color-water` | `#1B6B93` | Primary buttons, Piper avatar |
| `--color-teal` | `#35B5C8` | Accent, active state, safe waves |
| `--color-leak` | `#E76F51` | Danger, leak indicator, spiky waves |
| `--color-amber` | `#F4A261` | Warnings, threshold indicator |
| `--color-sand` | `#E9C46A` | Quiz highlights, stars |
| `--color-bg` | `#F0F4F8` | Light backgrounds |
| `--color-text` | `#1A1A2E` | Body text |
| `--color-success` | `#2A9D8F` | Green checks, correct answers |
| `--color-alert` | `#E63946` | False alarm indicators |

### Typography
- Headings: `Fredoka One` (playful, rounded, kid-friendly)
- Body: `Nunito` (legible, friendly, good at small sizes)
- Base font: 18px body (K2-friendly), 24px+ headings
- Minimum readable: 14px (UI labels only)

### Touch Targets
- All interactive elements: ≥56px height (exceeds 48px minimum)
- Grid blocks: minimum 80×80px
- Slider handle: ≥48px diameter
- Quiz option buttons: minimum 60px height
- Top nav tabs: minimum 44px height

### Accessibility
- `prefers-reduced-motion`: disable all canvas animations, use static frames
- `prefers-contrast: more`: increase text contrast, add visible borders
- ARIA labels on all interactive elements
- Keyboard navigable (Tab + Enter for all controls)
- `aria-live="polite"` for feedback areas
- Waveform data available as text alt for screen readers

## Edge Cases & Success Criteria

1. **All levels winnable** — builder must trace win conditions; 🔧 debug mode reveals answers
2. **Anti-frustration guard** — 3 consecutive wrong taps → Piper reveals correct answer (teaching moment, not punishment)
3. **Level switch safety** — switching levels via nav bar resets per-level state
4. **Fallbacks** — mic denied → text input; SpeechSynthesis absent → visual-only; Web Audio absent → graceful silent fail
5. **No child PII** — camera/mic data stays in-memory; nothing sent to server
6. **Offline** — PWA manifest caches all assets; game works without network after first load
7. **Settings persistence** — localStorage saves rate, volume, voice, mute, mic preferences

## Pipeline History

- **Planner:** Presented to and approved by user
- **Builder:** To be built
- **Tester:** To be tested
- **Breaker:** To be stress-tested
