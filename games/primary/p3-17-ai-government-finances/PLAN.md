# PLAN: Compute Fee Meter — P3 Lesson 17

## Game Concept & AI Pedagogical Goal

**Concept:** Students run a "Compute Fee Meter" — a data center dashboard where corporate audit files are uploaded to an AI Document Parser. Each upload consumes server resources (RAM, system load). Students adjust billing sliders to dynamically price compute fees based on resource consumption.

**AI Pedagogical Goal:** Teach **Dynamic Resource Pricing** in cloud/AI infrastructure — the concept that AI services cost different amounts depending on how much compute they use. Students learn:
- Resource consumption varies by file size AND complexity
- Pricing must scale dynamically to cover costs
- Overcharging hurts fairness; undercharging crashes the server
- An AI billing system needs human oversight to balance profit vs. fairness

**AI Narrative Arc:** 
- The AI Document Parser doesn't know how much to charge → student teaches it via pricing sliders → AI learns to auto-scale → student monitors and adjusts → full autonomous billing achieved.

## Target Age & UX Principles

**Age:** 8 years old (P3)

**UX Principles:**
- Touch targets ≥48px (56px+ for sliders)
- Font size ≥16px body, ≥20px for labels
- High contrast (≥4.5:1 body, ≥3:1 large text)
- No emojis as structural UI icons
- Simple, direct language (reading age 7-8)
- Immediate visual feedback on every slider move
- Clear success/failure states
- Animated transitions (150-300ms) for smooth feel
- NO purple/violet themes, NO glassmorphism, NO bounce animations

## Level-by-Level Design

### Level 1: Scale for Size
**Instruction:** "A mega corporation is uploading a huge 100-page file! Slide the Page Count Multiplier up to charge them the correct amount of tokens."
- **Mechanic:** Single slider (Page Count Multiplier: 1-10)
- **Target:** Hit exact token target (e.g., 500 tokens)
- **File:** 100 pages, low RAM usage (10%)
- **Success:** BilledFee matches compute cost within ±5%
- **AI Learning:** Student teaches that bigger files cost more

### Level 2: The RAM Overload
**Instruction:** "Small but hyper-complex spreadsheet files spike the RAM bar into the red! Boost the RAM Usage Premium Fee to offset infrastructure wear-and-tear."
- **Mechanic:** Single slider (RAM Usage Premium Fee: 1-10)
- **Target:** Keep System Load below critical while collecting enough tokens
- **Files:** Multiple small files with high RAM usage (80-95%)
- **Success:** RAM stays below red zone, all files processed
- **AI Learning:** Student teaches that complexity matters, not just size

### Level 3: The System Crash Threat
**Instruction:** "A wave of heavy corporate audits hits the server simultaneously! Crank both sliders to throttle non-urgent uploads and cool the system load."
- **Mechanic:** Both sliders (Page Multiplier + RAM Premium)
- **Target:** Cool system load back to normal (<70%)
- **Files:** Wave of mixed files (some large, some RAM-heavy)
- **Success:** System load stabilizes, no crashes
- **AI Learning:** Need both knobs to manage complex workloads

### Level 4: The Balanced Budget
**Instruction:** "Keep the Corporate Fairness Rating above 75% while collecting at least 500 tokens in compute revenue. Overcharging small businesses lowers fairness!"
- **Mechanic:** Both sliders + Fairness meter
- **Target:** ≥500 tokens AND Fairness ≥75%
- **Files:** Variable upload cycle (mix of small business and corporate files)
- **Twist:** Overcharging small files (low page count/RAM) penalizes fairness
- **Success:** Both targets met
- **AI Learning:** Pricing must be fair, not just profitable

### Level 5: The Optimal Billing Matrix
**Instruction:** "Survive the 45-second high-traffic corporate tax season rush! Dynamically adjust both sliders to match exactly 100% of physical compute costs with billed tokens."
- **Mechanic:** Both sliders, real-time adjustment under time pressure
- **Target:** Zero server crashes AND ≥95% cost match
- **Files:** Rapid random uploads of varying sizes and complexity
- **Timer:** 45-second countdown
- **Success:** Survive the rush with good cost matching
- **AI Learning:** Autonomous balancing act — the AI needs constant human tuning

## Data Model & Game State

```javascript
{
  // Level config
  currentLevel: 1,
  levels: [{
    id: 1, name: "Scale for Size",
    pageTarget: 100, ramTarget: 10,
    tokenTarget: 500, fairnessTarget: null,
    duration: null,
    uploads: [{pages: 100, ram: 10, weight: 50}]
  }, ...],
  
  // Slider state
  pageMultiplier: 1,    // 1-10
  ramPremium: 1,        // 1-10
  
  // Live meters
  systemLoad: 0,        // 0-100%
  ramUsage: 0,          // 0-100%
  tokensCollected: 0,
  fairnessRating: 100,  // 0-100%
  
  // Game state
  isRunning: false,
  isComplete: false,
  score: 0,
  stars: 0
}
```

**Core Formula:**
```
BilledFee = (PageCount * PageMultiplier) + (RamUsage * RamPremium)
PhysicalCost = (PageCount * 1.5) + (RamUsage * 2)  // hidden from player
SystemLoad = SystemLoad + (FileWeight / (BilledFee + 1)) - CoolingFactor
```

**Fairness calculation (Lv4):**
- Files with pages < 20 OR ram < 15% are "small business"
- Charging small businesses >1.5x physical cost penalizes fairness
- Fairness penalty = 5% per overcharged small file

## UI Layout (tablet-first responsive)

```
┌────────────────────────────────────────┐
│  Header: "Compute Fee Meter"   ⚙️ ☰    │
├────────────────────┬───────────────────┤
│                    │                   │
│   DATA CENTER      │   RAM: ██████░░ 83%│
│   DASHBOARD        │   LOAD: ████░░ 52% │
│                    │                   │
│  ┌────┐  ┌────┐   │   ┌─────────────┐ │
│  │file│→ │ AI │   │   │ Page Count   │ │
│  │up- │→ │Doc.│   │   │ Multiplier   │ │
│  │load│→ │Par.│   │   │ ═══●══════ 5 │ │
│  └────┘  └────┘   │   │             │ │
│                    │   │ RAM Premium │ │
│  File details:     │   │ Fee         │ │
│  100 pages         │   │ ═══●══════ 3 │ │
│  RAM: 10%          │   └─────────────┘ │
│  Weight: 50        │                   │
│                    │   Tokens: ████ 340 │
│                    │   Fairness: ██ 82% │
│                    │                   │
│                    │   [▶ Next File]   │
├────────────────────┴───────────────────┤
│  Nova: "Adjust the slider to match     │
│         the compute cost!"             │
└────────────────────────────────────────┘
```

**Layout rules:**
- Grid: 2-column (dashboard left, controls right) on tablet landscape
- Single column (stacked) on portrait/mobile
- Slider handles: ≥48px diameter, with visible value tooltip
- Meter bars: animated, color-coded (green→yellow→red)
- Touch targets: minimum 48px, 8px spacing

## Conversation AI Design

**Character:** "Nova" — a helpful server monitoring AI with a simple drone avatar.

**Passive Mode:** Nova appears in a speech bubble at the bottom. Doesn't speak unless addressed. Shows listening/idle/speaking state indicator.

**Address Trigger:** Say "Nova" or "Hey Nova" or tap Nova's avatar → Nova responds.

**Intentions:**
- "help" / "what do I do": Explains current level objective
- "fairness" / "overcharging": Explains fairness rating
- "token" / "cost": Explains how billing works
- "crash" / "overload": Explains system load mechanics
- "hint": Gives a level-appropriate hint

**Transcript:** Conversation history stored in a collapsible transcript panel.

**Settings:** ⚙️ panel with: voice rate, volume, voice picker (if TTS available), mute toggle.

**Crucial: No auto-speech.** Nova never speaks unprompted. No auto-greeting, no auto-transition messages.

## Color Palette & Visual Identity

**Theme:** Clean, professional data center aesthetic — NOT playful/cartoony like K2.

| Token | Value | Usage |
|---|---|---|
| Background | `#0f172a` (slate-900) | Page bg |
| Surface | `#1e293b` (slate-800) | Cards/panels |
| Surface Hover | `#334155` (slate-700) | Hover states |
| Primary | `#38bdf8` (sky-400) | Sliders, active elements |
| Success | `#22c55e` (green-500) | RAM low, load ok |
| Warning | `#eab308` (yellow-500) | RAM medium |
| Danger | `#ef4444` (red-500) | Overload, crash |
| Text Primary | `#f8fafc` (slate-50) | Body text |
| Text Muted | `#94a3b8` (slate-400) | Labels |
| Fairness | `#a78bfa` (violet-400) | Fairness meter |
| Token Color | `#fbbf24` (amber-400) | Token counter |

**Typography:**
- Headers: System UI / sans-serif, bold, 18-24px
- Body: System UI / sans-serif, 16px
- Labels: 14px, uppercase, muted color
- Meter values: Monospace/digital, 20px

**NOT allowed:** Neon green terminal aesthetic, glassmorphism, purple gradients, gradients on buttons, bounce animations, glow effects on text.

## Technical Architecture

**Deployment:** Standalone HTML5/CSS3/JavaScript — single-page application.

**Files:**
```
index.html       — main HTML + inline styles
style.css        — all styling
game.js          — game logic, levels, state machine
main.js          — UI controller, event bindings, rendering
audio.js         — synth audio feedback (optional)
conversation.js  — Nova AI chatbot (passive)
intents.js       — intent definitions for Nova
settings.js      — settings panel (volume, voice, etc.)
transcript.js    — conversation history
```

**No external dependencies.** No frameworks. No npm. No CDN (except Google Fonts optional).

**State management:** Simple global object in game.js, immutable updates, observer pattern for UI reactivity.

**Slider handling:**
- Native HTML `<input type="range">` with custom styling
- Touch events: `pointerdown`/`pointermove`/`pointerup`
- Debounced updates (120ms) to prevent calculation spam
- Haptic feedback via AudioContext on value change

**Animation:**
- CSS transitions for meter bars (width, color)
- CSS transitions for file upload animation (slide-in)
- 200ms transition duration for all UI changes
- No requestAnimationFrame loops — event-driven updates

**Level transitions:**
- Level complete → star animation overlay → "Next Level" button
- Level fail → "Try Again" overlay with hint
- Stars: 3 for perfect, 2 for minor errors, 1 for barely passing

## Testing Criteria

**Per-level success:**
1. L1: Slide to exact token target (within 5% margin)
2. L2: Process all files without RAM exceeding 95%
3. L3: Stabilize system load below 70% after wave
4. L4: ≥500 tokens AND ≥75% fairness simultaneously
5. L5: Zero crashes + ≥95% cost match within 45 seconds

**Edge cases:**
- Slider at minimum/maximum extremes
- Rapid slider changes (mashing)
- No slider movement (idle)
- Very large files (1000 pages, 100% RAM)
- Very small files (1 page, 1% RAM)
- Empty upload wave (edge case)
- Fairness hitting 0% (all small biz overcharged)
- System load hitting 100% (crash state)
- Timer running out (L5)

**AI narrative check:**
- Student adjusts sliders → AI parser processes → feedback loop
- Each level adds a new variable, building on previous learning
- End state: student understands dynamic pricing tradeoffs

**Accessibility:**
- Touch targets ≥48px
- Color contrast ≥4.5:1
- Slider values announced on change
- Error states communicated both visually and via text
