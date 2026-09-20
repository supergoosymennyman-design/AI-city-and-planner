# PLAN: AI Architect (K3-03)

## Game Overview

| Field | Value |
|---|---|
| **Lesson ID** | k3-03-ai-architect |
| **Track** | kindergarten |
| **Band** | K3 (age 4–5) |
| **Title** | AI Architect |
| **Objective** | Generate a house using shapes + 2 colors (e.g. "star window, red roof") |
| **Tools** | `voice-to-text`, `text-to-image` |
| **Phase** | 1 (lesson ≤ 10) |

## AI Narrative Arc

> **"AI doesn't know → Child teaches → AI demonstrates"**

1. **Part A — AI doesn't know**: Botly (the AI friend) appears on screen. Botly says "I don't know how to build a house! Can you teach me about shapes and colors?"
2. **Part B — Child teaches**: Children practice telling Botly what shape and color each house part should be. Botly learns and tries to repeat back.
3. **Part C — AI demonstrates**: Using what the child taught, Botly generates/renders a complete house. "Look! I learned from you!"

## Target Audience (K3)

- **Age**: 4–5 years old
- **Reading**: Pre-literate / early emergent — all instructions should be spoken by the AI (TTS) with icons as visual reinforcement
- **Attention span**: ~8–10 minutes per activity segment
- **Motor skills**: Developing fine motor — need large touch targets (≥56px, ideally 64px+)
- **Tech familiarity**: May have used tablets at home or in K2. Simple tap/drag interactions only.
- **Language**: Short 2–3 word phrases, concrete vocabulary (shape names, color names)

## Game Flow (25-Minute Session)

### 🟢 PART A: "AI Doesn't Know" — Teach Shapes & Colors (8 min)

**Setup**: Botly appears on screen in a blank landscape. Speech bubble: "Hello! I want to learn how to build a house. Can you teach me shapes and colors?"

**Flow**:
1. **Shape Showcase**: 4 shapes appear on screen — CIRCLE, SQUARE, TRIANGLE, STAR. Botly says each name and highlights it. Children tap each shape to hear its name again.
2. **Color Showcase**: 6 colors appear as paint swatches — RED, BLUE, YELLOW, GREEN, ORANGE, PURPLE. Botly says each color. Children tap each to hear it.
3. **Teach Botly**: Botly asks "Can you tell me what shape this is?" — shows a shape, child says the name (STT listens). Botly confirms "Yes, that's a circle!" or "Hmm, I heard 'square' — is that right?" (with tap buttons Yes/No).
4. **Color Quiz**: Similar — Botly shows a color, child says the name.

**Exit**: When the child has correctly named 3 shapes and 3 colors, Botly says "Now I know shapes and colors! Let's build something!"

### 🔵 PART B: "Practice" — Describe House Parts (7 min)

**Flow**:
1. **House blueprint appears**: An outline of a house with 3 empty parts highlighted:
   - **Roof** (triangle outline)
   - **Door** (rectangle outline)
   - **Windows** (2 circles or squares outlined)
2. **Voice input**: For each part, Botly asks "What shape and color should the ROOF be?" 
   - Child speaks: "Red triangle" or "star door, blue"
   - STT captures the utterance
   - Botly interprets and shows the selected shape+color on the house outline
   - "You want a RED TRIANGLE roof? Tap YES or try again."
3. **Visual fallback**: If voice isn't working, child can drag shapes from a palette and drop them onto the house parts, then tap a color swatch.

**Exit**: All 3 house parts are assigned a shape and color. Botly says "Great! You told me everything I need to build a house!"

### 🟣 PART C: "AI Demonstrates" — Build the House! (10 min)

**Flow**:
1. **"Loading..." moment**: Botly says "I'm building your house..." with a playful animation (gears turning, paint splashing). SmolLM/TTS says "Let me put the red triangle roof on top..."
2. **House rendering**: The complete house appears assembled with the child's chosen shapes, colors, and labels:
   - ROOF: [shape] [color]
   - DOOR: [shape] [color]
   - WINDOW: [shape] [color]
3. **Botly presents**: "Look what YOU taught me to build! I used a red triangle for the roof, a blue square for the door, and yellow circles for the windows!"
4. **Celebration**: Confetti or star animation. Botly says "You're a great teacher! Can we build another house?"
5. **Optional replay**: Child can change one part and rebuild.

## Technical Architecture

### Core Technology Choices

| Capability | Primary Implementation | Fallback |
|---|---|---|
| **Voice-to-Text (STT)** | `window.SpeechRecognition` (Web Speech API) — Chrome/Safari/Edge | Tap-to-select from a grid of shapes+colors |
| **Text-to-Speech (TTS)** | `window.speechSynthesis` — rate 0.7 for K3 | Text on screen + icon cues |
| **House Rendering** | Canvas 2D or SVG — hand-drawn style shapes composed into a house scene | Static SVG image |
| **Conversation AI** | SmolLM2-135M via Transformers.js (optional, for free-text understanding) OR intent matching | Keyword matching on STT output |
| **State Management** | Plain JS object (in-memory) | localStorage for replay |
| **VAD (Voice Detection)** | `@ricky0123/vad-web` (Silero VAD) — detect when child speaks | Manual mic button |

### Conversation AI Design (Passive Listening)

- **Botly character**: A friendly, round, robot-like animated character (SVG/CSS) positioned in the lower-right corner
- **Listening state**: Botly has idle/listening/thinking/speaking visual states
- **Always listening, never interrupting**: VAD detects speech segments. Botly only responds when:
  1. Child says "Botly" or "Hey Botly" (wake word)
  2. Botly has just asked a question and is expecting an answer
  3. An intent is detected from the STT output (shape name + color name combo)
- **Auto-greeting**: DISABLED. Botly does NOT say "hello" on page load — the teacher controls the start via a visible "START" button

### House Rendering System

The house is composed of SVG shapes assembled programmatically:

```
Roof: triangle shape
   /\
  /  \
 /____\
|  []  |  ← Windows: circle or square
|  __  |
| |__| |  ← Door: rectangle or square
|______|
```

Each part stores:
```js
{
  part: "roof" | "door" | "window",
  shape: "circle" | "square" | "triangle" | "star",
  color: "red" | "blue" | "yellow" | "green" | "orange" | "purple"
}
```

The shapes are drawn using a child-like, hand-drawn style (slightly imperfect lines, rounded corners) rather than rigid geometric shapes — more inviting for K3.

### Shape + Color Palette

**Shapes** (4): Circle ◯, Square ◻, Triangle △, Star ☆
**Colors** (6): Red (#FF6B6B), Blue (#4A90D9), Yellow (#FFD93D), Green (#6BCB77), Orange (#FF8C32), Purple (#C084FC)

Each color has a friendly, highly-saturated hue — distinct for color-blind children (use shape + label as redundant cue).

## UI Design

### Layout (Tablet Portrait, 1024×768)

```
┌──────────────────────────────────┐
│  [⬅ Back]         ⭐ Score: 3/6 │  ← Top bar
├──────────────────────────────────┤
│                                  │
│      [Main Activity Area]        │  ← 60% of screen
│      Shapes, colors, house       │
│      building canvas             │
│                                  │
├──────────────────────────────────┤
│  [Shape] [Color] [Part] Palette │  ← 25% — interaction zone
├──────────────────────────────────┤
│   💬 Botly says: "..."    [🎤]  │  ← 15% — AI output + mic
└──────────────────────────────────┘
```

### Design Principles

- **No AI-slop visuals**: No purple gradients, glassmorphism, or generic bubble UI. Use flat, friendly, illustrated style with warm pastel backgrounds.
- **Large everything**: Touch targets ≥64px. Text ≥20px (Botly speech ≥24px).
- **High contrast**: Body text ≥4.5:1 ratio. Color swatches have dark borders for contrast.
- **Child-like aesthetic**: Hand-drawn style shapes, crayon-textured backgrounds, rounded friendly UI.
- **Two-channel output**: Everything Botly says is also shown as text in a speech bubble.

### Color Palette (Custom, Not Default)

- Background: Warm cream/off-white (#FFF8F0)
- Primary UI: Soft teal (#5BA4A4) — not purple!
- Accent: Warm coral (#FF8A80)
- Botly: Light mint green (#B8F2E6) body with dark teal (#2D6A6A) details
- Text: Dark warm gray (#3D3D3D)
- Error/fix-it: Soft amber (#FFC107)

## Multi-Modal Fallback Plan

| Scenario | Fallback |
|---|---|
| Microphone denied/disconnected | Show a touchable grid: child taps shape → tap color → tap house part to assign |
| Speech recognition fails (unintelligible) | Botly says "I didn't quite catch that" and shows the grid option |
| TTS unavailable | Show text in speech bubble + use a helper voice (peer teacher reads aloud) |
| No internet | Pre-cached SVGs + assets. Use keyword matching (no SLM). |
| Camera (N/A for this lesson) | Not needed |
| Touch only (no voice) | Full drag-and-drop or tap-based shape+color assignment |
| Slow tablet (model loading fails) | Skip SmolLM, use deterministic intent matching on STT output |

## States & Transitions

```
[LOADING] → Botly intro screen → [PLAYER taps START]
    → PART A: Teach Shapes & Colors
        → Show/Tap shapes → Show/Tap colors → Quiz (speak or tap)
        → [3 shapes + 3 colors taught] → TRANSITION to Part B
    → PART B: Practice Describing House
        → Show house outline → For each part: ask "What shape+color?"
        → Child responds (voice or tap) → Botly confirms → [all 3 parts filled]
        → TRANSITION to Part C
    → PART C: AI Builds the House
        → "Building..." animation → House renders → Botly narrates
        → Celebration → [Rebuild] or [Done]
    → [SUMMARY] → Show final house + replay option
```

## Accessibility Checklist

- [ ] Touch targets ≥56px (64px preferred) for all interactive elements
- [ ] Color + shape as redundant representation (never color alone)
- [ ] All audio output has visual text equivalent
- [ ] TTS rate set to 0.7 (slower for K3 understanding)
- [ ] High contrast ratio (≥4.5:1 body, ≥3:1 large text)
- [ ] No reliance on fine motor skills (tap, don't drag precisely)
- [ ] Clear visual focus/hover states on interactive elements
- [ ] No auto-playing media — teacher-controlled transitions
- [ ] Safe touch zones — no interactive elements in bottom 48px (gesture bar area)

## Asset List

1. **Botly character**: SVG/CSS animated friend (idle, listening, thinking, speaking states)
2. **Shape SVGs**: Circle, square, triangle, star — hand-drawn style, one per color variant
3. **Color swatches**: 6 labeled paint splotches
4. **House outline**: SVG wireframe showing roof/door/window placeholders
5. **Background scene**: Warm outdoor/room background
6. **Celebration effect**: Star burst or confetti CSS animation
7. **Mic button**: Large, friendly microphone icon
8. **Transition animations**: Botly "thinking" gear animation, "building" construction animation
9. **Icon set**: Back button, replay, volume, settings (speech bubble, gear)

## Files to Create

```
games/kindergarten/k3-03-ai-architect/
├── PLAN.md              ← This file
├── index.html           ← Entry point (single-page game)
├── style.css            ← All styles + CSS custom properties
├── script.js            ← Main game logic + state machine
├── conversation.js      ← STT/TTS + VAD + intent engine (passive AI)
├── intents.js           ← Intent definitions (shape+color matching)
├── settings.js          ← Rate/volume/voice/mute/mic settings
├── transcript.js        ← Conversation history storage
├── renderer.js          ← House rendering system (SVG/canvas composition)
├── botly.js             ← Botly character animations and states
└── assets/
    ├── shapes.svg       ← All shape variants
    ├── house-frame.svg  ← House outline wireframe
    └── background.svg   ← Scene background
```
