# My First AI City

**P1-P2 (Ages 6–7)** — Capstone of the AI City Architect programme.

A tactile, cheerful city-building game where young children place colorful buildings on a grid, connect them with pipes and roads, and watch their city come alive with animated citizens.

## How to Play

Open `index.html` in any modern browser (Chrome recommended for voice features). Best on a tablet in landscape orientation.

### Phase 1: Build
- Drag buildings from the left sidebar onto the green grid squares
- Tap the **Scan Ground** button to reveal hidden hazards underground
- Place at least: 3 Homes, 1 School, 1 Hospital, 1 Water Tower, 1 Power Plant
- Budget: 20 coins — spend wisely!
- Press **Connect!** when ready

### Phase 2: Connect
- **Water** 💧: Tap the Water Tower, then tap each building
- **Power** ⚡: Tap the Power Plant, then tap each building
- **Roads** 🛣️: Tap a Home, then tap School/Hospital to build roads
- Complete a bonus Recycling sorting game
- Press **Start City!** when everything is connected

### Phase 3: Watch
- Watch citizens appear around the city
- A bus loops along the roads
- Water and power flow through your connections
- **Rainstorm!** ⛈️ — tap puddles to drain them quickly

## Controls

| Action | How |
|--------|-----|
| Place building | Tap building in palette, then tap grid tile |
| Remove building | Tap building on grid → tap Remove |
| Scan underground | Tap Scan Ground button, then tap tiles |
| Connect utilities | Tap source, then tap target buildings |
| Speak to Nova | Tap Nova avatar or type in the input |
| Speed (Watch) | Slow / Normal / Fast buttons |

## File Structure

```
index.html       — Entry point
style.css        — All styles
game.js          — Core game logic
main.js          — UI controller
audio.js         — Sound effects
conversation.js  — Nova Jr. AI companion (passive, address-triggered)
intents.js       — Nova Jr. intent definitions
settings.js      — Settings panel
transcript.js    — Conversation history
test/index.test.js — Unit tests
PLAN.md          — Game plan
README.md        — This file
```

## Tech Stack

- Pure HTML5/CSS3/JavaScript — no framework, no build step
- Web Speech API — voice recognition + text-to-speech
- Web Audio API — sound effects (OscillatorNode)
- localStorage — session persistence and settings

## Nova Jr. AI Companion

Nova is always listening but never initiates speech — she only responds when addressed by name or when her avatar is tapped. She offers friendly guidance about building placement, connecting utilities, and recycling.

## Design

Bright, friendly theme with large touch targets (60px+). Light sky-blue background with colorful building icons. Perfect for young children on tablets.
