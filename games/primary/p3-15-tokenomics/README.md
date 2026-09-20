# AI Token Exchange

**P3 Lesson 15: Computational Tokenomics & Resource Allocation**

A standalone HTML5 game where students run a passport verification dashboard, learning real-world AI tokenomics concepts through 7 levels — each with a unique mechanic.

## How to Play

Open `index.html` in any modern browser (Chrome recommended for voice features). Best on a tablet in landscape orientation.

### Game Concept

Citizens queue up requiring AI verification tasks. Each task costs tokens, and each level introduces a new real-world AI cost concept:

- **Text Reading:** 2 tokens (standard) / 5 tokens (premium — handles messy handwriting)
- **Application Lookups:** 5 tokens (standard) / 8 tokens (premium — cross-references databases)
- **Image Face Matching:** 10 tokens (standard) / 15 tokens (premium — liveness detection)

### Levels & Mechanics

| Level | Name | Concept | Citizens | Budget | Unique Mechanic |
|-------|------|---------|----------|--------|-----------------|
| L1 | Know Your Costs | Task pricing | 5 | 100 | Basic task toggles |
| L2 | Choose Your Model | Model tiers | 6 | 120 | Standard vs Premium (GPT-3.5 vs GPT-4) |
| L3 | Batch & Save | Batch discounts | 9 | 100 | 15% off identical tasks in batch |
| L4 | Priority Lane | SLA tiers | 8 | 100 | 2x cost +5 bonus per prioritized citizen |
| L5 | Cache & Optimize | All combined | 12 | 120 | All mechanics + 50% cache for returning |
| L6 | Nova Demonstrates | AI auto-allocate | 12 | 120 | Nova uses all mechanics optimally |
| L7 | Nova at Scale | Enterprise scale | 20 | 180 | 20 citizens at lightning speed |

### Controls

- **Task toggles:** Tap each task row to toggle ON/OFF. Required tasks (marked REQUIRED) cannot be toggled off.
- **Model tiers (L2, L5):** Tap STD or PRM buttons per task type to choose Standard or Premium AI.
- **Batch (L3, L5):** Tap citizens in the queue to add to batch. Press "Process Batch" for 15% discount.
- **Priority (L4, L5):** Toggle Priority ON for citizens with deadline badges (required) or to earn bonus tokens.
- **Process/Skip:** Process current citizen with selected settings, or skip entirely.
- **Level tabs (L1-L7):** Jump between levels at any time.

### Nova AI Companion

Nova is your AI assistant who learns from your decisions:
- **Levels 1-5:** You teach Nova about tokenomics concepts
- **Level 6:** Nova demonstrates perfect autonomous allocation using all mechanics
- **Level 7:** Nova scales up to enterprise-level processing

Tap Nova or say "Nova" to ask questions. Nova only responds when addressed.

## Tech Stack

- **Pure HTML5/CSS3/JavaScript** — no framework, no build step
- **Web Speech API** — voice recognition (online STT) with text input fallback
- **SpeechSynthesis API** — text-to-speech for Nova
- **Web Audio API** — sound effects
- **localStorage** — settings persistence

## File Structure

```
index.html       — Entry point and HTML structure
style.css        — All styles (dark dashboard theme, tablet-first)
game.js          — Core game logic, 7 levels with unique mechanics, Nova AI
main.js          — UI controller, event binding, rendering
audio.js         — Web Audio API sound effects
conversation.js  — Nova conversational AI (passive, address-triggered)
intents.js       — Nova intent definitions (covers all mechanics)
settings.js      — Settings panel (speech rate, volume, voice, mute, mic)
transcript.js    — Conversation history storage and display
test/
  index.test.js  — Core logic unit tests (all mechanics covered)
```

## AI Model

Template-based intent matching (offline, no download required). Responses are crafted for the AI tokenomics context.

## Running Tests

```bash
node test/index.test.js
```

## Design

Dark government dashboard aesthetic. Slate-900 background, sky-400 primary accent, amber-400 token highlight. Purple for premium model indicators, green for success/batch, amber for warnings/priority. No purple gradients. No glassmorphism. Touch targets >=44px.
