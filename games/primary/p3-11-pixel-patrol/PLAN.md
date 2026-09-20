# Pixel Patrol — Game Plan

> **Game ID:** `p3-11-pixel-patrol`
> **Entry Point:** `games/primary/p3-11-pixel-patrol/index.html`

## Overview

| Field | Value |
|---|---|
| **Track** | Primary |
| **Band** | P3 (Age 8) |
| **Lesson** | 11 — AI-Powered Urban Monitoring |
| **Source** | `source/primary/lessons/lesson-11/p3/prompt.md` |
| **AI Concepts** | Computer vision, feature extraction, edge detection, object classification, noise filtering |
| **Tech Stack** | Vanilla HTML/CSS/JS, Canvas API |
| **AI Assistant** | Iris — passive STT/TTS eye-in-the-sky companion |

## Learning Objective

Students learn how **computer vision and edge detection** work. They train an AI assistant (Iris) by: toggling between cluttered RGB view and clean Edge Mode to count objects, adjusting visual filters to separate overlapping shapes, classifying different object types, and tuning sensitivity to ignore visual noise.

## Narrative Arc

"Iris is a brand-new surveillance AI. It sees everything — which is the problem. Shadows, sunlight, rain, and overlapping people all confuse it. You teach Iris to strip away the noise and see what's really there."

1. Iris knows nothing (L1)
2. Kid labels shapes so Iris learns categories (L1)
3. Kid toggles Edge Mode to find hidden pedestrians (L2)
4. Kid adjusts separation to split overlapping people (L3)
5. Kid counts moving objects under time pressure (L4)
6. Kid tunes sensitivity to ignore rain/shadows (L5)
7. Quiz certification (L6)

## AI Visibility

- Level banners: "LEVEL 1: SUPERVISED LABELING — Teaching Iris What Things Look Like"
- Iris state badge: 🟡Untrained → 🟢Observing → 🔵Detecting → 🟠Classifying → ⭐Expert
- End-of-level recaps: "🧠 You just taught Iris: **Feature Extraction** — AI focuses on important details and ignores noise."
- Quiz: 10 questions on computer vision concepts

## Level Design

### Level 1 — Label the Shapes (Supervised Labeling)
- **Banner:** 🖍️ LEVEL 1: SUPERVISED LABELING — Teaching Iris What Things Look Like
- 8 silhouette shapes in Edge Mode (clean white outlines on black). Kid taps ✅ (Person), 🚗 (Car), or 🚲 (Bike) to label each.
- Iris learns: "Pedestrians are tall and narrow. Cars are wide and boxy. Bikes have two circles."
- Test phase: 4 new shapes — Iris guesses, kid confirms or corrects. 2+ correct advances.

### Level 2 — Spot the Pedestrian (Feature Extraction)
- **Banner:** 👁️ LEVEL 2: FEATURE EXTRACTION — Seeing Through the Clutter
- Night street scene in RGB (dark, glary, confusing). 6 pedestrians partially hidden.
- Kid toggles **Edge Mode** (green wireframe on black) → people's outlines pop out clearly.
- Kid taps each person to tag them. Must find all 6 within 30 seconds.
- Scaffold: tapping wrong areas shows "That's a shadow. Look for the green outline."

### Level 3 — Split the Crowd (Semantic Segmentation)
- **Banner:** ✂️ LEVEL 3: SEMANTIC SEGMENTATION — Separating Overlapping Shapes
- Scene with 8 people huddled together — RGB shows a blob, Edge Mode shows merged outlines.
- Kid adjusts a **"Detail" slider** (separation threshold 1–10). Low = outlines stay merged. High = outlines split into individuals.
- When separation is correct, each person gets a distinct bounding box (green). Count must match.
- 3 rounds: 5 people (easy), 8 people (medium), 12 people (hard).

### Level 4 — Count the Traffic (Object Detection)
- **Banner:** 🚗 LEVEL 4: OBJECT DETECTION — Classifying Moving Targets
- Busy street intersection viewed from above. Cars, bikes, and pedestrians move across 3 waves (15s each).
- Kid must count each type separately in the time limit. Toggle Edge Mode to verify.
- Wave 1: 4 cars + 2 pedestrians. Wave 2: 6 cars + 3 bikes. Wave 3: 8 cars + 3 pedestrians + 2 bikes.

### Level 5 — Filter the Storm (Noise Filtering)
- **Banner:** 🌧️ LEVEL 5: NOISE FILTERING — Seeing Through Rain and Glare
- Stormy scene with rain streaks, sun glare, and shadows creating false edge artifacts.
- Two sliders: **Line Thickness** (1–10 — thin shows noise, thick misses small objects) and **Sensitivity** (1–10 — low ignores weak edges, high catches everything).
- Must find settings where real people (4) are detected but rain/glare artifacts aren't.
- 2 rounds: heavy rain (lots of false edges), sun glare (overexposed areas).

### Level 6 — Computer Vision Exam
- **Banner:** ✏️ LEVEL 6: COMPUTER VISION EXAM — AI Literacy
- 10 multiple-choice questions. Pass: 7/10.
- Questions cover: edge detection purpose, feature extraction, classification, noise vs signal, real-world CV uses.

## Companion: Iris 👁️

- State badge: 🟡Untrained → 🟢Observing → 🔵Detecting → 🟠Classifying → ⭐Expert
- Personality: Observant, struggles with visual noise. "I can see... something. The shadows are confusing. Switch to Edge Mode!"
- Intents: `what_is_edge`, `what_is_cv`, `what_is_classification`, `what_is_noise`, `hint`

## Visual Design

- **Theme:** Terminal/security camera — dark `#0D1117` bg, bright green `#00FF41` wireframe edges
- **RGB mode:** Canvas scene with color blobs and simulated glare/shadows
- **Edge mode:** Black canvas with green `stroke()` wireframes
- **Typography:** Fredoka One (headings), Nunito (body), monospace (counters)

## Interaction Modes
1. **Toggle switch** (RGB ↔ Edge) — dominant mechanic
2. **Tap to label** (tap shape → choose category)
3. **Slider tuning** (detail separation, line thickness, sensitivity)
4. **Tap to count** (tap objects to tag them)
5. **Quiz** (Level 6)
