# Recycling Vision Annotator — Game Plan

## Overview

| Field | Value |
|---|---|
| **Track** | Primary |
| **Band** | P3 (age 8) |
| **Lesson** | 01 — Intelligent Waste Sorting |
| **Source** | `source/primary/lessons/lesson-01/p3/prompt.md` |
| **Game ID** | `p3-01-waste-sorters` |
| **Entry Point** | `games/primary/p3-01-waste-sorters/index.html` |
| **Tech Stack** | Vanilla HTML/CSS/JS, Web Speech API, PWA |
| **Architecture** | Self-contained single-page game |

## Learning Objective

Students become "data labelers" who train an AI vision system to recognize recyclable items and their features. Covers: object detection (bounding boxes), landmark mapping (corners/vertices), surface texture classification (textured vs. glossy), symbol tagging (recycling symbol, barcode), and timed feature identification.

## AI Concept Arc

Each level follows the **"AI doesn't know → learns → demonstrates"** narrative:

1. **Object Detection (Bounding Boxes):** AI needs to find recyclable items among non-recyclables. Student marks them with green boxes → AI learns what to look for.
2. **Landmark Mapping (Corners):** AI needs to understand object shape. Student identifies corners/vertices → AI learns geometric landmarks.
3. **Surface Texture (Classification):** AI needs to tell textured (rough) from glossy (shiny). Student classifies each item → AI learns material properties.
4. **Symbol Tagging (Feature Detection):** AI needs to find specific symbols (♻, barcode) in noisy environments. Student picks them from a grid → AI learns feature detection.
5. **Conveyor Scan (Timed Identification):** AI works under time pressure. Student identifies features quickly in 5-second rounds → AI learns speed and accuracy.
6. **Quick ID Challenge (Graphics-Only):** AI recognizes patterns without text labels. Student identifies features by sight alone → AI learns pure visual pattern recognition.

## Level Design

### Level 1 — Object Detection
- **Style:** `bounding_box` (tap-to-annotate hotspot overlay)
- **Items:** 5 items (bottle, can, toy car, banana, apple core)
- **Target:** Tap 3 recyclable items (bottle, can, car), skip organic waste
- **Hotspots:** 60% coverage of each item, green highlight on selection
- **Validation:** Array equality — selected IDs must match correct IDs

### Level 2 — Landmark Mapping
- **Style:** `feature_select` (3-column grid of labelled cards)
- **Cards:** 10 geometric features with SVG visuals
- **Target:** Select all 3 corner/vertex features (L-corner, sharp corner, vertex)
- **Distractors:** 7 non-corner features (edge, curve, circle, cross, T-junction, surface, wave)
- **Validation:** Array equality — selected card IDs must match correct IDs

### Level 3 — Surface Texture
- **Style:** `texture` (tap-to-annotate with texture/glossy categories)
- **Items:** 6 items (sponge, paper, yarn, gem, mirror, phone)
- **Target:** Correctly classify each item as textured or glossy
- **Interaction:** Each item has 2 hotspot zones (textured left, glossy right)
- **Validation:** Selected hotspot categories must match correct classifications

### Level 4 — Symbol Tagging
- **Style:** `feature_select` (3-column grid of labelled cards)
- **Cards:** 10 symbol cards with emoji/visual representations
- **Target:** Select 2 correct symbols (♻ recycling symbol, barcode)
- **Distractors:** 8 other symbols (warning, copyright, registered, yen, @, #, %, arrow)
- **Validation:** Array equality

### Level 5 — Conveyor Scan
- **Style:** `feature_select_timed` (timed rounds with countdown)
- **Rounds:** 5 rounds, 5 seconds each
- **Target:** Tap the correct feature card before time runs out
- **Scoring:** 4/5 to pass; results displayed at end via event dispatch
- **Submit:** Hidden (scoring handled by timed round logic)

### Level 6 — Quick ID Challenge
- **Style:** `feature_select_timed` with `hideLabels: true` (graphics-only)
- **Rounds:** 6 rounds, 4 seconds each
- **Target:** Tap the correct feature by visual pattern alone — no text labels on cards
- **Cards:** 10 feature cards showing only SVG/emoji graphics (no text)
- **Scoring:** 4/6 to pass; pass threshold from level data
- **Submit:** Hidden; scoring handled by timed round event dispatch

## Technical Architecture

### File Structure
```
games/primary/p3-01-waste-sorters/
  ├── index.html          Entry point, all UI containers, script loading
  ├── style.css           Design system (288 lines: tokens, layout, components)
  ├── items.js            Item, hotspot, and feature-card data for all 5 levels
  ├── levels.js           Level metadata (title, instruction, style, explanation)
  ├── intents.js          Botly AI intent classification & response templates
  ├── annotator.js        Rendering engine: items, hotspots, feature grids, timed rounds
  ├── conversation.js     Botly AI: STT/VAD/TTS, passive-only, text fallback
  ├── game.js             State machine: INIT → LOADING → MENU → LEVEL_SELECT → ANNOTATING → SUBMITTING → RESULT → CELEBRATION
  ├── settings.js         Settings modal: rate, volume, voice, mute, mic toggle
  ├── transcript.js       Conversation history storage & drawer display
  ├── manifest.json       PWA manifest (offline-capable)
  └── sw.js               Service worker (cache-first strategy)
```

### Dependency Order
```
items.js → levels.js → intents.js → transcript.js → settings.js → annotator.js → conversation.js → game.js
```

### Data Flow
1. `game.js` initiates state machine → calls `Annotator.loadLevel(id, callbacks)`
2. `Annotator` renders items and hotspots/feature-grid/timed-rounds from data in `items.js` and `levels.js`
3. User taps/interacts → callbacks notify `game.js` of selection changes
4. Submit button (levels 1-4) or timed-round completion (level 5) triggers scoring
5. Results displayed via overlay; celebration screen when all 5 levels passed

## AI Components (Botly)

### Speech-to-Text
- Uses `webkitSpeechRecognition` / `SpeechRecognition` API
- Continuous listening with interim results
- Falls back to text input when mic unavailable or denied

### Text-to-Speech
- Uses `SpeechSynthesisUtterance` with configurable rate, volume, voice
- Respects `prefers-reduced-motion` (no speech animation)

### Passivity Rule
- Botly NEVER speaks unprompted
- Visual-only idle prompt ("💬 Tap me or say 'Botly' for a hint!")
- Responds only when child says "Botly", asks a direct question, or after a submit/wrong-answer event

### Intent Classification
| Intent | Priority | Trigger |
|---|---|---|
| help | 95 | "Botly help", "how to play" |
| hint | 90 | "Botly hint", "where is" |
| check | 85 | "Botly check", "am I right" |
| explain_level | 75 | "what is this level" |
| why | 70 | "why label" |
| recycling | 65 | "recycle", "plastic" |
| encourage | 60 | "good", "nice", "done" |
| greeting | 50 | "hi", "hello", "Botly" |
| off_topic | 0 | fallback |

## Design Decisions

### Color Palette
- Background: `#F5F0E8` (warm off-white)
- Primary: `#2D6A4F` (forest green — trust, nature, recycling)
- Accent: `#E9C46A` (amber — energy, attention)
- Neon Green: `#39FF14` (AI confirmation glow)
- Error: `#E07A5F` (salmon — clear feedback)
- Text: `#1A1A2E` (near-black for readability)
- Textured indicator: `#E8B84B` (sandy gold)
- Glossy indicator: `#4A90D9` (sky blue)

### Typography
- `Fredoka One` for headings (playful, rounded)
- `Nunito` for body (legible, friendly, good at small sizes)
- Base font: 16px (18px effective with line-height)
- Minimum: 12px (labels only), 14px body on mobile

### Touch Targets
- Hotspot zones: minimum 70×70px (exceeds recommended 48px)
- Feature cards: minimum 100×80px
- Buttons: minimum 48px height
- Level tabs: minimum 36px height

### Accessibility
- `prefers-reduced-motion`: disables all animations
- `prefers-contrast: more`: increases text contrast, adds borders
- ARIA labels on all interactive elements
- Roles: `button`, `tab`, `tablist`, `status`, `dialog`, `application`
- `aria-live="polite"` for speech bubble and toast
- `aria-pressed` for toggle states

## UX Guidelines Met
- Touch targets ≥70px (exceeds 48px minimum)
- Contrast ratio ≥4.5:1 for body text (verified with palette)
- Animation duration 150–400ms (not instant, not sluggish)
- Font size ≥16px for body text (18px effective)
- No emojis as structural UI icons (only decorative)
- Pressed/hover/disabled states visually distinct
- Safe areas respected (no content under notches)

## Testing Notes
- Debug mode (toggle via 🐛 button) shows correct hotspot outlines and IDs
- All levels pass with correct selection of exactly the right items/cards
- Wrong selections trigger visual shake + toast + optional Botly hint
- Level 5 timed rounds: pass threshold = 4/5 correct
- All 5 levels passed → celebration screen with confetti + Botly praise
- LocalStorage persists settings (rate, volume, voice, mute, mic)
- Service worker caches all assets for offline play

## Pipeline History
- **Planner:** 31 questions answered across 6 rounds
- **Builder:** 12 files, ~1,950 lines total
- **Conversation Verification:** Passivity fixed (removed auto-greet, visual-only idle prompt)
- **Tester:** 25/25 tests passed
- **Breaker:** 42 stress tests — 1 critical fix (missing `Conversation.init()` call)
- **Rebuilds:** Redesigned levels 2, 4, 5 from tap-on-object to feature-selection grids
