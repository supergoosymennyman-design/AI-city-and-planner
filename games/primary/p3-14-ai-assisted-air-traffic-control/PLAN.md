# PLAN: Predictive Ghost Trails — P3 Lesson 14

## Overview
- **Game ID:** p3-14-ai-assisted-air-traffic-control
- **Track:** Primary | **Band:** P3 | **Age:** 8 years old
- **Title:** Predictive Ghost Trails
- **Lesson:** AI-Assisted Air Traffic Control
- **AI Concept:** Predictive Motion Modeling & Vector Trajectory Overlap

## Learning Objectives
1. Understand that AI predicts future states (trajectories) before making decisions
2. Learn that momentum affects turning — fast/heavy objects need more space
3. Develop spatial reasoning: predicting where paths will intersect
4. Practice adjusting inputs based on real-time prediction feedback

## AI Narrative Arc
- **AI doesn't know →** Ghost Trails initially show raw momentum vectors
- **Learns →** Students adjust turn angles; Ghost Trails update in real-time showing predicted consequences
- **Demonstrates →** At higher levels, students must manage multiple trajectories simultaneously, internalizing the prediction model

## Core Mechanics

### Drag-Arrow Turn Control
- Each plane has a direction arrow that the student can drag to adjust the target heading
- Dragging the arrow tip rotates it around the plane center
- The Ghost Trail updates continuously as the arrow is dragged

### Ghost Trails
- Translucent, glowing curves projecting 5 seconds into the future
- Color-coded per plane (blue, red, green, orange — color-blind friendly)
- Trail curvature calculated by: `TurningRadius = (Velocity²) / (BaseGravity × tan(BankAngle))`
- Trails fade from solid near the plane to translucent at the prediction horizon
- Intersection markers appear where trails cross (show collision points)

### Collision Detection
- Future intersection: calculating when two trail curves cross within the same time window
- Wall collision: trail boundary exceeds level boundaries (cloud walls)
- Time-overlap: two planes occupy the same space-time coordinate

## Level Design

### Level 1 — Predict the Arc
- **Setup:** Two planes (blue, red) on screen with initial trajectories
- **Goal:** Adjust blue plane's turn so Ghost Trails don't cross
- **Win:** Trails clear for 3 seconds
- **Lose:** Trails cross → collision warning
- **Teaching:** Visualizing prediction of trajectory arcs

### Level 2 — The S-Curve
- **Setup:** One large passenger jet, narrow cloud canyon walls
- **Goal:** Steer jet through canyon without trail hitting cloud walls
- **Win:** Successfully navigate the full S-curve
- **Lose:** Trail touches cloud boundary
- **Teaching:** Adjusting for momentum — turn early enough

### Level 3 — Intersection Alert
- **Setup:** Two planes on converging paths; off-screen collision predicted in 4 seconds
- **Goal:** Change one plane's turn radius to clear the intersection
- **Win:** Predicted intersection point disappears
- **Lose:** Trails still intersect after adjustment period
- **Teaching:** Intercepting predicted conflicts before they happen

### Level 4 — The Heavy Jet
- **Setup:** One massive cargo plane (slow-turning, wide Ghost Trail) + two nimble jets
- **Goal:** Route both jets around the heavy plane's sweeping trail
- **Win:** Both jets clear of heavy trail for 10 seconds
- **Lose:** Either jet trail intersects heavy trail
- **Teaching:** Different objects have different prediction profiles (mass/momentum)

### Level 5 — Sky Grid Harmony
- **Setup:** 4 large jets with complex crossing trajectories
- **Goal:** Keep all trails intersection-free for 60 seconds
- **Win:** Timer reaches 0 with no intersections
- **Lose:** Any two trails intersect
- **Teaching:** Multi-agent trajectory management — holistic prediction

## Technical Architecture
- **Rendering:** HTML5 Canvas for real-time trail rendering, DOM overlay for UI controls
- **Data Model:**
  - `Plane { x, y, heading, velocity, bankAngle, type }`
  - `GhostTrail { points: [{x, y, t}] }` — array of predicted positions
  - `Intersection { point, time, planes[] }`
- **Animation Loop:** requestAnimationFrame with delta-time physics
- **Collision Math:** Ray-curve intersection testing along trail segments
- **State Management:** Per-level state machine (setup → playing → win/lose → transition)

## Interaction Design
- **Touch:** Drag on arrow tip to adjust heading; tap to select a plane
- **Mouse:** Same interaction model for desktop testing
- **Feedback:** Trail color pulses on danger; haptic-like visual shake on collision
- **Debug:** 🔧 button toggles intersection markers overlay

## Visual Design
- **Theme:** Open sky gradient (light blue at horizon, deeper blue at top)
- **Planes:** Stylized flat vector icons with contrail
- **Trails:** Glowing, translucent (opacity 0.6→0.2), ~4px wide
- **Clouds:** Soft semi-transparent white shapes for boundaries in Level 2
- **Colors:** Color-blind friendly palette (blue #4A90D9, red #E5734A, green #66BB6A, orange #FFB347)
- **Typography:** Large, rounded, sans-serif (18px+ minimum for body text)
- **Touch targets:** 48px minimum (56px recommended for age 8)

## Audio Plan
- Plane engine hum (subtle, continuous)
- Trail update whoosh (soft, on drag)
- Collision warning beep (gentle, ascending)
- Level complete chime (bright, cheerful)
- Failure tone (soft, encouraging — not punishing)

## Accessibility
- Color-blind friendly trail palette (blue/orange/green — avoids red/green confusion)
- Trail patterns / dashed variations as secondary differentiator
- Visual warning flash on near-collision (not just audio)
- Large touch targets (48px+)
- High contrast UI elements (4.5:1 minimum)
- Clear, short instructions with visual demonstration
- No time pressure before student is ready to interact

## Data Flow
```
User drags arrow → heading/bankAngle updated → physics step computes new trajectory
    → Ghost Trail recalculated (5s prediction window) → trail rendered on canvas
    → collision detection checks trail segments against other trails/boundaries
    → if intersection found → pulse warning, update UI
    → if intersection cleared → mark safe, progress tracking
```
