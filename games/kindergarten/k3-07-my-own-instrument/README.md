# My Own Instrument — K3 Lesson 7

A tablet-friendly, single-page game for kindergarten children (age 5-6) where they build their own "instrument" by recording 5 sounds, arranging them on an 8-beat sequencer, and hearing AI generate a complementary melody.

**Narrative arc:** AI doesn't know → learns from examples → generalizes → demonstrates.

## The 3-Part Lesson Flow

### Part A — Record 5 Sounds (~8 min)
1. AI character says "I don't know what an instrument is! Can you teach me?"
2. Child records 5 different sounds (voice, clap, stomp, tap, funny sound)
3. Each sound: tap mic → 3-sec recording → playback → name it → added to sound bank
4. Sound bank shows 5 colored sound icons after completion

### Part B — 8-Beat Sequencer (~7 min)
1. 5×8 grid appears (5 sound rows × 8 beat columns)
2. Child taps cells to place sounds on beats
3. Play button loops the arrangement with beat-highlight animation
4. AI gives pattern feedback after playthroughs
5. Child can rearrange, clear all, replay
6. After 2+ playthroughs, "Lock In Song!" button appears

### Part C — AI Melody Generation (~10 min)
1. AI analyzes the rhythm pattern (density, active sounds)
2. AI generates 8 melody notes using Web Audio API triangle-wave oscillators
3. Scale chosen by density analysis: lively/major for dense, pentatonic for medium, minor for sparse
4. Melody plays over the beat sequence
5. Celebration screen with confetti
6. Child can replay or start over

## Technical Details

### File Structure
```
games/kindergarten/k3-07-my-own-instrument/
├── index.html          # Main game — open this to play (all code)
├── conversation.js     # Voice pipeline (STT + VAD + TTS)
├── intents.js          # Address-trigger detection + intent classification
├── settings.js         # Settings panel (rate, volume, voice, mute, mic)
├── transcript.js       # Conversation history storage
├── test/
│   └── index.test.js   # Core logic tests (30 tests total)
├── PLAN.md             # Full game specification
└── README.md           # This file
```

### Tech Stack
- **Vanilla HTML/CSS/JS** — no frameworks, no external dependencies
- **MediaRecorder API** — sound recording (3-sec auto-stop)
- **Web Speech API** — TTS for AI dialogue, STT for voice commands
- **Web Audio API** — oscillator-based melody generation
- **CSS custom properties** — design token system
- **SVG** — robot character with expressive eyes

### Design System
- **Colors:** Warm cream background (#FFF9F0), 5 distinct sound colors (coral, teal, gold, green, purple), high contrast
- **Typography:** System rounded sans-serif, 18-24px range, weight 600-800
- **Touch targets:** 56px minimum, 72px+ for primary buttons
- **Grid cells:** 44-52px, responsive to viewport
- **Robot:** CSS/SVG character with neutral/happy/amazed expressions
- **Animations:** 300-500ms transitions, CSS keyframes for mic pulse and beat highlight
- **Reduced motion:** `prefers-reduced-motion` respected

### AI Voice
- **Passive-only:** AI never initiates speech — only responds when addressed
- **State indicator:** Green pulsing (listening), yellow (thinking), blue (speaking), grey (idle)
- **Trigger detection:** Child must use "AI?", "hey robot", "can you?" patterns
- **Dual-channel:** All AI speech shows as text bubble + TTS audio
- **Rate:** 0.85 (slower for K3 comprehension), pitch 1.1

### Fallbacks
- **Mic denied:** 3 retries with guidance, then "Use built-in sounds" via oscillator tones
- **Silent recording:** Detection via AnalyserNode RMS → retry with louder encouragement
- **Empty grid:** After 3 idle prompts → auto-fill simple pattern
- **AudioContext suspended:** Automatic resume on first user gesture
- **TTS unavailable:** Text-only mode with animated speech bubbles
- **Browser tab hidden:** Pause all active recording, playback, melody

### Accessibility
- All interactive elements have ARIA labels
- Grid uses `role="grid"` with `aria-label` on cells
- Speech bubble uses `role="status"` with `aria-live="polite"`
- Color is never the only indicator (shape + outline changes)
- WCAG AA contrast (4.5:1 minimum) for all text
- Touch targets sized for K3 finger precision

## How to Run

1. Open `index.html` in any modern browser (Chrome, Edge, Safari, Firefox)
2. Works from `file://` protocol (local file system)
3. Allow microphone access when prompted
4. Follow the AI character's instructions

## How to Test

```bash
node test/index.test.js
```

Tests validate:
- Sound management (add/abbreviate/validate)
- Beat grid logic (toggle/fill/analyze)
- Melody generation (note count, scale selection, frequency validity)
- State machine flow (all 13 states, correct ordering)
- Intent detection (address triggers, pattern matching)
- Settings defaults (valid ranges)
- Name suggestions (groups and content)

## Technical Notes

- **Sound recording:** <audio/webm> format, 3-second hard limit via timer
- **Sequencer:** 120 BPM, 8th-note grid, `setTimeout`-based loop with beat highlighting
- **Melody:** Triangle wave oscillator, 0.25 gain, 90% decay envelope
- **Grid state:** 2D boolean array [5][8], toggle on click
- **Settings:** Persisted in localStorage, loaded on init
- **Transcript:** In-memory array, max 200 entries, cleared on game reset
- **Confetti:** CSS-only particle animation, 40 pieces, auto-cleanup after 4s
