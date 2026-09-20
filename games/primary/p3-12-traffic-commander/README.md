# 🚦 Traffic Commander — Train Flux the AI

**Lesson:** P3 (Age 8) · Lesson 12 — *Adaptive Traffic Signal Optimization*
**Programme:** AI City Architect
**Game ID:** `p3-12-traffic-commander`

You are the **Junior Traffic Engineer** at **GridCity**. The city just installed
**Flux**, a brand-new AI traffic controller with **inductive loop sensors** buried
under every intersection — but Flux is *completely untrained*. Across five hands-on
levels you teach Flux to **sense** the road, **predict** overflow, **filter** false
signals, **prioritise** lanes, and finally **run the intersection autonomously**.
Then you sit the **Traffic Commander Exam** to earn your certificate.

---

## ▶️ How to run

**No build step. No server. No install.**

- Double-click `index.html`, or open it in any modern browser (Chrome / Edge / Safari).
- For microphone-based voice chat with Flux, serving over `http(s)` and granting
  mic permission is recommended (voice is optional — a text box always works).

Optional local server (only needed for the mic on some browsers / PWA install):

```bash
cd games/primary/p3-12-traffic-commander
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

---

## 🎮 How to play

- **All 6 levels are unlocked** from the start — use the **L1–L6 tabs** in the top bar.
- Each level shows a **banner naming its AI concept** (e.g. *"LEVEL 1: SENSOR DATA"*).
- The **Flux AI Dashboard** on the right tracks Flux's training: status badge,
  concept progress bars, and live stats (vehicles sensed, correct/false flushes, confidence).

| Level | AI Concept | What you do |
|---|---|---|
| **1 · The First Light** | Sensor Data | One vehicle sits on the loop; the bar fills. **Flush** when it turns RED (80%+). 3 vehicles: sedan → van → truck. |
| **2 · Rush Hour** | Load Prediction | 3–7 cars fill fast. Watch the dotted **prediction line** + "overflow in X s" and flush before it tops out. |
| **3 · False Alarm** | Signal Filtering | A **bike / motorcycle / pedestrian** gives a *weak signal* (bar caps low). **Don't flush** — wait for the real car. |
| **4 · Crossroads Commander** | Priority Optimization | 4 lanes fill at once. Each green cycle, flush the **highest** queue (👑) first. Survive without gridlock. |
| **5 · Auto-Pilot** | Automation | Set the **Trigger Level** slider (40–90%). Too low = wasted cycles, too high = overflow. ~70% is the sweet spot. Flux drives all 4 lanes itself. |
| **6 · Exam** | AI Literacy | 10 multiple-choice questions. **7/10 to pass** → printable certificate. |

**Three visual zones** (drawn on the canvas):
1. **Road surface** (birds-eye) — animated vehicles queue at the stop line.
2. **Underground cutaway** — glowing inductive-loop sensors buried under each lane
   (glow strength = metal mass, so a car glows bright and a bike stays dim).
3. **Queue bar graphs** — rise and colour-grade green → amber → orange → red → overflow pulse.

**Handy buttons:** `🔧` debugger fills all queues to 99% · `📝` conversation transcript · `⚙️` settings.

---

## 🤖 Flux — the passive AI companion

Flux is **always listening but never speaks unprompted**. It only replies when you
**address it** — say *"Flux…"*, ask a question, tap its avatar, or type in the box.
Unaddressed chatter is ignored (silence → silence).

- **STT:** Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), continuous.
- **TTS:** `SpeechSynthesis` with adjustable rate / volume / voice.
- **Fallback:** if the mic is blocked or unavailable, a **text input** appears automatically.
- **State indicator:** green pulse = listening · amber = thinking · blue = speaking · grey = idle.
- **Off-topic handling:** one short honest answer + one gentle nudge back to traffic (< 25 words).

### AI model decision — on-device, no download

This game uses a **template / keyword intent engine** (`intents.js`) rather than an
in-browser LLM. Reasoning:

- The lesson's dialogue needs (help, hints, concept explanations, vehicle facts,
  off-topic nudges) are a **bounded, well-defined intent set** — a keyword classifier
  handles them accurately, instantly, and deterministically.
- It keeps the game **100% offline and CDN-free** with **zero model download** — no
  WebGPU requirement, no 1 GB weights, instant start on low-end school tablets.
- WebLLM options were considered (e.g. `Qwen3-0.6B-q4f16_1-MLC`, `gemma3-1b-it`,
  `SmolLM2-360M`) per the toolbox `conversation/VoiceAppCore.js`. They were rejected
  here because they require a runtime CDN import + large download + WebGPU, which
  conflicts with the "open `index.html` directly, works offline" requirement and adds
  no pedagogical value over the deterministic intent engine for this scoped assistant.

Settings → *AI Status* reports **"Offline (template mode) — no download needed."**

---

## ♿ Accessibility & tablet-first design

- Landscape 1024×768+; touch targets ≥ 56 px; lane taps ≥ 80 px; slider handle 48 px.
- Two-channel feedback: every instruction is shown as **text** *and* spoken.
- `prefers-reduced-motion` disables sensor glow / shake / pulses.
- `prefers-contrast: more` thickens borders.
- ARIA labels on all controls, `aria-live` feedback regions, full keyboard nav (Tab + Enter).
- Settings (rate / volume / voice / mute / mic) persist in `localStorage`; so does Flux's training progress.
- **No child PII** — camera/mic stay in-memory; nothing is sent anywhere.

---

## 🗂 File structure

```
p3-12-traffic-commander/
├── index.html        Entry point + all UI containers (open this)
├── style.css         Design system (traffic/urban theme), layout, animations, a11y
├── game.js           State machine + all 6 level scripts + loop + input wiring
├── traffic.js        Traffic simulation: lanes, vehicles, fill rates, overflow
├── sensors.js        Inductive-loop helpers: bar zones, prediction, metal-mass
├── renderer.js       Canvas drawing: road surface, underground cutaway, bars, signals
├── flux.js           Flux AI: dashboard, passive STT/TTS conversation, state badge
├── intents.js        Offline intent classifier + level prompts + concept explanations
├── quiz.js           10-question exam, scoring, certificate canvas
├── audio.js          Web Audio SFX (synthesised — no asset files)
├── settings.js       Settings modal + session metrics + localStorage
├── transcript.js     Conversation history drawer
├── manifest.json     PWA manifest
├── sw.js             Service worker (offline caching; optional)
├── test/
│   └── index.test.js Headless logic tests (run: node test/index.test.js)
└── README.md
```

Modules are IIFEs stored on globals (`Traffic`, `Sensors`, `Renderer`, `Flux`,
`Intents`, `Quiz`, `SFX`, `Settings`, `Transcript`, `Game`), loaded as classic
scripts in dependency order so the game opens straight from `file://`.

---

## ✅ Tests

```bash
node test/index.test.js
```

36 assertions cover: sensor colour zones, fill/overflow physics, weak-signal caps,
highest-lane selection, **Level 1 flush-window reachability**, **Level 5 automation
sweet-spot** (70% passes with no overflow, 90% overflows, 40% wastes), quiz integrity
(10 questions, one correct each, 7-to-pass), and intent classification. All pass.

Verified in-browser (Playwright): all 6 levels playable and winnable, controls
switch correctly per level, 4-lane multi-view, Flux conversation (help / off-topic /
vehicle facts), quiz → certificate, and Flux status progression
🟡 Untrained → 🟢 Sensing → 🔵 Predicting → 🟣 Filtering → 🟠 Prioritizing → ⭐ Autonomous → 🏆 Certified.
