# Add a Smile — K2 Lesson 9

A tablet-friendly drawing game where children (ages 4–5) teach an AI about emotions by drawing faces, then use voice commands to make a robot friend express those feelings.

**Part of the AI-Education curriculum for Kindergarten, Phase 1 (2D inputs).**

---

## How to Play

### Part A — Draw & Generalize
1. Tap **"Let's Go!"** to start.
2. Draw a **happy face** on the canvas using the crayon colors (red, blue, green, black).
3. Tap **"Done!"** — the AI looks at your drawing and names the emotion.
4. Draw 3 happy faces, then 3 sad, then 3 angry.
5. The AI learns to **generalize**: "Even when smiles look different, they all mean happy!"

### Part B — Make Robot Happy
1. A robot appears with no face.
2. Say **"Make robot happy!"** into the microphone (or tap the **Happy** button).
3. The AI draws a happy face on the robot and it celebrates!

### Part C — Kids Design Robot Faces
1. Say **"Make robot sad"** or **"Make robot angry"** (or tap the buttons).
2. The robot's face changes instantly.
3. After 3 commands, celebrate!

---

## Technical Stack

| Component | Technology |
|-----------|-----------|
| **Rendering** | Canvas API (drawing + robot face) |
| **Voice Out** | Web Speech API (SpeechSynthesis) — TTS |
| **Voice In** | Web Speech API (SpeechRecognition) — STT |
| **Styling** | Vanilla CSS with custom properties |
| **Font** | Nunito (Google Fonts) |
| **Architecture** | Single-page, self-contained HTML |

No frameworks, no build tools, no external dependencies (except Google Fonts).

---

## How to Run

### Option 1: Open directly
Open `index.html` in any modern browser (Chrome recommended for full speech support).

### Option 2: Local server
```bash
python3 -m http.server 8080 --directory games/kindergarten/k2-09-add-a-smile
# Open http://localhost:8080
```

### Browser Requirements
- **Chrome** (best STT/TTS support)
- **Safari** (TTS works, STT requires iOS 16+)
- **Firefox** (TTS only, no STT — tap buttons work as fallback)

---

## Tests

```bash
node test/index.test.js
```

Tests cover: emotion detection (mouth curvature analysis), keyword matching, progress tracking, and stroke analysis. 31 tests total.

---

## Design

- **Colors:** Warm cream (#FFF8F0) background, flat bold accents (blue #4A90D9, green #5CB85C, coral #FF8C66)
- **Typography:** Nunito (Google Fonts), 22px+ body, 28px+ headings
- **Touch targets:** Minimum 56px, primary buttons 72px+
- **Accessibility:** ARIA labels, reduced-motion support, dual-channel output (text + voice)
- **State machine:** 12-state flow with safety timeouts for speech synthesis
- **Robot:** Canvas-drawn with 3 emotion-specific face configurations (eyes, mouth, eyebrows, cheeks)
