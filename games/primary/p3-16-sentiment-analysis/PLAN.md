# Game Plan: p3-16-sentiment-analysis — Civic Feedback Router

## Lesson Info
- **Track:** Primary
- **Band:** P3 (Age 8)
- **Lesson:** 16 — Sentiment Analysis
- **Source:** `source/primary/lessons/lesson-16/p3/prompt.md`
- **Objective:** Students categorize citizen sentiments; learn NLP and sentiment classification.
- **Tools needed:** nlp, sentiment-classification
- **Game ID:** `p3-16-sentiment-analysis`
- **Entry Point:** `games/primary/p3-16-sentiment-analysis/index.html`

## AI Narrative

> **The city's AI system (CivicBot) receives hundreds of citizen emails. It uses sentiment analysis (scoring emotion from -5 to +5) and keyword-based topic classification to route each complaint to the right department. The student learns that AI combines TWO techniques — reading the *emotion* (sentiment score) and finding the *topic* (keyword matching) — to make routing decisions.**

**Core AI concept:** NLP sentiment classification + intent detection. The AI system computes a numerical sentiment score and a topic tag for each message. The student must trust but verify the AI's analysis — and gets faster at it as the game progresses.

**Learning arc:** Level 1 (single email, learn the mechanic) → Level 2 (priority from sentiment) → Level 3 (speed + volume) → Level 4 (disambiguating mixed topics) → Level 5 (crisis handling under pressure).

## Target Age
- **Age:** 8 years old (P3)
- **Reading level:** 1-2 short sentences per instruction. Simple vocabulary: "happy", "angry", "negative", "positive", "urgent"
- **Touch targets:** minimum 48px, preferably 56px+ for email cards and chutes
- **Layout:** Tablet landscape (1024×768 minimum), no scrolling
- **Font:** minimum 16px body, 20px+ for labels and scores
- **Two-channel:** All instructions visible as text AND spoken by CivicBot when addressed

## Core AI Narrative

This game reframes the lesson as **teaching an AI how to sort and prioritize**. Every email the student correctly routes becomes **training data** for CivicBot. The AI learns:
1. **Where** messages go (keyword → department mapping)
2. **Which** ones to prioritize (sentiment score → urgency)

After completing all 5 lessons, Level 6 ("CivicBot Takes Over") demonstrates the AI sorting 15 emails at superhuman speed — showing what it learned from the student.

## Game Flow — 5 Lessons + AI Demo

### Lesson 1: Find the Department
- **Concept:** Teach CivicBot which keywords match which department
- **Play:** A single email card appears on the conveyor belt with sentiment score and topic tag. Drag it to the matching department chute.
- **Keywords mapped:**
  - Parks & Rec: "park", "playground", "garden", "tree", "flower", "bench", "fountain"
  - Transit Authority: "bus", "train", "stop", "route", "traffic", "road", "sidewalk"
  - Waste Management: "trash", "bin", "garbage", "recycle", "dump", "litter", "overflow"
- **Scoring:** Sentiment-weighted. Negative emails worth more (angry citizens = urgent).
  - p2 (+4, happy): 9 pts | t1 (-4, angry): 21 pts | w3 (-4, angry): 21 pts
  - **Max score:** 51 | **Min score to pass:** 35

### Lesson 2: The Negative Priority
- **Concept:** Teach CivicBot that angry emails must go FIRST
- **Play:** Two emails appear simultaneously. One has a negative score (angry citizen), the other positive (happy citizen). Route the negative one first.
- **Priority logic:** `PriorityWeight = abs(SentimentScore) * UrgencyMultiplier`. High-priority cards pulse red.
- **Scoring:** 3 pairs. Negative emails worth 4x more than positive.
  - **Max score:** 83 | **Min score to pass:** 60

### Lesson 3: The Multi-Chute Rush
- **Concept:** Teach CivicBot speed. Conveyor belt fills up with emails.
- **Play:** 8 emails arrive in sequence on a moving conveyor belt. Route before overflow.
- **Scoring:** Mix of negative and positive.
  - **Max score:** 140 | **Min score to pass:** 95

### Lesson 4: The Tricky Filter
- **Concept:** Teach CivicBot to read sentiment + keywords together to disambiguate
- **Play:** Mixed-topic emails. Sentiment score reveals the primary issue.
- **Scoring:** Mixed topics, varied sentiments.
  - **Max score:** 119 | **Min score to pass:** 80

### Lesson 5: The Chaos Shift
- **Concept:** Crisis mode — final exam for CivicBot
- **Play:** 12 urgent negative emails flood in. Route them all under pressure.
- **Scoring:** All negative. Each correct route earns maximum points.
  - **Max score:** 260 | **Min score to pass:** 210

### Level 6: CivicBot Takes Over (AI Demonstration)
- **Concept:** Watch the AI demonstrate everything it learned
- **Play:** NO interaction needed. AI auto-sorts 15 emails at superhuman speed (400ms per email)
- **Display:** Split comparison — Student's Level 5 score vs AI's perfect 100% score
- **Narrative:** "You taught me well. Now I can sort faster than any human!"

## Scoring System
Sentiment-weighted scoring replaces count-based thresholds:

```
routeScore = sentimentScore <= 0
  ? abs(sentimentScore) * 4 + 5   // negative: urgent, high weight
  : abs(sentimentScore) * 1 + 5   // positive: routine, low weight
```

**Score examples:**
- -5 (very angry) → **25 pts** — most urgent to get right
- -4 (angry) → **21 pts**
- -3 (annoyed) → **17 pts**
- 0 (neutral) → **5 pts**
- +3 (happy) → **8 pts**
- +5 (very happy) → **10 pts** — least urgent

Negative emails are worth up to **4x more** than positive ones of the same magnitude. This teaches that prioritizing angry citizens is critical.

## Input Modes

### Primary: Drag-and-Drop
- **Interaction:** Touch an email card, drag it over the correct department chute, release to drop
- **Visual feedback:** Card follows finger. Chute highlights when card is hovered over it. Correct drop = green flash + success sound. Wrong drop = red shake + error sound + card returns to belt.
- **Touch implementation:** `pointerdown` / `pointermove` / `pointerup` events. `element.getBoundingClientRect()` for coordinate scaling.

### Fallback: Tap-to-Select
- If drag-and-drop is unavailable or student struggles: tap an email card to select it, then tap the target chute to route it.
- Each card has a tap-to-select highlight state.

### Voice (Conversation AI): Always Available
- CivicBot character is always visible and listening (passive mode).
- Student can ask "CivicBot, where does this go?" or "Nova, what does this score mean?" for hints.
- CivicBot NEVER speaks unprompted.

## Content & Data

### Departments & Keywords
| Department | Keywords | Color |
|---|---|---|
| Parks & Recreation | park, playground, garden, tree, flower, bench, fountain, grass, picnic, pond | `#4CAF50` (Green) |
| Transit Authority | bus, train, stop, route, traffic, road, sidewalk, crossing, signal, lane | `#2196F3` (Blue) |
| Waste Management | trash, bin, garbage, recycle, dump, litter, overflow, pickup, waste, disposal | `#FF9800` (Orange) |

### Sentiment Scoring
- **Range:** -5 (very angry) to +5 (very happy)
- **Urgency threshold:** Score <= -3 = urgent (red pulsing card border)
- **PriorityWeight:** `abs(SentimentScore) * UrgencyMultiplier`
  - UrgencyMultiplier = 2 if score <= -3, else 1
  - PriorityWeight > 7 = red flash + faster belt
- **Example scores:**
  - "The bus was late AGAIN!" → -4 (angry), keyword "bus" → Transit Authority
  - "Lovely day at the park!" → +3 (happy), keyword "park" → Parks & Rec
  - "Trash hasn't been picked up in weeks!" → -5 (very angry), keyword "trash" → Waste Management
  - "The fountain in the park is broken" → -2 (mildly annoyed), keywords "fountain"+"park" → Parks & Rec

### Email Card Data Structure
```js
{
  id: 1,
  text: "The bus was late AGAIN!",
  sentimentScore: -4,
  topicTag: "transit",
  correctDepartment: "transit",
  keywords: ["bus", "late"],
  priorityWeight: 8,
  isUrgent: true,
  isMixed: false
}
```

### Progression
| Level | Emails | New Mechanic | Pass Threshold |
|---|---|---|---|
| 1 | 3 | Basic one-email routing | 3/3 |
| 2 | 6 (3 pairs) | Priority ordering (negative first) | All pairs correct |
| 3 | 8 | Conveyor belt + time pressure | 6/8 |
| 4 | 7 | Mixed-topic disambiguation | 5/7 |
| 5 | 12 | Crisis speed + high urgency | 11/12 |

## Technical Approach

### Stack
- **Vanilla HTML5 + CSS3 + JavaScript** — no frameworks, no build step
- **Self-contained** — no CDN at runtime, all code in the game folder
- **Offline-capable** — all assets local, optional service worker

### File Structure
```
games/primary/p3-16-sentiment-analysis/
├── index.html           # Entry point, UI containers, script loading
├── style.css            # Design system + layout + animations
├── main.js              # Init, state machine, game loop
├── data.js              # Email card data, department definitions, level configs
├── game.js              # Core game logic: belt, chutes, scoring, levels
├── drag.js              # Drag-and-drop engine (touch + mouse)
├── belt.js              # Conveyor belt animation and timing
├── conversation.js      # CivicBot: STT/VAD/TTS, passive-only, text fallback
├── intents.js           # Intent classification and response templates
├── settings.js          # Settings modal: rate, volume, voice, mute, mic
├── transcript.js        # Conversation history drawer
├── test/
│   └── index.test.js    # Core logic tests
├── README.md            # How to run and play
└── PLAN.md              # This file
```

### Dependency Order
```
data.js → intents.js → transcript.js → settings.js → drag.js → belt.js → game.js → conversation.js → main.js
```

### State Machine
```
INIT → LOADING → MENU → LEVEL_SELECT → LEVEL_INTRO → PLAYING → LEVEL_RESULT → (next level or) CELEBRATION
```

**States:**
- `INIT` — load assets, initialize modules
- `LOADING` — show loading screen (model download progress if applicable)
- `MENU` — title screen with Play button
- `LEVEL_SELECT` — choose level (all unlocked)
- `LEVEL_INTRO` — show level objective + instructions
- `PLAYING` — active gameplay: emails on conveyor belt, drag to chutes
- `LEVEL_RESULT` — show score (X/Y correct), pass/fail
- `CELEBRATION` — all 5 levels complete, final celebration screen

### Conveyor Belt Implementation
- **CSS animation:** emails slide from right to left in a belt lane
- **JavaScript timing:** belt speed controlled by level config, adjusted by PriorityWeight
- **Card generation:** emails appear at intervals, pulled from a level-specific pool
- **Belt overflow:** if an email reaches the left edge without being sorted, it's lost (counted as error)

### Drag-and-Drop Engine
- `pointerdown` on email card → start drag
- `pointermove` → update card position (follow finger)
- Hit-test against chute target zones
- `pointerup` → check if over valid chute → score or return
- Snap-back animation on wrong drop

### AI Sentiment Model (Simulated)
- The AI sentiment score is pre-computed in the email data (not called from an external API)
- Each email has hardcoded score, keywords, and correct department
- The "AI" is transparent — scores and topic tags are shown on each card
- Level 4 adds the concept: the AI's score reveals the *primary* topic when keywords are mixed

### Key Libraries
- None (vanilla JS). Web Speech API for STT/TTS.

## Conversation Design

### AI Character: CivicBot
- **Name:** CivicBot (or Nova — consistent with other P3 games)
- **Appearance:** Friendly robot avatar (SVG), displayed in bottom-right corner
- **Trigger phrases:** "CivicBot", "Nova", "AI", "hey robot", direct questions
- **Passivity:** ALWAYS listening, NEVER speaks unprompted. No auto-greet, no auto-nudge, no auto-celebrate.

### Intents
| Intent | Trigger | Response |
|---|---|---|
| `help` | "CivicBot help", "how to play" | "Route each email to the right department! Read the sentiment score and keywords on each card, then drag it to the matching chute." |
| `hint` | "CivicBot hint", "where does this go" | "Look at the keywords in the email. 'Bus' goes to Transit, 'trash' goes to Waste, 'park' goes to Parks!" |
| `what_is_sentiment` | "what is sentiment", "what does the score mean" | "Sentiment is how someone feels. A -5 score means very angry, +5 means very happy. Angry emails need faster routing!" |
| `what_is_keyword` | "what is a keyword", "what are keywords" | "Keywords are important words that tell us the topic. 'Bus' means Transit, 'trash' means Waste, 'park' means Parks!" |
| `explain_level` | "what is this level", "what do I do" | Read the level objective aloud. |
| `off_topic` | Fallback for unrecognized addressed speech | 1-sentence natural answer + 1-sentence lesson nudge. "The earth is round like a ball! Speaking of shapes in our city, can you route that email to the right department?" |
| `unaddressed` | Speech without trigger phrase | No response. AI stays silent. |

### Off-Topic Response Pattern
When CivicBot is addressed with an off-topic question:
1. 1-sentence natural answer
2. 1-sentence gentle lesson nudge back to the game
3. Total under 25 words

Example: "Dogs are wonderful pets! Now, can you help me sort this email about the trash bins?"

## AI State Indicator
A small visual element near CivicBot showing current state:

- **Listening (VAD active):** Green pulsing dot — "I'm listening"
- **Thinking (classifying intent):** Yellow animated dots — "Thinking..."
- **Speaking (TTS active):** Blue wave/bars animation
- **Idle/Off:** Grey dim dot — mic toggled off

## Settings Panel
A ⚙️ icon in the top-right corner opens a settings modal:

- **Speech Rate:** slider 0.5–2.0, default 0.85
- **Volume:** slider 0–100%, default 90%
- **Voice selector:** dropdown from `speechSynthesis.getVoices()`
- **Mute toggle:** checkbox/switch
- **Mic toggle:** always hot by default, can turn off
- **Settings persist:** localStorage

## Model Loading Indicator
If SmolLM or other on-device model is loaded:
- Bottom-right corner widget: "AI is waking up... XX%" with progress bar
- Always visible while model downloads
- Disappears when model is ready
- Does NOT block gameplay — keyword engine handles responses until model is ready

## Conversation Transcript
A 📝 icon in the top bar opens a toggle-able side drawer:

- Child → CivicBot message pairs
- Scrollable list, newest at bottom
- Cleared on game reset
- Helps teacher review the session

## Edge Cases & Error Handling

### Wrong Answer
- Card dropped in wrong chute → red shake animation + error sound + card returns to belt
- CivicBot (if addressed) can explain: "That email was about a bus — it goes to Transit Authority!"
- 3 wrong attempts on a single level → CivicBot reveals the correct answer (teaching moment)

### Device API Failures
- **Mic denied:** Show text input field as fallback. CivicBot responds to typed questions.
- **SpeechSynthesis unavailable:** Text-only mode (speech bubble always visible).
- **Touch events unsupported:** Mouse input works identically (pointer events unified).
- **Web Audio unavailable:** Silent fail — game works without sound.

### Rapid Input / Mashing
- Debounce on drag operations: ignore rapid pointer events after a drop for 300ms
- Cards cannot be picked up again during snap-back animation (200ms)
- Chute targets ignore drops during score animation (500ms)

### Skip / Refuse / Timeout
- After 15 seconds of inactivity on a level, an optional hint pulse animates on the correct chute (gentle nudge)
- No forced timeouts — the child can take as long as needed
- Level select is always accessible — can switch levels at any time

### Page Refresh Recovery
- Settings persist in localStorage
- Game progress resets on refresh (no partial state — levels are short enough)

### Two-Channel Accessibility
- Every instruction is visible as on-screen text AND available via CivicBot
- Score and feedback are shown visually AND via status text (aria-live)
- Conveyor belt has visual indicators for card position (not just movement)

## Polish

### Visual Style
- **Theme:** City dashboard / control center aesthetic
- **Background:** Dark blue-grey (`#1a1a2e`) for dashboard feel
- **Conveyor belt:** Dark metallic grey lane with subtle animation
- **Department chutes:** Three color-coded tubes at the bottom
- **Email cards:** White/light paper-style cards with shadow, sentiment score prominently displayed
- **Color palette (from ui-ux-pro-max recommendation):**
  - `--bg-primary: #1a1a2e` (dark navy dashboard)
  - `--bg-surface: #16213e` (card surface)
  - `--bg-card: #ffffff` (email card)
  - `--color-parks: #4CAF50` (green)
  - `--color-transit: #2196F3` (blue)
  - `--color-waste: #FF9800` (orange)
  - `--color-urgent: #f44336` (red pulse)
  - `--color-positive: #66BB6A` (positive sentiment)
  - `--color-negative: #ef5350` (negative sentiment)
  - `--color-neutral: #78909C` (neutral sentiment)
  - `--text-primary: #ECEFF1` (light text on dark)
  - `--text-secondary: #90A4AE` (muted text)

### Typography
- **Display:** 'Fredoka One', cursive (headings, scores, level titles)
- **Body:** 'Nunito', sans-serif (instructions, email text, labels)
- **Email text:** 14px on card (email preview), 18px for sentiment score
- **Instructions:** 18px minimum
- **Chute labels:** 16px, bold

### Sound
- **Correct drop:** Short ascending chime
- **Wrong drop:** Low descending tone
- **Level complete:** Celebratory fanfare
- **Urgent card:** Subtle heartbeat pulse audio
- **CivicBot speech:** TTS via SpeechSynthesis API

### Character
- **CivicBot:** A friendly robot with a screen-face showing emotion (smile when correct, neutral when listening, thinking animation)
- **Avatar style:** Simple SVG, fits in bottom-right corner (~80×80px)
- **Speech bubble:** Semi-transparent bubble above CivicBot

### Animations
- **Conveyor belt:** CSS animation, emails slide left at configurable speed
- **Card drag:** Follows pointer with slight rotation (2-3 degrees)
- **Chute hover:** Chute glows when card is dragged over it
- **Correct drop:** Card shrinks into chute with green flash
- **Wrong drop:** Card shakes, returns to belt with red flash
- **Level complete:** Star rating animation (1-3 stars)
- **Celebration:** Confetti + CivicBot celebration animation

### i18n
- All text strings externalized at the top of `data.js` for easy modification
- English only for this version

## Success Criteria
After playing this game, the student should understand:
1. **AI learns from examples** — every email you sorted correctly taught CivicBot something
2. **AI can read emotion in text** — sentiment scores aren't magic, they analyze word choices
3. **AI combines multiple signals** — topic (keywords) + emotion (sentiment) together make better decisions
4. **Not all problems are equally urgent** — AI can prioritize based on emotion intensity, just like you taught it
5. **AI can become superhuman with enough training** — Level 6 shows the AI sorting faster than any human could
6. **Teaching AI is a skill** — the better you teach (more accurate, better priority), the better the AI performs

## Pipeline History
- **Planner:** 35 questions answered across 6 rounds
- **Builder:** 14 files, ~5,800 lines. Vanilla HTML/CSS/JS + conversational AI.
- **Conversation Verification:** Passivity violations fixed (auto-speak removed)
- **Tester:** PASS — 35/35 tests passed
- **Breaker:** 18 issues found, 3 critical fixed (settings modal, idle prompt, isQuestion permissiveness)
- **Rebuild:** Scoring changed from count-based to sentiment-weighted. Narrative reframed as teaching AI. Level 6 AI demonstration added.
