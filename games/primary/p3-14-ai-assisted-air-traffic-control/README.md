# Predictive Ghost Trails — AI-Assisted Air Traffic Control

**Target:** P3 (Age 8) | **Lesson:** AI Predictive Motion Modeling & Vector Trajectory Overlap  
**Track:** Primary | **ID:** p3-14-ai-assisted-air-traffic-control

## What Is It?

A standalone HTML5 air traffic control game where students start by steering commercial jets using glowing "Ghost Trails" (Levels 1-5), then progress to managing approach sequencing on Runway 27L (Levels 6-7). The later levels teach AI-assisted air traffic control: students correct AI errors in Level 6, then watch a fully autonomous AI sequence 15 arrivals in Level 7.

## How to Play

Open `index.html` in any modern browser (Chrome, Edge, Safari, Firefox). Works on tablets (touch) and desktops (mouse).

### Controls
- **Drag the arrow tip** (Levels 1-2) — adjust turn direction; Ghost Trail updates in real-time
- **Tap a plane** to select it (Levels 3-5)
- **Command buttons** (Levels 3-6) — Tap LEFT/RIGHT to turn, FASTER/SLOWER for speed
- **🔧 button** — toggles debug intersection markers

### Levels

1. **Predict the Arc** — Drag the blue plane's arrow to avoid the red plane's Ghost Trail
2. **The S-Curve** — Navigate a jet through a narrow cloud canyon without touching the walls
3. **Air Traffic Command** — Turn the blue jet on radar to clear a predicted collision before time runs out
4. **Command the Corridor** — Route two nimble jets around a heavy cargo plane's wide turning arc
5. **Waypoint Navigation** — Command two jets through waypoint diamonds on radar
6. **AI Co-Pilot** — The AI sequences arriving planes onto Runway 27L but makes occasional speed errors. **Watch for 🔴 alerts** and use ⬆FASTER/⬇SLOWER to correct. The AI learns from every correction you make!
7. **AI Controller Certification** — The AI is fully trained. Watch it sequence 15 arrivals smoothly from holding → join → approach → landing. Pure observation — separation maintained automatically.

### AI Narrative Arc
- **Levels 1-4:** Student trains AI by demonstrating safe trajectory management
- **Level 5:** Waypoint navigation practice
- **Level 6:** AI Co-Pilot attempts to sequence approaches but makes errors — student corrects them
- **Level 7:** AI Controller demonstrates flawless autonomous sequencing

## Tech Stack

- **HTML5 Canvas** — Real-time rendering (trails, radar, runway, planes)
- **Vanilla JavaScript** — Physics simulation, collision detection, state machine, smooth AI steering
- **Web Audio API** — Synthesized sound effects (no external audio files)
- **CSS3** — Responsive overlays, touch-friendly controls
- **Google Fonts** — Fredoka (display) + Nunito (body)

## Architecture

```
index.html           # Complete game (embedded <style> + <script>)
├── CSS              # Design tokens, responsive layout, animations
├── Canvas Layer     # Sky, clouds, planes, ghost trails, radar, runway, FAF, holding orbit
├── DOM Overlay      # Menu, HUD (level info, timer, AI badges), command panel, result screen
└── JS Engine
    ├── Plane class           # Position, heading, steerToward(), velocity, bank, trail
    ├── Physics               # TurningRadius = Velocity² / (G × tan(BankAngle))
    ├── Collision Detection   # Segment intersection + proximity checks
    ├── AI Autopilot          # runApproachPatternAI() (L7) + runCoPilotAI() (L6)
    ├── Level Definitions     # 7 levels with custom configs, win/lose conditions
    ├── Input Handling        # Pointer events (touch + mouse), tap/drag, command buttons
    └── Game Loop             # requestAnimationFrame with delta-time capping
```

### Key Constants
- `MIN_SEPARATION_GAP = 88` — 2 plane-lengths minimum for approach spacing
- `WARN_SEPARATION_GAP = 44` — 1 plane-length warning threshold
- `CRITICAL_SEPARATION_GAP = 22` — imminent collision threshold
- `HOLD_RADIUS = 80` — circular holding pattern radius for Level 7
- `MAX_TURN_RATE_DEG = 20` — smooth turn rate cap for AI planes

### Design System
- **Style:** Claymorphism-inspired (soft shadows, rounded corners, playful)
- **Colors:** Color-blind friendly palette (blue, orange, green, red, purple)
- **Touch targets:** 48px minimum (56px recommended)
- **Font sizes:** 18px+ body text

## Testing

```bash
node test/index.test.js
```

Tests cover:
- Turning radius formula (correct values, speed/bank relationships)
- Trail generation (straight, turning, step count, timestamps)
- Collision detection (crossing, parallel, non-intersecting segments)
- Level win/lose logic
- Numerical bounds validation
- **Steer toward** (smooth heading interpolation, turn rate capping, convergence)
- **Approach separation** (gap thresholds: safe/warning/critical)
- **Approach speed management** (proactive gap-based speed control)

## Keyboard Shortcuts
- `1`–`7` — Jump to level (from menu)
- `D` — Toggle debug mode
- `Escape` — Return to level select
- `Arrow keys` — Command mode: Left/Right to turn, Up/Down for speed, Space for Steady
- `Shift+Arrow` — Fast turn (command mode)

## Accessibility
- Color-blind friendly colors (avoiding red/green confusion)
- Visual danger indicators (pulsing trails, status badge, data tag warnings)
- Audio warnings (collision alert beep)
- Large touch targets (48px+)
- High contrast UI elements
- Keyboard navigation support
- `prefers-reduced-motion` respected

## File Size
- Single file: ~3200 lines / 127KB
- No external dependencies at runtime (fonts loaded from Google Fonts CDN)
- No server required — works offline after first load
