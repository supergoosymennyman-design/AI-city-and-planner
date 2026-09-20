# AI Architect — K3-03

A tablet-first educational game for Kindergarten K3 (age 4-5) that teaches
children about AI by teaching an AI character (Botly) about shapes and colors,
then using those concepts to design and build a house.

## How to Play

1. Open `index.html` in a tablet or desktop browser (Chrome recommended for voice support)
2. Tap **"Let's Start!"** to begin
3. **Part A — Teach Shapes & Colors**: Tap each shape and color to teach Botly,
   then take a quiz where you identify shapes and colors
4. **Part B — Practice Describing**: Choose a shape and color for each house part
   (roof, door, windows). Speak or tap your choices!
5. **Part C — AI Builds the House**: Watch Botly assemble your house, then celebrate!

## Voice Interaction

- **Speak to Botly**: Say shape names (circle, square, triangle, star) and
  color names (red, blue, yellow, green, orange, purple)
- **Tap as fallback**: If voice isn't available, tap the shapes and colors directly
- Botly speaks back at a slow rate (0.7) perfect for K3 understanding
- All speech is also shown as text in Botly's speech bubble

## Tech Stack

- **Pure HTML + CSS + JavaScript** — no frameworks, no build tools
- **Web Speech API** — SpeechRecognition (STT) + speechSynthesis (TTS)
- **Web Audio API** — VAD (voice activity detection) + sound effects
- **SVG rendering** — Hand-drawn style house composed programmatically
- **localStorage** — Settings persistence

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point — open this to play |
| `style.css` | All styles + design tokens |
| `script.js` | Main game logic + state machine |
| `botly.js` | Botly character SVG + animations |
| `renderer.js` | House SVG rendering system |
| `intents.js` | Shape/color intent matching |
| `transcript.js` | Conversation history storage |
| `settings.js` | Settings panel (rate, volume, voice, mute, mic) |
| `conversation.js` | STT/TTS/VAD pipeline (passive AI) |

## Design

- **Age group**: K3 (4-5 years old)
- **Touch targets**: ≥64px minimum
- **Font**: Baloo 2 (display) + Nunito (body)
- **Palette**: Warm cream (#FFF8F0), soft teal (#5BA4A4), coral (#FF8A80),
  mint green Botly (#B8F2E6)
- **No CDN at runtime** — Google Fonts loaded via preconnect but game works
  with system fonts if offline

## AI Narrative Arc

1. **AI doesn't know** → Botly doesn't know shapes/colors
2. **Child teaches** → Child shows shapes/colors, quizzes Botly
3. **AI demonstrates** → Botly builds the house from what it learned

## Run

Open `index.html` in any modern browser. No server required.
