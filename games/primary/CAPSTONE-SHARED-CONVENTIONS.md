# Shared Conventions — AI City Capstone Games (All Tiers)

This document applies to all three capstone games (`p1-18-ai-city`, `p3-18-ai-city`, `p5-18-ai-city`).
The tier-specific `BUILD.md` files describe what differs.

---

## Tech Stack

- **Pure vanilla HTML5/CSS3/JavaScript** — no framework, no build step, no npm, no CDN
- Must work offline after first load (no external fonts or scripts)
- Tablet-first, landscape orientation (but must not break in portrait)
- No purple gradients, no glassmorphism, no bounce UI, no AI-slop aesthetics

## Module Pattern

Every `.js` file is an IIFE stored on a `const`:

```js
const Game = (() => {
  'use strict';
  // ... private state, logic ...
  return { init, getState, /* ... */ };
})();
```

Files load in order in `index.html`:
1. `style.css`
2. `audio.js`
3. `transcript.js`
4. `settings.js`
5. `intents.js`
6. `conversation.js`
7. `game.js` (core logic)
8. `main.js` (UI controller — always last)

Additional files (simulation, knowledge graph, etc.) load before `main.js`.

## Nova AI Companion (All Tiers)

### Passivity Rule
Nova is **always listening** (continuous VAD via SpeechRecognition) but **NEVER initiates speech**. She only responds when:
- The child says "Nova" followed by a question/command
- The child taps Nova's avatar
- The child types in the text input field

### Implementation
- `Web Speech API` for STT (`SpeechRecognition` / `webkitSpeechRecognition`)
  - `continuous: true`, `interimResults: false`
  - Auto-restart on end event (silent restart)
- `SpeechSynthesis` for TTS (utterance queue, one at a time)
- Template-based intent matching in `intents.js` (offline, no download)
- Text input fallback when mic unavailable/denied

### UI
- Avatar: SVG circle with crosshair (reuse existing pattern from p3-15-tokenomics)
- State dot: `idle` (gray) → `listening` (blue pulsing) → `thinking` (amber pulsing) → `speaking` (green)
- Speech bubble appears on response, auto-hides after 8 seconds
- Text input field below speech bubble

### State Machine
```
IDLE → (user says "Nova") → LISTENING → (user finishes speaking) → THINKING
→ (response ready) → SPEAKING → (utterance ends) → IDLE
```

## Audio

Web Audio API `OscillatorNode` (same pattern as p3-15-tokenomics `audio.js`):

| Sound | Implementation |
|-------|---------------|
| Place building | C major triad (C4→E4→G4, 80ms each, sine) |
| Connect | Ascending sweep (400→800Hz, 200ms, triangle) |
| Error | Low descending tone (300→150Hz, 200ms, sawtooth) |
| Complete | Ascending arpeggio (C5→E5→G5→C6, 100ms steps) |
| Crisis/Alert | Rapid alternating (500/600Hz, 100ms, square, repeat 4x) |
| Resolve | Single bright tone (A5, 300ms, sine, fade out) |
| Tap/Click | Short pop (800Hz, 40ms, square) |

## Settings Panel

Always present, toggled by ⚙️ icon:

| Control | Type | Range | Default |
|---------|------|-------|---------|
| Speech Rate | range slider | 0.5–2.0, step 0.05 | 0.85 |
| Volume | range slider | 0–1, step 0.05 | 0.9 |
| Voice | select | All `speechSynthesis.getVoices()` | system default |
| Mute AI Voice | checkbox | on/off | off |
| Microphone | checkbox | on/off | on (if available) |

## Session Persistence

Auto-save to `localStorage` on every state change (`key = 'ai-city-state'`):

```js
{
  tier: 'p1'|'p3'|'p5',
  phase: 'design'|'optimize'|'simulate'|'end',
  buildings: [...],       // what was placed
  connections: [...],     // what was connected
  tokens: { budget, spent },
  score: {},
  simulationTime: 0,
  timestamp: Date.now()
}
```

On `init()`, check for saved state. If found and < 2 hours old, offer "Continue" or "Start Fresh".

## Teacher Controls

Hidden panel triggered by pressing backtick (`) key:

- **Reset to Phase 1** — clear everything
- **Skip to Phase** — Design / Optimize / Simulate / End
- **Add Tokens** — +10 / +50
- **Trigger Crisis** (P3-P4, P5-P6 only)
- **Difficulty** — Easy / Normal / Hard (adjusts budget, hazard count)

Not visible to students. No icon. Only keyboard-triggered.

## Loading States

- Phase transitions: 500ms fade with spinner
- Simulation start (P3-P4, P5-P6): "Building city..." with progress dots (max 2s)
- 1,000,000x time progression (P5-P6): "Fast-forwarding..." overlay (max 3s)

## Empty States

Every interactive panel must show a clear empty state:

| Panel | Empty State Message |
|-------|-------------------|
| Grid | "Drag buildings from the sidebar to start building your city!" |
| Knowledge Graph | "Drag concepts onto the canvas and connect them to show how the city works!" |
| Dashboard | "Design your city first, then the dashboard comes alive!" |
| Event Log | "City events will appear here" |
| Citizen Queue | "Citizens will appear once the simulation starts" |

## Error States

| Situation | Handling |
|-----------|----------|
| Out of tokens | Modal: "You've run out of tokens! Remove a building or adjust sliders to free up tokens." Show undo/remove options. |
| Grid full | Toast: "The grid is full! Tap a building to remove it first." |
| No valid connection | Nova: "Hmm, there's no path between those buildings. Try placing a road first." |
| STT unavailable | Auto-show text input field, hide voice button |
| SpeechSynthesis unavailable | Silent mode — Nova responses shown as text only |
| localStorage full | Catch error, continue without saving (notify once) |
| AudioContext blocked | Request resume on first user interaction |

## Touch & Accessibility

- Touch targets: P1-P2 = 60px minimum, P3-P4/P5-P6 = 44px minimum
- All interactive elements have `aria-label`
- Semantic HTML (`<button>`, `<main>`, `<nav>`, `<section>`)
- Focus indicators on keyboard interactions (tab navigation)
- Touch feedback: 200ms scale(0.95) on press for all buttons
- No hover-only interactions (tablets have no hover)
- Swipe to scroll where applicable (knowledge graph canvas, building palette)

## Design Tokens

### All tiers share this typography scale:

```css
:root {
  --font-display: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Consolas', monospace;

  --fs-xs: 11px;
  --fs-sm: 13px;
  --fs-base: 16px;
  --fs-lg: 20px;
  --fs-xl: 24px;
  --fs-2xl: 30px;
  --fs-3xl: 36px;

  --sp-xxs: 4px;
  --sp-xs: 8px;
  --sp-sm: 12px;
  --sp-md: 16px;
  --sp-lg: 24px;
  --sp-xl: 32px;
  --sp-2xl: 48px;

  --r-sm: 4px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-xl: 16px;

  --sh-sm: 0 1px 3px rgba(0,0,0,0.3);
  --sh-md: 0 4px 12px rgba(0,0,0,0.4);
  --sh-lg: 0 8px 24px rgba(0,0,0,0.5);
}
```

### P1-P2 uses a bright, friendly theme (light background).
### P3-P4 and P5-P6 use the dark dashboard theme (slate-900 background).

Both sets of tokens are defined in their respective `BUILD.md` files.

## File Structure (Standard)

Every game must have at minimum:

```
index.html        — entry point
style.css         — all styles
game.js           — core logic, state
main.js           — UI controller
audio.js          — sound effects
conversation.js   — Nova conversational AI
intents.js        — Nova intent definitions
settings.js       — settings panel
transcript.js     — conversation history
PLAN.md           — game plan
README.md         — how to play
test/
  index.test.js   — unit tests
```

Additional files for larger games (listed in tier-specific BUILD.md).

## Testing

```bash
node test/index.test.js
```

Test with Node's built-in `assert` (no test framework). Tests cover:

- State management (init, phase transitions, reset)
- Token budget (spending, validation, edge cases)
- Grid placement (valid/invalid positions, overlaps)
- Connection validation (network topology checks)
- Simulation state (agent creation, event triggers)
- Persistence (save/restore roundtrip)

Use a mock DOM (jsdom or minimal `document` shim) where needed, or test pure logic separately.

## Project Output

`index.html` must open directly in any browser (Chrome recommended for voice). No server required.
