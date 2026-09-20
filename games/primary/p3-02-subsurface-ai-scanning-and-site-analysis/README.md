# Subsurface Signal Decoder — P3 Lesson 2 (v2)

**Programme:** AI City Architect
**Age:** P3 (Age 8)
**AI Concepts:** Supervised learning, threshold tradeoff (precision/recall), noise robustness, sensor fusion, human-in-the-loop

## v2 — AI Teaching Arc

v2 replaces the original "spot the spike by eye" game with a genuine AI-teaching arc. The student trains, tunes, and fuses a transparent in-browser AI model (Nova) through 5 levels:

| Lv | Name | AI Concept | What the Kid Does |
|---|---|---|---|
| 1 | Teach Nova | Supervised learning | Labels 4–6 signal samples → Nova learns a threshold T → Nova misclassifies 1–2 cells → Kid adds corrective labels → T updates → all correct |
| 2 | Tune the Sensitivity | Precision/recall tradeoff | Sensitivity stepper shifts effectiveThreshold → Hazards-Caught + False-Alarms meters update → False alarms cost tokens → Noise floor rises → Re-tune |
| 3 | See Through the Noise | Anomaly detection under noise | Hard SNR, hazards barely above wavy baseline → Trust threshold over eyes → Retrain on noisy examples |
| 4 | Fuse the Sensors | Sensor fusion | 3 sensor channels (Seismic/GPR/EM) → ≥2 agreement confirms hazard → Stealthy hazards invisible to one sensor → Agreement indicator (2/3 dots) |
| 5 | Nova Surveys Alone | HITL + generalization | 8×8 site → Nova auto-classifies with confidence % → Only uncertain (40–70%) cells routed to kid → Approve/Correct → Missed hazard = building collapse |

## The Transparent "AI Model"

Nova's AI is NOT a black box. The kid can SEE:
- **Training dots** (green = safe, orange = hazard) on the chart
- **Threshold line T** drawn horizontally — and it MOVES when the kid labels more or changes sensitivity
- **Confidence bars** per cell showing how sure Nova is
- **Sensor strips + vote ticks** per sensor with agreement count (2/3 or 3/3)

Everything is implemented in `classifier.js` (pure functions, ~100 lines) and `sensors.js` (signal generators). No neural networks, no hidden magic.

## How to Play

1. Open `index.html` in a tablet or desktop browser
2. Tap **Start Survey** to begin
3. Follow the per-level instructions in the objective box

### Level 1 — Teach Nova
- Glowing cyan cells are training samples
- Tap a cell, then tap **Safe** or **Hazard** to label it
- After 4 labels, Nova draws a threshold line and classifies all cells
- Cells with ✗ are wrong — tap them to add corrective labels
- When all cells are correct, tap **Confirm Teaching**

### Level 2 — Tune the Sensitivity
- Use **−/+** buttons to adjust sensitivity (1–9)
- Watch the **Hazards Caught** and **False Alarms** meters
- Tap cells and **Confirm Hazard** to mark them
- False alarms cost tokens — find the best balance!
- In sub-round 2, the noise floor rises — re-tune!

### Level 3 — See Through the Noise
- Heavy noise makes visual spotting impossible
- Trust Nova's trained threshold
- Tap cells and confirm hazards
- Retrain on noisy examples by tapping cells

### Level 4 — Fuse the Sensors
- Toggle between **Seismic**, **GPR**, and **EM** sensors
- Each cell shows 3 sensor readings with vote ticks (✓/✗)
- Agreement indicator shows 2/3 or 3/3
- Only confirm hazards when ≥2 sensors agree!

### Level 5 — Nova Surveys Alone
- Nova auto-classifies every cell with confidence %
- Green = auto-safe (Nova is confident)
- Orange = auto-hazard (Nova is confident)
- Yellow pulsing = **Uncertain** — needs YOUR review!
- Tap uncertain cells → **Approve** or **Correct**
- A missed hazard triggers a building collapse!

## Nova — Your AI Survey Drone

Nova is the conversational AI character. She is **always listening** but **never interrupts** — she only speaks when you call her name or ask a direct question.

- **Ask for a hint:** Say "Nova, hint!" or type it
- **Ask about AI concepts:** "Nova, what is a threshold?" / "Nova, what is sensor fusion?"
- **Get help:** "Nova, help!" or "Nova, what do I do?"

Nova's state is shown by the colored dot on her avatar:
- 🟢 Green pulsing = Listening
- 🟠 Orange = Thinking
- 🔵 Blue = Speaking
- ⚫ Grey = Idle/Off

Tap Nova's avatar to open a text input (useful when microphone is unavailable).

## Controls
- **Grid cells:** Tap to select/interact (context depends on level)
- **Level 1:** Label buttons (Safe/Hazard), Confirm Teaching
- **Level 2:** Sensitivity stepper (−/+), Confirm Hazard
- **Level 3:** Confirm Hazard, retrain via cell tap
- **Level 4:** Sensor toggle buttons, Confirm Hazard
- **Level 5:** Approve/Correct buttons for uncertain cells
- **Reset Level:** Try the current level again
- **☰ Menu:** Jump to any level (all unlocked)
- **⚙️ Settings:** Adjust Nova's voice speed, volume, mute, and mic toggle
- **📝 Transcript:** View your conversation history with Nova
- **🔧 Debug:** Auto-trains the level for rapid testing (shows hazards + completes level)

## Settings Panel (⚙️)
- **Speech Speed:** 0.5× – 2.0× (default 0.9×)
- **Volume:** 0 – 100% (default 90%)
- **Voice:** Select from system speech synthesis voices
- **Mute Nova:** Toggle all Nova speech on/off
- **Microphone:** Enable/disable speech recognition

Settings persist in localStorage across sessions.

## Technical Stack
- **Vanilla HTML5 + CSS3 + JavaScript** — no framework, zero dependencies
- **HTML5 Canvas** for signal chart + threshold line + sensor strips
- **Web Speech API** for speech recognition (STT) and synthesis (TTS)
- **Web Audio API** for sound effects
- **Responsive** — designed for tablet landscape (1024×768), works on desktop
- **Offline** — fully self-contained once loaded (fonts from Google Fonts CDN gracefully degrade)

## File Structure
```
index.html       — Entry point (intro, game, completion screens + all v2 UI)
style.css        — Design system + all styles (oscilloscope dark theme)
main.js          — App state machine + event binding (v2 rewritten)
game.js          — Core logic + 5 new AI-teaching levels (v2 rewritten)
classifier.js    — Transparent AI model: learnThreshold, classify, confidence, sensitivityThreshold, fuseVotes
sensors.js       — 3-channel sensor signal generators with stealthy hazard rules
chart.js         — Canvas renderer: threshold line, cluster dots, confidence bars, sensor strips
audio.js         — Sound effects + collapse/token/training-label SFX
conversation.js  — Nova conversational AI (STT + TTS + state machine) — PASSIVE, unchanged from v1
intents.js       — Nova intent definitions + vocab explainers (v2 extended)
settings.js      — Structured settings module with localStorage (unchanged)
transcript.js    — Conversation history storage + drawer display (unchanged)
test/            — Unit tests for classifier, sensors, and game logic
PLAN.md          — Game design document (v2)
README.md        — This file
```

## Passivity Design
Nova (the AI) follows strict passivity rules:
- NEVER auto-speaks on load, level change, or idle timeout
- ONLY responds when child says "Nova", "AI", "drone", or asks a direct question
- Unaddressed speech is heard but ignored
- Visual-only idle prompts appear after 15s (never spoken aloud)
- Game feedback uses sound effects + visual text exclusively
- The only `speechSynthesis.speak()` call originates from `conversation.js` `speakResponse()`
- All user/dynamic content uses `textContent` — no `innerHTML` injection

## Running Tests
```bash
node test/index.test.js
```
Tests cover: classifier threshold learning, classification, confidence, sensitivity shifting, sensor fusion voting, sensor signal generation, stealthy hazards, and all 5 level game flows.
