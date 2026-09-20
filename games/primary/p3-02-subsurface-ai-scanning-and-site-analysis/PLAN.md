# Game Plan (v2): p3-02-subsurface-ai-scanning-and-site-analysis

> **Revision of v1** (preserved as `PLAN-v1-original.md`). v1 was tested and robust but sat at the
> shallow end of the lesson's P1–P6 progression: it only asked kids to *spot a spike by eye* and
> omitted the lesson's stated **sensor fusion** concept. v2 pulls the proven AI mechanics from
> **P4** (cost/accuracy tradeoff), **P5** (training-data labeling, confidence, human-in-the-loop)
> and **P6** (sensitivity slider, precision/recall, training loop) down to age-8 level, and finally
> adds **sensor fusion**. The oscilloscope aesthetic, grid/map shell, Nova conversational layer, and
> conversation passivity are preserved.

## Lesson Info
- **Track:** primary — **Band:** P3 (Age 8) — **Lesson:** 2
- **Game name:** Subsurface Signal Decoder
- **Source:** `source/primary/lessons/lesson-02/p3/` (cross-band refs: `p4/`, `p5/`, `p6/`)
- **Registry AI concepts:** signal processing, sensor fusion, anomaly detection
- **Objective:** Students *train and tune* a subsurface AI surveyor (Nova) to read noisy sensor
  signals, fuse multiple sensors, and safely site a city building — learning that AI learns from
  labeled data, that detection is a threshold tradeoff (not a yes/no), and that fusing sensors
  beats any single sensor.

## AI Concepts Taught (per level)
| Lv | Name | AI concept | What the kid actually does to learn it |
|---|---|---|---|
| 1 | **Teach Nova** | Supervised learning | Labels signal samples Hazard/Safe → watches Nova *learn a threshold from their labels* → sees it get 1–2 wrong on purpose → adds labels to fix it |
| 2 | **Tune the Sensitivity** | Anomaly detection = threshold tradeoff (precision vs recall) | Steps a Sensitivity control → watches false-alarms vs caught-hazards meters move → spends drill tokens on false alarms → re-tunes when the noise floor changes |
| 3 | **See Through the Noise** | Anomaly detection under heavy noise | Hazards barely above a wavy baseline → the eye can't tell → must trust the *trained* threshold (and retrain on noisy examples) |
| 4 | **Fuse the Sensors** | Sensor fusion (the missing concept) | Reads 3 sensor channels (Seismic / GPR / EM) → confirms a cell only when ≥2 sensors agree → meets hazards stealthy to one sensor |
| 5 | **Nova Surveys Alone** | Full integration + human-in-the-loop + generalization | Nova auto-classifies an 8×8 site with confidence % → kid approves/corrects only the uncertain cells → a missed hazard collapses a building |

## AI Narrative Arc — "doesn't know → learns → demonstrates"
- **Lv1:** Nova knows nothing and is **wrong**. The kid teaches it with labels; the learned
  threshold line is drawn live on the oscilloscope so the kid *sees* the learning happen.
- **Lv2–3:** The kid tunes Nova to handle noise and trade off errors. Nova becomes a tool the kid
  *configures*, not a magic box.
- **Lv4:** Nova still can't see everything in one sensor — the kid learns to fuse sensors for it.
- **Lv5 (payoff):** Nova, taught and tuned by the kid, **surveys a site unaided**. If the kid
  taught it well, Nova sails through; if poorly, a building collapses. The arc closes: the AI the
  kid built demonstrates what it learned. A short end card contrasts Lv1-Nova (wrong) with
  Lv5-Nova (competent) — "You taught me. Look what I can do now."

## Target Age & Accessibility (P3 / 8 years old)
- **Reading level:** 1–2 short sentences per instruction. New AI words introduced one at a time,
  only via Nova when the kid asks "Nova, what is ___?"
- **Touch targets:** ≥48px (56px preferred) on all buttons; the Sensitivity stepper and
  label/approve buttons are large.
- **Contrast:** ≥4.5:1 body text on the dark oscilloscope bg (keep `#d0d0e0` on `#0a0a1a`).
- **Attention:** no hard timer on Lv1–3; a soft, generous timer only on Lv4–5 where it teaches the
  cost tradeoff. Anti-frustration: 3 wrong attempts → Nova reveals the correct call as a teaching
  moment (kept from v1).
- **Layout:** tablet landscape 1024×768, no scrolling; Lv5's 8×8 grid must still fit.
- **Two-channel a11y:** every instruction is on-screen text AND available spoken via Nova when
  addressed; AI state indicator (idle/listening/thinking/speaking) preserved; ARIA labels on all
  new controls.

## Game Flow (per level)

### Shared shell (preserved from v1)
Top bar (title + level label + 📝 transcript + ⚙️ settings + ☰ level menu, all 5 unlocked) →
game area: left = survey **grid map** (6×6, becomes 8×8 in Lv5) with legend; right = **device
panel** with oscilloscope **canvas**, objective box, action row (Mark / Confirm / Reset), Nova
avatar + state dot + speech bubble, text-input fallback, feedback area, level-complete overlay.
🔧 debug button reveals hazards / auto-trains for testing. **Cost model:** a visible **drill-token
pile** (starts e.g. 8); false alarms and HD confirmations cost tokens; running out does NOT hard-
fail early levels — it just lowers the star rating — but on Lv5 a token run-out before confirming
all hazards = site unsafe.

### Level 1 — Teach Nova (supervised learning)
- **Loop:** See a signal sample on the oscilloscope → tap **Hazard** or **Safe** to label it →
  after 4–6 labels, Nova **learns a threshold T** (see *The In-Browser Model*) and the threshold
  line draws itself on the chart → Nova auto-classifies the 6×6 grid → **1–2 cells are wrong on
  purpose** (the training set was small/borderline) → the kid taps a wrong cell to add a
  corrective label → T updates live → re-classify → repeat until all cells correct → Confirm.
- **Win:** all grid cells correctly classified (after the kid's corrections).
- **Cost:** no tokens in Lv1 (teaching is free).
- **Teach moment:** the kid literally sees T move as they label. Nova (when asked): "You taught me
  on 4 samples. I'm only 60% sure — show me more and I'll get better!"

### Level 2 — Tune the Sensitivity (threshold tradeoff)
- **Loop:** Nova is pre-trained (carries a baseline T). A big **Sensitivity** stepper (− / +, 1–9)
  shifts the detection threshold: **higher sensitivity → lower threshold → flags more → more false
  alarms**; lower sensitivity → fewer alarms but **misses**. Live meters: **Hazards Caught** and
  **False Alarms** update as the kid steps. Each false alarm the kid *confirms* spends a drill
  token; a missed hazard, if the kid confirms "safe", will trigger a collapse in the recap.
- **Win:** confirm all real hazards with ≤ budget false alarms.
- **Re-tune beat:** a second sub-round shifts the noise floor up — the old sensitivity now over-
  flags — the kid must re-tune. Teaches "no single threshold works everywhere."
- **Teach moment:** the threshold line slides on the chart in real time as the kid steps.

### Level 3 — See Through the Noise (anomaly detection under noise)
- **Loop:** Hard SNR — hazards sit barely above a wavy, noisy baseline. The eye can't reliably
  tell; the kid must rely on the **trained threshold** and may **retrain** on 1–2 noisy examples
  (drag a noisy cell into the label panel). False alarms cost tokens. A "noise" overlay visually
  shakes the baseline.
- **Win:** confirm all hazards with tokens to spare.
- **Teach moment:** trusting a learned rule over your eyes; retraining on hard examples.

### Level 4 — Fuse the Sensors (sensor fusion)
- **Loop:** Three sensor channels — **Seismic**, **Ground-Penetrating Radar (GPR)**,
  **Electromagnetic (EM)** — shown as three stacked signal strips per cell (toggle which is front,
  or fade-overlay all three). Each sensor has its own noise; a hazard spikes in a **subset** of
  sensors. **Some hazards are stealthy to one sensor** (e.g. a plastic pipe shows in GPR + EM but
  not Seismic; a void shows in Seismic + GPR but not EM). A cell is a **confirmed hazard only when
  ≥2 of 3 sensors exceed their per-sensor threshold**. The kid flips sensors, cross-references,
  and taps agreeing cells. An **agreement indicator** (2/3 dots light up) appears per cell.
- **Win:** confirm all fused hazards.
- **Teach moment:** no single sensor is perfect; fusion + cross-validation reduce uncertainty.

### Level 5 — Nova Surveys Alone (integration + human-in-the-loop)
- **Loop:** 8×8 site. Nova (the kid's trained+tuned+fused system) **auto-classifies every cell**
  with a **confidence %** bar. High-confidence hazards Nova marks automatically; high-confidence
  safe Nova clears; **only the uncertain cells (≈40–70% confidence) are flagged for the kid** to
  **Approve** or **Correct** (human-in-the-loop, from P5). A pipe may be a **connected line of
  cells** — Nova traces it once the kid confirms the ends. A missed hazard (Nova said safe, was
  hazard) → short **collapse animation** + the building falls. A false alarm → wasted tokens.
- **Win:** site certified safe (all real hazards marked) within token budget.
- **Payoff:** if the kid taught Nova well across Lv1–4, Nova is confident and the kid barely
  intervenes; if poorly, Nova misses and a building collapses — closing the arc.

## The In-Browser "Model" (transparent — the kid can SEE why it decided)
The whole point: Nova's "AI" is a **simple, visible algorithm**, not a black box. The kid must be
able to see the decision rule and watch it change with their input.

### 1D threshold classifier (Lv1–3)
- Each signal sample has one feature: **peak amplitude** `a` (0–100) over the cell's window.
- **Learning T from labels:** collect labeled-Safe amplitudes `S` and labeled-Hazard amplitudes `H`.
  - If both sets non-empty: `T = (max(S) + min(H)) / 2` (midpoint between the highest "safe" and
    lowest "hazard" the kid labeled). Edge: if sets overlap (kid labeled inconsistently), `T` sits
    inside the overlap and **misclassifies the overlap cells on purpose** — this is the designed
    "AI gets it wrong" beat.
  - If one set empty: `T` = that set's only bound ± a default margin (Nova: "I've only seen safe
    ground — show me a hazard so I learn the difference!").
- **Classify:** amplitude ≥ T → Hazard, else Safe. **Draw T as a horizontal line on the chart**;
  draw the Safe cluster (green dots) and Hazard cluster (orange dots) under the axis so the kid
  sees the two groups and the line between them.
- **Confidence (Lv5):** `conf = sigmoid((a − T) / scale)` → % . Far above T → ~99% hazard; near T
  → ~50% (uncertain → routed to kid).

### Sensitivity (Lv2)
- `effectiveThreshold = T − (sensitivity − 5) * step` (step ≈ 6). Sensitivity 9 → lowest threshold
  → flags most → most false alarms. Sensitivity 1 → highest threshold → fewest flags → misses.
  The threshold line visibly slides as the kid steps; the two cluster dots stay fixed (the *data*
  didn't change, only the *rule*).

### Sensor fusion (Lv4)
- Per-sensor per-cell amplitude `a_sensor`. Per-sensor threshold `T_sensor` (pre-set per level, or
  carried from a quick per-sensor teach). A sensor **votes Hazard** if `a_sensor ≥ T_sensor`.
- **Fusion rule:** cell confirmed Hazard iff **≥2 of 3 sensors vote Hazard**. Show each sensor's
  vote (✓/✗) and the agreement count (2/3 or 3/3) per cell. Stealthy hazards: one sensor's
  amplitude is deliberately below its threshold for that hazard type.

### Why this is teachable
The kid sees: (a) the labeled dots, (b) the threshold line, (c) the line moving when they label
more or change sensitivity, (d) each sensor's vote and the agreement count. Every decision has a
visible reason. Nothing is hidden.

## Conversation Design (passivity PRESERVED + new vocab)
- **Passivity unchanged:** Nova SPEAKS only when the kid says "Nova" / "AI" / "drone" or asks a
  direct question. No auto-speech on load, level start, transition, complete, or idle (idle prompt
  is visual-only). The only `speechSynthesis.speak()` call stays inside `conversation.js`
  `speakResponse()`. Level feedback = **SFX + on-screen visual text only**.
- **New intents (add to `intents.js`):** `what_is_threshold`, `what_is_training_data`,
  `what_is_confidence`, `what_is_sensor`, `what_is_false_alarm`, `what_is_miss`, `what_is_fuse` —
  age-8 explainers, triggered by "Nova, what is ___?" patterns. Plus updated `hint` per new level
  and `LEVEL_SUCCESS` for the 5 new levels. Off-topic keeps a lesson nudge.
- **What Nova SHOWS vs SAYS:** Nova's *teaching* is the visible threshold/confidence/sensors on
  the oscilloscope. Nova's *speech* is on-demand explanation and hints. The kid can play and learn
  fully without ever talking to Nova (visual channel is primary); speech is the bonus channel.
- **Existing modules preserved:** `conversation.js`, `settings.js`, `transcript.js` unchanged in
  behavior; `intents.js` extended.

## Technical Approach
**Stack unchanged:** vanilla HTML5 + CSS3 + JS, no frameworks, self-contained, offline, tablet-
first, no child PII, mic/cam in-memory.

### New files
- **`classifier.js`** — the transparent model: `learnThreshold(labels)`, `classify(amplitude, T)`,
  `confidence(amplitude, T)`, `sensitivityThreshold(T, sensitivity)`, `fuseVotes(votes)`. Pure
  functions, fully unit-testable. **This is the AI the kid trains** — kept tiny and visible.
- **`sensors.js`** — the 3 sensor-channel signal generators (Seismic/GPR/EM) with per-sensor noise
  profiles and stealthy-hazard rules; `cellSignals(cell, level)` returns 3 amplitudes.

### Modified files
- **`game.js`** — replace the 5 v1 levels with the v2 levels + the teach/label flow, sensitivity
  state, fusion voting, human-in-the-loop approve/correct, drill-token budget, collapse trigger,
  and the Lv1→Lv5 state carry (does Nova stay "trained"? carry `T` forward as a nod to the arc).
- **`chart.js`** — draw the **threshold line T**, the **safe/hazard cluster dots**, **confidence
  bars** per cell, the **3 sensor strips + vote ticks + agreement indicator**, and training-sample
  markers. (Canvas, responsive, no blur — keep v1's scaling approach.)
- **`main.js`** — wire the new UI (label buttons, sensitivity stepper, sensor toggle, approve/
  correct buttons, token counter, collapse overlay), the Lv5 end-card contrast (Lv1-Nova vs
  Lv5-Nova), state reset on level switch, and keep the 🔧 debug paths (auto-train, reveal hazards).
- **`index.html`** — add: label panel (Hazard/Safe), sensitivity stepper + meters, sensor channel
  toggle, per-cell confidence bars + approve/correct buttons, drill-token pile, collapse overlay,
  Lv5 end card. Keep all v1 chrome (top bar, modals, Nova UI, transcript, settings, 🔧).
- **`style.css`** — style the new UI with **existing CSS custom properties** (oscilloscope tokens).
  Tokenize the one-off `#FFD700` gold into `--color-turbo` if reused. No new AI-slop colors.
- **`intents.js`** — new vocab explainers + level hints/success (above).
- **`audio.js`** — add **collapse** sound + **token-spent** sound (Web Audio SFX only; **no TTS**).

### Preserved (no behavior change)
`conversation.js`, `settings.js`, `transcript.js`, the oscilloscope dark aesthetic + tokens, the
grid-map shell, Nova avatar/state-dot/speech, settings/transcript drawers, conversation passivity,
fallbacks (mic/speech/audio unavailable → graceful), 3-attempt reveal guard.

## Difficulty Progression
- **SNR shrinks** Lv1→Lv3 (hazards closer to the noise floor each level).
- **Tokens tighten** Lv2→Lv5 (fewer false alarms affordable).
- **Grid grows** 6×6 → 8×8 in Lv5; **connected/linear hazards** (pipes) appear Lv4–5.
- **Decision steps grow:** Lv1 (label) → Lv2 (tune+confirm) → Lv3 (retrain+confirm) → Lv4
  (fuse+confirm) → Lv5 (approve/correct Nova's auto-survey).
- **Soft timer** only on Lv4–5 (teaches cost tradeoff); generous, never the primary fail mode.

## Edge Cases & Success Criteria
- **Each level verified winnable** (builder must trace win conditions; 🔧 auto-train/reveal for QA).
- **Anti-frustration:** 3 wrong attempts → Nova reveals the correct call (teaching moment); hint
  budget via addressing Nova; no hard fail from tokens on Lv1–3 (just star rating).
- **Carry-over safety:** switching levels via ☰ resets per-level state (kept from v1); the Lv1→Lv5
  "trained T" carry is cosmetic (for the arc) and must not break state reset.
- **Fallbacks preserved:** mic denied → text input; SpeechSynthesis absent → visual-only; Web Audio
  absent → silent fail; `speechSynthesis.speak()` wrapped in try/catch (fixes v1 LOW issue).
- **No regressions:** v1's debounce, drill-lock, state guards, responsive layout, XSS-safe
  (textContent) rendering all stay. New UI also uses textContent (no innerHTML for user/dynamic).
- **Breaker concerns (from BREAK_REPORT.md) kept addressed:** debounce on taps, no auto-speak,
  graceful API degradation, bounded settings sliders, transcript cap (add per-entry ~5000-char cap).

## AI-Literacy Outcomes (after playing, the student should understand)
1. **AI learns from labeled data** — Nova's threshold came from *their* labels; bad/small labels =
   a wrong Nova. (Supervised learning, Lv1.)
2. **Detection is a tradeoff, not a yes/no** — lowering the threshold catches more but makes more
   false alarms; there's no "perfect" sensitivity, only one tuned to the cost. (Precision/recall,
   Lv2.)
3. **AI can be fooled by noise** — and retraining on hard examples helps. (Robustness, Lv3.)
4. **Fusing sensors beats any single sensor** — no one sensor sees everything; agreement across
   modalities reduces uncertainty. (Sensor fusion, Lv4.)
5. **AI is probabilistic and benefits from human-in-the-loop** — confidence isn't certainty; a
   human approves/corrects the uncertain calls; and bad training has real consequences (a collapsed
   building). (Generalization + HITL, Lv5.)
6. **The big arc:** an AI that knew nothing became useful because *a kid taught, tuned, and fused
   it* — and then it could survey a site on its own. AI isn't magic; it's built and checked by
   people.
