# Game Plan: p3-02-subsurface-ai-scanning-and-site-analysis

## Lesson Info
- **Track:** primary
- **Band:** P3 (Age 8)
- **Lesson:** 2
- **Game Name:** Subsurface Signal Decoder
- **Source:** `source/primary/lessons/lesson-02/p3/`
- **Objective:** Students interpret live data charts with signal noise to identify hazard spikes and input precise grid coordinates for safe construction
- **AI Concepts:** Signal processing, sensor fusion, anomaly detection

## AI Narrative
The AI is a **Subsurface Survey Drone** that scans underground using sensor pulses. At first, the AI produces clean, simple signals. As the student progresses, the AI encounters real-world challenges:
- **Level 1:** The AI scans in perfect conditions — one clear hazard signal
- **Level 2:** The AI detects multiple targets — the student must identify all hazards
- **Level 3:** The AI deals with environmental noise — the student must distinguish signal from noise
- **Level 4:** The AI performs deep subsurface scanning — hazards only visible at certain depths
- **Level 5:** The AI does a full 2D cross-section survey — the student scans row by row to find the hidden bunker

The AI "learns" by showing increasingly realistic sensor data, and the student learns to become a skilled survey operator who can interpret complex signals.

## Target Age
- **Age:** 8 (P3)
- **Reading level:** Simple 1-2 sentence instructions
- **Touch targets:** 48px minimum, 56px preferred
- **Visual clarity:** High contrast, clear labeling, color-coded signals
- **Layout:** Tablet landscape (1024×768), no scrolling

## Game Flow

### Flow Pattern
```
INTRO → LEVEL_SELECT → SIGNAL_ANALYSIS → DRILL_DECISION → FEEDBACK → (next level or celebration)
```

### Phase 1: Intro
- Title screen with animated oscilloscope and AI survey drone character
- Brief instruction: "Use the scanner to find underground hazards before we build!"
- Tap to begin

### Phase 2: Level Select
- Top menu bar with Levels 1–5, all unlocked
- Current level highlighted
- Brief level objective shown

### Phase 3: Signal Analysis
- Large oscilloscope chart shows signal data (canvas-drawn)
- Position grid (1–8) beneath the chart for tapping drill locations
- Student reads the signal and taps the position(s) where hazards appear
- Visual and text feedback on each tap

### Phase 4: Drill Decision
- Student confirms their hazard selections
- "Drill Here" button activates
- System checks selections against correct hazard positions

### Phase 5: Feedback
- **Correct:** Green highlight, "Hazard found! Safe to build!" + celebration sound
- **Incorrect:** Red highlight on wrong spot, "No hazard there. Try again!" + gentle error sound
- After 3 wrong attempts, correct positions are revealed as a teaching moment

### Phase 6: Completion
- After all 5 levels complete: "Congratulations! You're a certified Subsurface Survey Operator!"
- Star rating (based on accuracy)
- Option to replay any level

## Input Modes
- **Primary:** Tap on position buttons (1–8) below the chart
- **Level 5:** Tap row buttons to view row signals, then tap column within selected row
- **Fallback:** All interaction is tap-based, no special APIs needed

## Content & Data

### Level Design
| Level | Name | Chart Type | Hazard Positions | Difficulty |
|-------|------|------------|------------------|------------|
| 1 | The Clean Signal | Flat line + 1 spike | Position 4 | Easy |
| 2 | Multiple Targets | Flat line + 2 spikes | Positions 2, 7 | Easy |
| 3 | Signal Noise | Wavy baseline (10-20px) + tall spike (80px) | Position 5 | Medium |
| 4 | Depth Layers | Two charts (Shallow + Deep) | Deep Scan only, Position 3 | Medium-Hard |
| 5 | 2D Cross-Section | 5×5 grid, row-by-row scan | Row 3, Col 4 (bunker) | Hard |

### Success Criteria
- Level 1-2: Identify all hazards in one pass
- Level 3: Distinguish noise spikes from real hazards (>60% threshold)
- Level 4: Understand that deep scans reveal hidden hazards
- Level 5: Systematic row-by-row scanning to find target

### Progression
- Each level introduces ONE new concept
- Levels are non-linear (all unlocked) but designed to be played in order
- Attempts tracked per level
- 3 wrong attempts → solution revealed (teachable moment)

## Technical Approach
- **Stack:** Vanilla HTML5 + CSS3 + JavaScript (no frameworks)
- **Rendering:** HTML5 Canvas for signal charts
- **Architecture:** Single-page app with level state management
- **AI Capabilities:** No external AI needed — signal generation is algorithmic
- **Audio:** Web Audio API for sound effects, SpeechSynthesis for voice feedback
- **Offline:** Fully self-contained, works offline

### File Structure
```
games/primary/p3-02-subsurface-ai-scanning-and-site-analysis/
├── index.html              # Main entry point
├── style.css               # All styles + CSS custom properties
├── main.js                 # App initialization + state machine
├── game.js                 # Core game logic + level data
├── chart.js                # Canvas signal chart renderer
├── audio.js                # Sound effects + TTS
├── README.md               # How to run
├── PLAN.md                 # This file
```

## Conversation Design
The AI Survey Drone has a text-based assistant (Nova) that provides feedback:

- **On level start:** "Scanning subsurface... Look for signal spikes!"
- **On correct tap:** "Hazard confirmed at position [X]! Marking no-build zone."
- **On incorrect tap:** "That area looks clear. Check the spike height."
- **On level complete:** "Survey complete! Area is safe for construction."
- **On all levels done:** "You've mapped the entire site! You're a real survey operator!"

### AI Passivity
The AI text/voice feedback only responds to game actions (taps, level completion) — it does not auto-narrate unprompted.

### AI State Indicator
- **Scanning:** Pulsing green radar ring
- **Analyzing:** Yellow processing dots
- **Reporting:** Blue speech wave
- **Idle:** Grey dim dot

### Settings Panel
- ⚙️ icon in top-right corner
- Volume slider (0-100%)
- Sound effects toggle
- Voice feedback toggle (TTS on/off)

### Model Loading Indicator
- Not applicable — no external ML models needed
- All signal generation is algorithmic

## Edge Cases & Error Handling
- **Wrong answer:** Gentle correction, 3-attempt limit then solution reveal
- **Rapid tapping:** Input debounced (500ms cooldown after each tap)
- **Skip/refuse:** Student can switch levels freely via top menu
- **Refresh:** Game resets to intro (state is per-session)
- **Accessibility:** All instructions visible as text + read aloud via TTS
- **Empty state:** Chart always shows data — no blank states

## Polish
- **Visual style:** Scientific oscilloscope aesthetic with playful kid-friendly colors
- **Color palette:** Dark background (oscilloscope), bright neon green signals, warm orange for hazards, blue accents
- **Character:** Animated AI survey drone character (SVG)
- **Sound:** Retro sci-fi beeps for signals, success chime, gentle error buzz
- **Typography:** Display font for headings (Fredoka), body font for instructions (Nunito)
- **i18n:** English hardcoded (English curriculum)

## Success Criteria
After playing, the student should:
1. Understand that sensor data must be interpreted (not just seen)
2. Distinguish real signals from noise
3. Understand that different scan depths/parameters reveal different information
4. Appreciate that AI-assisted surveying makes construction safer
5. Be able to read a simple signal chart and identify anomalies
