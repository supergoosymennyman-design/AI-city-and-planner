# Sonic Leak Hunter

> **Track:** Primary | **Band:** P3 (Age 8) | **Lesson:** 09 — Smart Water Distribution Networks
> 
> Train an AI assistant to detect hidden water leaks using sound wave patterns!

## What is this?

**Sonic Leak Hunter** is a 6-level educational game where students learn core AI concepts by training **Piper**, an AI assistant deployed to find hidden water leaks in a city's pipe network.

Students progress through:
1. **Supervised Learning** — Label examples of safe vs. leak sounds
2. **Classification** — Scan city blocks to find the one with a leak
3. **Signal vs Noise** — Filter out small wiggles to find the real signal
4. **Threshold Tradeoff** — Balance sensitivity to avoid false alarms
5. **Batch Processing & Confidence** — Deploy city-wide and judge uncertain cases
6. **AI Literacy Quiz** — 10-question certification exam

## How to Play

1. **Open `index.html`** in any modern browser (Chrome, Edge, Safari, Firefox)
2. No build step, no server, no npm install required
3. All 6 levels are unlocked — click any level tab at the top to jump around
4. Talk to Piper! Say "Piper help" or tap the chat to get hints

## Requirements

- Modern browser with Canvas and Web Audio support
- Microphone optional (text fallback available)
- Best experienced on tablet in landscape (1024×768), but works on desktop too

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point — open this to play |
| `style.css` | Complete design system (CSS custom properties, responsive layout) |
| `game.js` | State machine (LOADING → MENU → PLAYING → RESULT → CERTIFICATE) |
| `levels.js` | Level metadata (titles, AI concepts, wave data, instructions) |
| `piper.js` | Piper AI assistant — passive STT/TTS, intent matching, state indicator |
| `waveforms.js` | Signal generators (sine, leak spike, noisy, composite, live animation) |
| `renderer.js` | Canvas drawing engine (waveforms, grids, threshold, confidence, quiz, certificate) |
| `quiz.js` | 10-question certification exam with scoring and feedback |
| `audio.js` | Web Audio SFX (drip, alarm, success, fail, deploy, water loss) |
| `intents.js` | Intent classification + response templates for Piper |
| `settings.js` | Settings modal (rate, volume, voice, mute, mic toggle) |
| `transcript.js` | Conversation history storage and drawer |
| `manifest.json` | PWA manifest (offline-capable) |
| `test/index.test.js` | Core logic tests — run with `node test/index.test.js` |

## Architecture

```
State Machine:  LOADING → MENU → LEVEL_SELECT → PLAYING → RESULT → CERTIFICATE

Piper AI:       PASSIVE_LISTENING → CHILD_ADDRESSES → CLASSIFY → THINKING → SPEAKING

Level Flow:     Banner (AI concept) → Instruction → Mechanics → Feedback → Result
```

## AI Visibility

Every level clearly labels its AI concept:
- **L1:** SUPERVISED LEARNING — AI learns from labeled examples
- **L2:** CLASSIFICATION — AI uses patterns to categorize new data
- **L3:** SIGNAL vs NOISE — AI needs to filter out random data
- **L4:** THRESHOLD TRADEOFF — Balance precision and recall
- **L5:** BATCH PROCESSING + CONFIDENCE — AI can be uncertain
- **L6:** AI LITERACY — Comprehensive understanding quiz

## Design

- **Colors:** Water-themed palette (deep navy, teal, coral, amber, sand)
- **Typography:** Fredoka One (headings) + Nunito (body) from Google Fonts
- **Touch targets:** ≥56px minimum for all interactive elements
- **Accessible:** ARIA labels, keyboard nav, reduced motion support, high contrast support

## Running Tests

```bash
node test/index.test.js
```

Tests verify file structure, level metadata, quiz integrity, intent classification, waveform generators, renderer functions, game state machine, Piper assistant, accessibility, and PWA manifest.
