# Compute Fee Meter — AI Data Center Dashboard

**P3 Lesson 17: AI in Municipal Finance & Auditing**
**Age:** 8 years old (Primary 3)

## Overview

A standalone HTML5 game where students run a data center billing dashboard. Corporate audit files are uploaded to an AI Document Parser, consuming server resources (RAM, system load). Students adjust billing sliders (Page Count Multiplier + RAM Usage Premium Fee) to dynamically price compute fees.

## AI Pedagogy

Teaches **Dynamic Resource Pricing** in cloud/AI infrastructure:
- Resource consumption varies by file size AND complexity
- Pricing must scale dynamically to cover costs
- Overcharging hurts fairness; undercharging crashes the server
- An AI billing system needs human oversight to balance profit vs. fairness

## Core Formulas

```
BilledFee = (PageCount × PageMultiplier) + (RamUsage × RamPremium)
PhysicalCost = (PageCount × 1.5) + (RamUsage × 2)
SystemLoad = SystemLoad + (FileWeight × 2) / (BilledFee × 0.1 + 3) − CoolingFactor × 3
```

## 5 Levels

1. **Scale for Size** — Single slider, 100-page file, hit token target (510 tokens)
2. **The RAM Overload** — Single slider, small complex files spike RAM
3. **The System Crash Threat** — Both sliders, wave of uploads, cool load <70%
4. **The Balanced Budget** — Both sliders + Fairness ≥75%, ≥500 tokens
5. **The Optimal Billing Matrix** — 45-second rush, zero crashes, ≥95% cost match

## Architecture

- **Stack:** Vanilla HTML5 + CSS3 + JavaScript (no frameworks, no npm, no CDN)
- **Target:** Tablet landscape (1024×768+), responsive to portrait
- **Touch:** ≥48px touch targets, native range sliders
- **Design:** Slate dark theme (#0f172a), sky-400 primary accent, no purple/gradients

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point — open in any browser |
| `style.css` | All styles, CSS custom properties, responsive |
| `game.js` | Core game logic, 5 levels, state machine |
| `main.js` | UI controller, DOM rendering, event bindings |
| `audio.js` | Web Audio API synth sound effects |
| `conversation.js` | Nova passive AI (STT + TTS + VAD + text fallback) |
| `intents.js` | Nova intent definitions & response templates |
| `settings.js` | Settings panel (rate, volume, voice, mute, mic) |
| `transcript.js` | Conversation history storage & drawer |

## How to Run

Open `index.html` in any modern browser (Chrome/Edge recommended for SpeechRecognition).

```bash
# Option 1: Direct file open
open index.html

# Option 2: Local server (required for some features)
python3 -m http.server 8000
# Then open http://localhost:8000
```

## Testing

```bash
node test/index.test.js
```

33 tests covering: BilledFee, PhysicalCost, SystemLoad, level win conditions, fairness, edge cases.

## Nova AI

Nova is a **passive** AI assistant. She never auto-speaks. She only responds when:
- The child says "Nova" or asks a direct question
- The child taps Nova's avatar (🤖)

Fallbacks: text input when microphone unavailable.
