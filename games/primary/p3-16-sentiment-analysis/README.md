# Civic Feedback Router — P3 Sentiment Analysis Game

**Route citizen email complaints to the right city department using AI sentiment scores and keyword matching.**

## What it is

A drag-and-drop conveyor belt game for 8-year-olds (P3). Students act as **AI router operators** for a city. Citizen emails appear on a moving conveyor belt with AI-computed sentiment scores and keyword tags. The student must drag each email to the correct department chute: Parks & Recreation (green), Transit Authority (blue), or Waste Management (orange).

## How to Run

1. Open `index.html` in any modern browser (Chrome recommended for SpeechRecognition API).
2. Works on tablets (landscape, 1024x768+) and desktop.
3. No build step, no CDN, no server required.

```bash
open index.html
```

## How to Play

### 5 Levels of Increasing Difficulty

| Level | Name | What you learn |
|-------|------|---------------|
| 1 | Find the Department | Match keywords to departments (3 emails) |
| 2 | The Negative Priority | Negative sentiment = urgent — route angry emails first (3 pairs) |
| 3 | The Multi-Chute Rush | Speed and volume — 8 emails on a moving belt |
| 4 | The Tricky Filter | Mixed-topic emails — use sentiment to find the primary issue |
| 5 | The Chaos Shift | Crisis mode — 12 high-urgency emails under pressure |

### Game Mechanics

- **Drag-and-drop:** Touch/click an email card, drag it over the matching chute, release to drop.
- **Conveyor belt:** Emails slide from right to left. If they reach the left edge unsorted, they overflow (counted as error).
- **Sentiment scores:** Each card shows a score from -5 (angry) to +5 (happy). Negative scores mean more urgency.
- **Urgency:** Cards with `PriorityWeight > 7` pulse red and should be routed first.
- **Mixed topics (Level 4):** Some emails mention two departments. The sentiment score reveals the primary complaint.
- **Debug mode:** Press 🔧 to pause the belt and examine keyword extraction.

### Nova — Your AI Assistant

Nova is always listening but **never speaks unprompted**. Say "Nova" or "Nova" or ask a question to get help. Nova can:
- Explain how to play ("Nova, help!")
- Give hints on routing ("Nova, where does this go?")
- Explain what sentiment scores mean
- Answer off-topic questions with a gentle nudge back to the game

### Settings

Click ⚙️ in the top bar to adjust:
- Speech speed (0.5x–2.0x)
- Volume (0–100%)
- Voice choice
- Mute toggle
- Microphone toggle
Settings persist in localStorage.

### Transcript

Click 📝 to view conversation history between you and Nova.

## Tech Stack

- **Vanilla HTML5 + CSS3 + JavaScript** — no frameworks, no build step
- **Web Speech API** — SpeechRecognition for voice input, SpeechSynthesis for TTS
- **Web Audio API** — Sound effects (correct/wrong chimes, celebration fanfare)
- **pointer events** — Unified touch + mouse drag-and-drop
- **CSS custom properties** — Three-layer design token architecture
- **requestAnimationFrame** — Conveyor belt animation loop

## Files

```
├── index.html          Entry point — open this to play
├── style.css           Design system + all styles + animations
├── data.js             Email cards, departments, level configs, text strings
├── game.js             Core game state machine (INIT→LOADING→MENU→...→CELEBRATION)
├── drag.js             Drag-and-drop engine (pointer events)
├── belt.js             Conveyor belt animation + card spawning
├── conversation.js     Nova: passive STT/VAD/TTS, voice + text fallback
├── intents.js          Intent classification + response templates
├── settings.js         Settings modal (speech rate, volume, voice, mute, mic)
├── transcript.js       Conversation history drawer
├── main.js             App initialization
├── test/
│   └── index.test.js   Core logic tests (34 tests, all passing)
└── README.md           This file
```

## Design

- **Dark dashboard theme** — Navy/dark grey background (#1a1a2e) inspired by city control centers
- **Department colors:** Parks=Green (#4CAF50), Transit=Blue (#2196F3), Waste=Orange (#FF9800)
- **Typography:** Fredoka One (headings) + Nunito (body)
- **Responsive:** Tablet-first landscape (1024×768+), `clamp()` and `vmin` for fluid scaling
- **Touch targets:** Minimum 48px for all interactive elements
- **Accessibility:** aria-labels, role attributes, reduced-motion support, two-channel redundancy

## AI Concepts Taught

After playing, students understand:
1. **AI reads emotion in text** — Sentiment scores come from analyzing word choices
2. **AI combines multiple signals** — Topic (keywords) + emotion (sentiment) together make better decisions
3. **Not all problems are equally urgent** — AI can prioritize based on emotion intensity
4. **AI needs human help** — Mixed-topic emails show where AI needs human judgment

## Model

No on-device ML model is required for this game. All sentiment scores and topic tags are pre-computed in `data.js`. Keyword matching uses simple word-boundary regex. Voice interaction uses the browser's built-in Web Speech API.
