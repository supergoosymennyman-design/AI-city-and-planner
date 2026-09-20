# Add a Smile — Game Plan

## 1. Game Overview

| Field | Value |
|---|---|
| **Track** | Kindergarten |
| **Band** | K2 (age 4-5) |
| **Lesson** | 09 — Add a Smile |
| **Source** | `source/kindergarten/k2-09-add-a-smile/lesson.md` |
| **Game ID** | `k2-09-add-a-smile` |
| **Entry Point** | `games/kindergarten/k2-09-add-a-smile/index.html` |
| **Tech Stack** | Vanilla HTML/CSS/JS, Canvas API, Web Speech API (TTS + STT) |
| **Architecture** | Self-contained single-page game, no dependencies |
| **Target Age** | K2 (4-5 years old) |
| **Phase** | Phase 1 (2D inputs — drawing, tapping, voice) |
| **Tools Referenced** | drawing-recognition, voice-to-text, text-to-image |

**Brief Description:** Children draw happy/sad/angry faces on a canvas to teach an AI about emotions, then use voice commands to make a robot friend wear those expressions. The AI learns that different-looking smiles all mean "happy", then demonstrates understanding by generating faces on a robot character.

## 2. Narrative Arc

The arc follows **"AI doesn't know → learns from examples → generalizes → demonstrates"** across three acts:

### Act 1 — Teaching (Part A)
1. **AI doesn't know:** "What feeling is this? I need your help!"
2. Child draws three happy faces (big smile, small smile, smile with teeth)
3. **AI learns:** Processes the drawing features, notices all have an upward-curving mouth
4. **AI generalizes:** "They are all... Happy! I can generalize! Even when smiles look different, they all mean happy!"
5. Repeat: child draws sad faces, AI learns downward curve; child draws angry faces, AI learns sharp/angled mouth

### Act 2 — Robot Awakening (Part B)
6. Robot character appears — has no face, just blank oval
7. Robot looks sad/confused, AI says "My robot friend has no feelings yet..."
8. Child says "Make robot happy!" (voice or tap)
9. **AI demonstrates:** generates a happy face on the robot
10. Robot lights up, bounces, says "Your robot is happy!"

### Act 3 — Creative Control (Part C)
11. Child freely commands "Make robot sad" or "Make robot angry"
12. AI generates the corresponding face each time
13. **AI shows mastery:** Recognizes the emotion word, generates correct expression instantly
14. Celebration: "Your robots have so much personality now! Great job teaching AI about emotions."

## 3. Activity Flow

### Part A — Draw & Generalize (~8 min classroom, ~3 min per kid in self-serve)

```
[Start Screen] → [Part A Intro: "Draw a happy face!"] → [Canvas: Child draws]
  → [AI processes drawing] → [AI names the emotion] → [Repeat ×3 per emotion]
  → [AI summarizes: "All these are X!"] → [Next emotion]
```

**Transitions:**
- Emotion 1→2→3: Brief celebration, "Now let's try sad!" auto-advance after 3 drawings
- After all 3 emotions complete: "You taught me so much! Let's go meet my robot friend!"

**Detailed flow:**
1. AI voice + text bubble: "Let's draw faces together! I want to learn about feelings. Draw a happy face!"
2. Canvas appears with crayon-color picker (3-4 colors: red, blue, green, yellow/black)
3. Child draws a face on the canvas template (circle face outline pre-drawn)
4. Child taps "Done drawing!" button (large, chunky, bottom-center)
5. AI analyzes the mouth region: curvature direction → emotion classification
6. AI responds: "Hmm... I see a mouth that curves UP! That means... HAPPY!" with celebration
7. Repeat: "Draw another happy face!" ×3 total
8. After 3: "Wait... these all look different but they're ALL happy! I learned that different smiles can all mean happy. I can GENERALIZE!"
9. Same cycle for sad (3 drawings) and angry (3 drawings)

**Auto-advance logic:** After 3 drawings per emotion, transition automatically with a 3-2-1 countdown and "Next feeling coming up!"

### Part B — Make Robot Happy (~8 min classroom, ~3 min per kid)

```
[Robot intro scene] → [Robot appears faceless] → ["Say 'Make robot happy!'"]
  → [Voice/tap input] → [AI generates happy face on robot] → [Robot celebrates]
```

**Detailed flow:**
1. Scene transitions: Canvas fades out, robot character slides in from left
2. Robot has a blank oval face, no features. Robot slumps a little
3. AI: "This is my robot buddy! But oh no... it has no face. Can you help? Say 'Make robot happy!'"
4. Large microphone button + "Make robot happy!" text hint visible
5. If voice: STT listens, matches intent "Make robot happy" (fuzzy match)
6. Robot's face area animates: eyes and mouth draw in (animated stroke, ~1 second)
7. Robot does a happy bounce, eyes become ^ ^, mouth becomes big D-shaped smile
8. AI: "Your robot is happy! You told it what to feel, and now it has a smile!"

### Part C — Kids Design Robot Faces (~4 min)

```
[Free play mode] → [Child says "Make robot sad"] → [Robot face changes]
  → [Child says "Make robot angry"] → [Robot face changes] → [...]
  → [Celebration screen after 3+ changes]
```

**Detailed flow:**
1. AI: "Now YOU are in charge! Tell your robot how to feel. Say 'Make robot sad' or 'Make robot angry' or 'Make robot happy' again!"
2. Command buttons: 3 large emotion buttons (happy/sad/angry) + microphone
3. Each command instantly transforms the robot's face with a morph animation
4. After 3 successful commands: "You're an emotion expert! Your robot has so much personality!"
5. Confetti + final pose with all 3 emotions cycling on robot

## 4. Multi-Modal Interaction Design

Three input/output channels work together without overwhelming the child:

### Channel Map

| Action | Input Mode | Output Mode | Notes |
|---|---|---|---|
| Draw face | Finger touch on Canvas | Visual (drawing appears) + TTS prompt | Canvas is primary action |
| Name emotion | System analyzes drawing | TTS + text bubble (AI names it) | No child speech needed here |
| Command robot | Voice (STT) OR tap button | Robot face animates + TTS | Dual-mode: voice preferred, tap fallback |
| AI narration | — | TTS + simultaneous text bubble | Always dual-channel |

### Concurrency Rules
- **Never play TTS while child is drawing** (distracting)
- TTS pauses between sentences for child processing (1.5s gap)
- Text bubble persists for 3 seconds after TTS ends
- Canvas interaction always takes priority (no TTS interruption during active drawing)
- Voice commands only active during Part B and C, clearly indicated by pulsing mic icon

### Drawing Input Design
- Canvas is ~70% of screen height (portrait tablet orientation)
- Pre-drawn circle face outline (grey, thin stroke) as guide
- 3-4 crayon colors at bottom: red, blue, green, black/yellow — chunky circles, 64px diameter
- Eraser button (not strictly needed but gives confidence)
- Stroke width: 12px fixed (finger-friendly, no pressure sensitivity)
- "Undo last stroke" button in top-right of canvas area
- Drawing is auto-saved stroke by stroke (no explicit save needed)

### Voice Command Design (Part B & C)
- Wake word not needed — game context clearly signals when to speak
- STT listens only when mic button is tapped (push-to-talk)
- 5-second listening window, then processes
- Intent matching: simple keyword detection
  - "happy" → happy
  - "sad" → sad
  - "angry", "mad" → angry
- Partial matches accepted: "ha-ppy" → happy, "saaad" → sad

## 5. Technical Approach

### Canvas Drawing System

```javascript
// Pseudocode architecture
class DrawingCanvas {
  constructor(canvasEl, options) {
    this.strokes = [];        // Array of {points[], color, width}
    this.currentStroke = null;
    this.faceOutline = {x, y, radius};  // Pre-drawn circle guide
  }

  // Touch handlers with pointer events (works on touch + mouse)
  onPointerDown(x, y) { /* start new stroke */ }
  onPointerMove(x, y) { /* add point to current stroke */ }
  onPointerUp() { /* finalize stroke */ }

  // Emotion analysis
  analyzeMouthRegion() {
    // 1. Get bounding box of bottom-third of face circle
    // 2. Find strokes in mouth region (y > faceCenterY * 0.3)
    // 3. Sample points along longest mouth stroke
    // 4. Fit a polynomial (degree 2 is enough)
    // 5. Check second derivative sign:
    //    - Positive curvature → upward curve → HAPPY
    //    - Negative curvature → downward curve → SAD
    //    - Sharp angles / zigzag → ANGRY
    // 6. Confidence score: if curve is clear enough
    return { emotion: 'happy' | 'sad' | 'angry', confidence: 0.0–1.0 };
  }
}
```

**Mouth curvature detection** — simplified for K2 scribbles:
1. Divide the face circle into 3 horizontal bands (eyes, nose/mid, mouth)
2. Look for strokes in the bottom band (mouth region)
3. Take the leftmost and rightmost points of the longest bottom-band stroke
4. Find the midpoint of the stroke at x = (leftX + rightX) / 2
5. Compare midpoint y to straight-line y at that x:
   - Midpoint above line → upward curve (happy) — CONFIDENCE += 0.4
   - Midpoint below line → downward curve (sad) — CONFIDENCE += 0.4
6. Count direction changes in stroke (angry detection):
   - >3 direction reversals in top 20% of strokes → angry marker — CONFIDENCE += 0.3
7. If no clear mouth detected, fall back to: any scribble in bottom band → accept as "drawing"

**Important:** Always accept any reasonable attempt. If confidence < 0.3, respond generically: "I see you drew something! Is it a happy face?" rather than rejecting.

### Face Outline Detection (Eye Region)

For Parts B & C, robot face generation uses canvas-drawn features:

```javascript
class RobotFaceGenerator {
  // Pre-defined feature sets for each emotion
  static FEATURES = {
    happy: {
      eyes: '^_^',
      mouth: 'D',      // Wide open smile
      cheeks: 'blush',
      eyebrows: 'relaxed'
    },
    sad: {
      eyes: '>_<',
      mouth: 'n',      // Frown
      cheeks: 'teardrop',
      eyebrows: 'angled-up'
    },
    angry: {
      eyes: '>_<',
      mouth: 'v',      // Upside-down V scowl
      cheeks: 'none',
      eyebrows: 'angled-down'
    }
  };

  // Draw robot face using canvas primitives
  draw(containerEl, emotion) {
    // Uses filled shapes on a separate canvas overlay
    // Eyes: two circles with pupil dots
    // Mouth: bezier curve or arc
    // Eyebrows: angled lines
  }
}
```

### Emotion Recognition Implementation

Three-stage analysis pipeline:

1. **Stroke capture:** Record all pointer events per stroke (x, y, timestamp)
2. **Region detection:** Map strokes to face regions using bounding boxes relative to face center
3. **Classification:**
   - Happy: upward-opening mouth curvature (positive second derivative)
   - Sad: downward-opening mouth curvature (negative second derivative)
   - Angry: sharp angle features OR downward eyebrows + zigzag mouth
   - If no mouth detected in region, check whole face area for any drawing → accept as "something happy/sad"

### Speech Synthesis (TTS)

```javascript
function speak(text, onEnd) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;       // Slower for K2 comprehension
  utterance.pitch = 1.2;       // Slightly higher, friendly
  utterance.volume = 1.0;
  utterance.lang = 'en-US';
  // Select a friendly voice if available
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google UK'));
  if (preferred) utterance.voice = preferred;
  utterance.onend = onEnd;
  speechSynthesis.speak(utterance);
}
```

### Speech Recognition (STT)

```javascript
function startListening(onResult, onError) {
  const recognition = new (webkitSpeechRecognition || SpeechRecognition)();
  recognition.lang = 'en-US';
  recognition.continuous = false;    // Single utterance
  recognition.interimResults = true; // Show partial for feedback
  recognition.maxAlternatives = 3;   // Pick best match

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase();
    // Fuzzy emotion keyword matching
    if (transcript.includes('happy')) onResult('happy');
    else if (transcript.includes('sad')) onResult('sad');
    else if (transcript.includes('angry') || transcript.includes('mad')) onResult('angry');
    else onError('unrecognized');
  };

  recognition.start();
}
```

### State Machine

```
INIT → INTRO → PART_A_DRAW → ANALYZE → PART_A_RESULT → [loop 3×]
  → PART_A_SUMMARY → [next emotion, 3 emotions total]
  → PART_B_INTRO → PART_B_LISTEN → PART_B_GENERATE → PART_B_CELEBRATE
  → PART_C_FREE_PLAY → [loop until 3+ commands]
  → GAME_COMPLETE → CELEBRATION
```

Each state has `onEnter()`, `onExit()`, and transition callbacks. State persistence: current step stored in variable (no localStorage needed for single session).

## 6. Fallback Patterns

### No Microphone / Permission Denied
- **Part A:** No microphone needed (child draws, AI analyzes). No fallback required.
- **Part B:** If mic unavailable: show 3 large emotion buttons labeled "Make robot happy!", "Make robot sad!", "Make robot angry!" with matching emoji icons. Child taps instead of speaking.
- **Part C:** Same 3-button approach. Button size: minimum 80px height.

### Imprecise Drawing
- **Problem:** Child scribbles outside face circle, or draws very faintly
- **Fallback:** Any stroke that intersects the face circle's bounding box is accepted. If no strokes detected in any face region, AI says "I see some beautiful colors! Let me try again — can you draw inside the circle?" (gentle prompt)
- **Acceptance threshold:** Extremely low. Any mark within 20px of the face outline counts as "a face"

### Unrecognized Speech
- **Problem:** Child mumbles, speaks too softly, says wrong words
- **Fallback 1 (soft):** "I didn't quite catch that. Can you say it again?" (retry, 3 attempts)
- **Fallback 2 (tap):** After 3 failed STT attempts, show emotion buttons as alternative
- **Fallback 3 (visual prompt):** Highlight the text hint with animation, point to it
- Never show error state — always frame as "let's try again!"

### Drawing Analysis Low Confidence
- **Problem:** Child draws something that doesn't look like any emotion
- **Fallback:** If confidence < 30% for all emotions: "Hmm, I see you drew something! I think it looks happy! Let's try another one!" (Always default to a positive emotion guess rather than showing confusion)
- Never say "I don't know" — always make a best guess, even if wrong

### Rapid Tapping
- **Problem:** Child mashes buttons repeatedly
- **Fallback:** Input cooldown: 800ms minimum between state transitions. Button visually dims during cooldown. Drawing canvas accepts all strokes normally (can't be "mashed").

### Idle / No Interaction
- **Problem:** Child stops interacting for 10+ seconds
- **Fallback:** Gentle prompt: "Need help? Just draw something on the circle!" / "Tap the button when you're ready!" (only after 10s idle, repeats every 15s, max 3 prompts)

## 7. Accessibility

### Touch Targets
- All interactive elements: minimum 56px (exceeds 48px baseline — K2 needs bigger)
- Primary buttons (Done, Start, emotion commands): minimum 72px height
- Color picker circles: 64px diameter
- Emotion buttons (Part B/C): 88px height minimum

### Typography
- Body text (AI speech bubbles): 22px minimum (K2 readability)
- Button labels: 20px minimum
- Title/headings: 28px minimum
- Font: system rounded sans-serif (`-apple-system`, `SF Pro Rounded`, or `Nunito` loaded)
- Line spacing: 1.5

### Color & Contrast
- Text on backgrounds: minimum 4.5:1 contrast ratio
- All interactive states have distinct visual treatment (not color-only)
- Button hover/press: scale transform (1.05×) + color darken
- Never use red-only for errors (add icon + text)
- Background: warm cream `#FFF8F0` (reduces screen glare for young eyes)

### Two-Channel Output
- All AI speech appears as text bubble AND spoken aloud
- Text bubble stays visible for 3 seconds after speech ends
- Robot emotion changes shown visually AND verbally confirmed
- No essential information conveyed through sound alone

### Reduced Motion
- Respect `prefers-reduced-motion`: disable all bounce/canvas animations
- Essential transitions only: fade (300ms) instead of slide/bounce
- Robot face changes: instant swap instead of animated draw

### Screen Reader Support
- ARIA live regions for AI text bubbles (`role="status"`, `aria-live="polite"`)
- Canvas has `role="img"` with `aria-label="Drawing area for faces"`
- Buttons have descriptive `aria-label` (e.g., "Draw with red color" not just "Red")
- Robot canvas has `role="img"` with current emotion as label

## 8. Edge Cases

### Child draws nothing
- After 15 seconds on canvas with no strokes: "Start by drawing a mouth on the circle!" (arrow animation pointing to face)
- After 30 seconds: "Let me show you!" → auto-draw a sample smile → "Now you try!"
- If child still doesn't draw after 45s: offer to skip to Part B (never force)

### Child draws in wrong area (outside circle)
- All strokes still recorded — use the entire canvas as valid drawing space
- Analysis widens search area to full canvas if no strokes found in face region
- If strokes are far from face (>200px from center), AI says "Nice drawing! Try making the mouth on the face circle next time"

### Child says unrecognized word
- Map attempted words through soundex/phonetic similarity: "hap-pee" → happy, "sad-die" → sad
- If no match: "I heard you but I'm not sure that feeling! Try: 'Make robot happy!'"
- After 3 failures: switch to button-only mode automatically

### Multiple children talking at once
- Push-to-talk model prevents overlap (only listens when button held/tapped)
- If multiple voices detected during listening window, take the clearest segment
- If no clear utterance, return "I heard lots of voices! Can one friend say it?"

### Child rapidly cycles emotions in Part C
- No cooldown on emotion changes (this is the fun part!)
- Only limit: minimum 400ms per transition to prevent strobing
- After 10 rapid changes in 15 seconds, add a whimsical reaction: "Wow, so many feelings! Your robot is very expressive!" (no punishment)

### Browser tab hidden / audio context suspended
- TTS pauses when tab is backgrounded — resume on visibility change
- Canvas state persists in memory (no saving needed)
- On return: play brief re-engagement prompt

### Touch events vs pointer events
- Use `pointerdown`/`pointermove`/`pointerup` (unified for touch + mouse)
- Call `event.preventDefault()` to prevent scrolling while drawing
- Fallback: `touchstart`/`touchmove`/`touchend` if pointer events unavailable
- `touch-action: none` CSS on canvas element

### Canvas size changes (orientation / resize)
- Canvas dimensions set on mount and on `resize` event
- Responsive: canvas.width = container.clientWidth (up to 600px max)
- Aspect ratio maintained: height = width × 0.75 (3:4 portrait-friendly)

### SpeechSynthesis voices not loaded
- Call `speechSynthesis.getVoices()` on page load, store available list
- Fallback: any system voice at rate 0.85
- If TTS completely unavailable: text-only mode with animated speech bubble indicators

## 9. Visual Design Direction

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-warm` | `#FFF8F0` | Page background |
| `--canvas-bg` | `#FFFFFF` | Drawing canvas area |
| `--primary-blue` | `#4A90D9` | Buttons, interactive elements |
| `--primary-green` | `#5CB85C` | Success, correct answer |
| `--accent-orange` | `#F5A623` | Celebrations, emphasis |
| `--coral-red` | `#E07A5F` | Sad/angry indicators, errors |
| `--text-dark` | `#2D2D2D` | Body text |
| `--text-light` | `#FFFFFF` | Text on dark backgrounds |
| `--robot-gray` | `#B8B8C7` | Robot body |
| `--robot-accent` | `#FF6B6B` | Robot details (heart, blush) |

No purple gradients, no glassmorphism, no neon. Flat, bold, warm colors.

### Robot Design

```
Friendly rounded robot character:
  - Rectangular/squarish body with rounded corners (20px radius)
  - Color: warm gray (#B8B8C7) body
  - Antenna with glowing ball on top
  - Two arm stubs (can raise/lower for emotion)
  - Face area: large oval, white fill
  - Eyes: two circles, animated pupils
  - Mouth: generated per emotion
  - Cheeks: optional blush circles for happy
  - Robot sits on a simple ground line
```

Robot dimensions: approximately 300×400px (centered on screen in Part B/C).

### Screen Layouts

**Part A (Drawing):**
```
┌──────────────────────────────────────┐
│  [Back button]          [Sound toggle]│
│                                        │
│  "Draw a HAPPY face!"                │
│  (AI text bubble, 22px)              │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │                                  │ │
│  │       [Face circle guide]        │ │
│  │       (thin grey stroke)         │ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│                                        │
│  [🔴] [🔵] [🟢] [⚫]    [↩ Undo]     │
│                   [✓ Done drawing!]   │
└──────────────────────────────────────┘
```

**Part B/C (Robot + Commands):**
```
┌──────────────────────────────────────┐
│  "Say 'Make robot happy!'"           │
│  (AI text bubble)                     │
│                                        │
│        ┌──────────────┐              │
│        │              │              │
│        │   [ROBOT]    │              │
│        │  with face   │              │
│        │              │              │
│        └──────────────┘              │
│                                        │
│  [🎤 Hold to talk]                   │
│  [😊] [😢] [😠]   (tap fallback)    │
│                                        │
└──────────────────────────────────────┘
```

### Typography

- Primary font: `Nunito` (loaded from Google Fonts — rounded, friendly, excellent legibility)
- Headings: `Nunito` Bold, 28px
- Body / AI speech: `Nunito` SemiBold, 22px
- Button labels: `Nunito` Bold, 20px
- Robot speech (in bubble): `Nunito` Italic, 20px
- No custom font: fallback to system `-apple-system`, `BlinkMacSystemFont`

### Animation Style

- **Duration:** 300-500ms for all transitions (slow enough for K2 to follow)
- **Easing:** `cubic-bezier(0.34, 1.56, 0.64, 1)` — playful overshoot for celebrations
- **Drawing reveal:** Robot's face features stroke-dasharray animation (draws on screen)
- **Robot bounce:** Scale Y 0.95 → 1.05 → 1.0 (squish and stretch) over 400ms
- **Emotion morph:** Robot face transitions via opacity fade (200ms) + scale pop (300ms)
- **Confetti (celebration):** 8 simple colored circles that rise and fade, 1s duration
- **No spinning, no pulsing text, no screen shake** (vestibular safe)

### Icon & Visual Language

- All buttons use both icon + text label (never icon-only for K2)
- Emotion icons: simple face emojis drawn as SVGs (not platform emoji for consistency)
- Drawing tools: solid filled circles with color name underneath
- Microphone: classic mic SVG with pulsing ring animation when active
- Robot: custom SVG illustration (not a photo, not 3D-rendered)
- Navigation: chevron back arrow + home icon in header

### Layout Constraints

- **Minimum width:** 320px (small tablets like iPad Mini)
- **Maximum width:** 800px (tablets in landscape, capped for readability)
- **Portrait-first:** game designed for portrait orientation, works in landscape too
- **Safe area:** 24px padding on all sides (notch-safe)
- **Status bar:** 44px top padding for iOS notch
- **Bottom action area:** 120px tall zone, always within thumb reach

## Pipeline History

- **Planner:** 33 questions answered across 6 rounds
- **Round 1 (Foundation):** Target age K2 (4-5), Phase 1 constraints, 25-min lesson structure, 3 emotion types, robot from Lesson 2 callback
- **Round 2 (Interaction):** Finger drawing vs stylus, push-to-talk voice, tap fallback, 3-4 color picker, pre-drawn face guide, stroke-by-stroke capture
- **Round 3 (Technical):** Canvas API for drawing + robot face, polynomial fit for curvature detection, Web Speech API dual-use, no external libraries
- **Round 4 (Narrative):** 3-act arc (teach → awaken → control), AI generalizes across 3 examples per emotion, robot face generation as demonstration
- **Round 5 (Edge Cases):** Scribble acceptance (wide), STT fallback chain, rapid tapping cooldown, no-stroke prompts, multi-child handling, visibility suspend
- **Round 6 (Polish):** Warm cream palette (no purple), 56px+ touch targets, Nunito typography, 300-500ms animations, dual-channel output, reduced-motion respect
