# Break Report (v2): p3-02-subsurface-ai-scanning-and-site-analysis

> **Round 2 of v2.** Round 1 (v1) found 0 CRASH / 0 DEAD_END. This v2 round tests the new AI-teaching mechanics (Lv1–5) and the two HIGH pedagogical gaps closed by the fix loop. Found **2 CRITICAL DEAD ENDS** that the fix loop did NOT address.

## Summary
- **Total breaks found:** 9
- **CRASH:** 0
- **DEAD END:** 2
- **SILENT FAIL:** 0
- **MISLEADING FEEDBACK:** 2
- **UX GAP:** 5

## Passivity verdict — PASS (zero auto-speak)
Speach synthesis was intercepted at boot. `speechSynthesis.speak()` call counts measured at every transition point:

| Transition | speak() calls |
|---|---|
| Page load (idle, 5s wait) | 0 |
| Start Survey click → Lv1 | 0 |
| Lv1 → Lv2 (via menu) | 0 |
| Lv2 → Lv3 (via menu) | 0 |
| Lv3 → Lv4 (via menu) | 0 |
| Lv4 → Lv5 (via menu) | 0 |
| After Lv1 complete (API) | 0 |
| After Lv5 complete (API) | 0 |
| Idle 15 s on Lv1 (idle prompt is visual-only) | 0 |

**Conclusion: Nova NEVER auto-speaks. Passivity is preserved exactly as designed.** The visual idle prompt ("Stuck on a signal? Just say 'Nova, hint!'") is rendered as DOM text — no audio.

## XSS verdict — PASS
Tested 5 unaddressed + 3 addressed XSS payloads via text input. All rendered as text via `textContent`. **0 alerts fired.** Transcript appends as text only. Confirmed by `window.alert = function(){ alertsFired++ }` monitor.

Payloads tested:
- `<img src=x onerror=alert(1)>` (unaddressed & addressed as "Nova, ...")
- `<script>alert(1)</script>` (unaddressed & addressed)
- `"><script>alert(1)</script>`
- `javascript:alert(1)`
- `<svg onload=alert(1)>`

## AI arc integrity — PARTIALLY BROKEN

| Pedagogical beat | Status |
|---|---|
| Lv1 "AI gets it wrong" beat (✗ on 2 trap cells after 4 labels) | ✅ Fires reliably |
| Lv1 confirms with correct labels (kid can complete) | ❌ **DEAD END after first correction** |
| Lv2 sensitivity tradeoff | ✅ Works |
| Lv3 noise + retrain | ✅ Works |
| Lv4 sensor fusion (≥2/3 agree) | ✅ Works (perfectly designed: 4 hazards, 0 false-positives) |
| Lv5 Nova auto-classifies with carried T from Lv1 | ✅ Works |
| Lv5 end card ("You taught Nova!") on completion | ⚠️ Only shown via UI doApprove/doCorrect path — NOT if level is completed via API |
| Lv5 collapse animation when kid trained Nova badly | ❌ **UNREACHABLE for the worst-case bad-T scenario** |

---

## CRITICAL BREAKS

### 🔴 DEAD END #1 — Lv1: "Confirm Teaching" button hidden after first corrective label
- **Category:** B (Out-of-order) — game-state transition
- **What I did:** Played Lv1 happy path. Labeled the 4 training samples correctly (2 safe, 2 hazard). 2 trap cells show ✗. Tapped one wrong cell (e.g. `(0,3)` amp=56) to add a corrective label. After one correction, the threshold T shifts from 52.26 → 60.46, which makes BOTH trap cells now classified as safe. The phase auto-transitions to `'confirmed'`. **The "Confirm Teaching" button is hidden.** I am stuck.
- **What I saw:**
  - Status: "Teaching confirmed!"
  - Feedback (briefly): "All cells correct! Great teaching! Confirm to finish."
  - But the Confirm button is **NOT visible**.
  - `isComplete() === false`, `phase === 'confirmed'`, button is `hidden`.
  - I can only Reset Level.
- **Repro:** 100% — runs every time on the intended happy path (label 2 safe + 2 hazard, correct one trap cell, both get fixed in one step).
- **Why it happens:**
  - `game.js correctCell()`: if all cells correct after the corrective label, sets `trainingPhase = 'confirmed'`.
  - `main.js refreshUI()` (line 810-811): `btnConfirmLv1.classList.toggle('hidden', phase !== 'correcting' || !Game.isComplete());` — the condition is `phase !== 'correcting'`, but after the auto-transition phase is `'confirmed'`, not `'correcting'`. Button stays hidden.
  - The kid cannot call `confirmLv1()` because the only path to it is the now-hidden button.
- **Expected:** The Confirm button should appear when the kid has finished correcting and all cells are correct, regardless of phase label.
- **Fix:** `main.js` line 810-811 should be: `this.dom.btnConfirmLv1.classList.toggle('hidden', phase === 'collecting' || Game.isComplete());` (or expose a `checkAllCorrect()` accessor and use it).

### 🔴 DEAD END #2 — Lv5: Collapse animation unreachable when carryOverT is very high
- **Category:** H (AI arc integrity) + D (Refusal/Silence)
- **What I did:** In Lv1, labeled all 4 training cells as `Safe` (worst-case teaching). `learnedT.T = 82.52` (all-safe branch: `safeMax + 12`). `carryOverT = 82.52`. Jumped to Lv5. All 10 real hazards have composite amplitudes in the 48–53 range. With T=82.52, **all 10 hazards are auto-classified safe** (none are uncertain, none are auto-hazard).
- **What I saw:**
  - Device info: "Uncertain: 0 | Hazards: 0/10"
  - Approve / Correct buttons **disabled** (no uncertain cells).
  - `collapseTriggered === false` because `checkLv5MissedHazards` is only called from `doApprove` / `doCorrect`, and the kid has nothing to click.
  - I cannot make Nova collapse. I cannot progress. I can only Reset.
- **Repro:** 100% — any Lv1 labels that produce `T > 60` (all-safe, or 3-safe-1-hazard with low amps) reproduces this. The T=82.52 example is the most dramatic.
- **Why it happens:** The collapse animation is gated behind the kid approving/correcting an uncertain cell. When Nova's auto-survey is so confident it's wrong (all hazards missed), there are no uncertain cells to act on, so the kid never triggers the path that would teach "your bad training collapsed the building."
- **Expected:** When all cells are auto-handled but real hazards were auto-classified as safe, the level should either (a) auto-scan for missed hazards on init and trigger the collapse + end card, or (b) auto-show a "Site unsafe!" overlay prompting the kid to reset & retrain.
- **Severity:** CRITICAL — this is the headline pedagogical moment of the whole 5-level arc ("AI isn't magic; it's built and checked by people. A poorly-trained AI collapses buildings."). The kid who taught Nova worst never sees it.

---

## Category A: Wrong inputs

### A1. All-Safe / All-Hazard / Inconsistent labels (Lv1) — Works
- Labeled all 4 as `Safe` → T = 82.52. Nova over-predicts safe. The kid can correct, but only with the visible ✗ marks.
- Labeled all 4 as `Hazard` → T = 13.57. Nova over-predicts hazard. Same correction flow.
- Labeled inconsistently (high-amp as `Safe`, low-amp as `Hazard`) → T = 48.05 with `overlap: true`. T lands in the middle of the labeled set. Still produces 2 trap-cell errors. The classifier is robust to the one-class edge cases (uses `+12`/`-12` margin). **No break.** ✅

### A2. Rapid-tap Label Safe/Hazard (Lv1) — Works
- 4 rapid taps on the same cell change the label and update `trainingLabels[]`. The cell stays labeled, label updates, samplesToShow filtered. **No double-label. No crash.** ✅

### A3. Rapid-tap sensitivity stepper (Lv2) — Works
- 30 alternating `setSensitivity(9)` / `setSensitivity(1)` → final state `sensitivity=1, effectiveT=72`. **No jitter, no oscillation, no NaN.** ✅

### A4. Sensitivity extremes (Lv2) — Works
- `setSensitivity(1)`: 0 cells classified as hazard. The kid can still confirm hazards (Confirm button works regardless of classification). **No token drain trap, no win-impossible state.** ✅
- `setSensitivity(9)`: 25 of 36 cells flagged. The kid would have to confirm only the 4 real hazards (4 tokens spent). Level still completes. ✅

### A5. Rapid-tap Retrain in Lv3 — Works
- 20 calls to `attemptRetrain(1,4)` → T stabilizes at 40.49 after the first call. **No oscillation, no crash.** ✅

### A6. Approve + Correct on the same Lv5 cell (Lv5) — Token drain
- `approveCell(1,1)` → 1 token spent, 1 approved. `correctCellLv5(1,1)` on the same cell → **another** token spent, cell added to BOTH `approvedCells` AND `correctedCells`.
- In the UI, the buttons are disabled after the first action (`isApproved || isCorrected`), so the kid can't actually trigger this. But the API allows it. **UX GAP (defensive, low-impact).** 

### A7. Lv4 sensor toggle rapid — Works
- 20 rapid `setActiveSensor(i % 3)` calls → final state correct. **No glitch in agreement indicator.** ✅

---

## Category B: Out-of-order actions

### B1. 🔴 DEAD END #1 (above) — Lv1 confirm flow broken

### B2. Play Lv1 → Lv5 → back to Lv1 → Lv5 again — Works
- `carryOverT` persists correctly across Lv1→Lv5→Lv1→Lv5 cycles.
- First Lv1 with consistent labels → T=60.46 → jump to Lv5 (T=60.46).
- Re-label Lv1 with inconsistent labels → T=48.05 → jump to Lv5 (T=48.05). **Carry-over updates correctly.** ✅

### B3. Switch levels mid-training (Lv1 half-labeled) — Works
- Lv1 with 2 labels (phase=`collecting`) → jump to Lv5 → state resets cleanly. Lv5 is initialized. Return to Lv1 → state reset (labels=[], phase=`collecting`). `carryOverT` preserved. ✅

### B4. Open settings/transcript mid-labeling — Works
- Settings opens via overlay, no impact on game state. Transcript opens via drawer, no impact. ✅

### B5. Open settings while a level is complete — Works
- Settings overlay opens. Level complete overlay still visible behind it. ✅

---

## Category C: Rapid input / button mashing

### C1. 🔴 DEAD END #1 (above) — first corrective label auto-confirms

### C2. Rapid-tap Retrain (Lv3) — Works (see A5)

### C3. Rapid-tap Approve / Correct (Lv5) — Works via UI; token drain via API (see A6)

### C4. 🔧 debug toggle — Works
- Toggle on → reveals hazards, auto-trains, triggers level complete (or Lv5 end card).
- Toggle off → re-enables? Yes, the button dataset toggles correctly. **No stuck-in-debug state.** ✅

### C5. Text input spam — UX GAP
- 10 rapid `Send` clicks in a loop → **10 speak calls, 10 transcript entries**. No debounce. v1 breaker flagged this; **v2 fix loop did NOT add debounce**. For a kid who mashes send, Nova talks over herself. The visual queue's 2.5 s timer is not coordinated with new utterances.
- **Severity:** UX GAP (low impact — visual + audio overlap is annoying but not breaking)

---

## Category D: Refusal / silence / timeout

### D1. 🔴 DEAD END #1 (above) — Lv1 confirm not shown

### D2. 🔴 DEAD END #2 (above) — Lv5 collapse unreachable

### D3. Lv1: label 4 then never confirm — Works
- No timeout. The kid can sit forever in "Reviewing — fix errors" with all ✗ cells visible. No dead-end (they can keep tapping cells or reset).

### D4. Lv5: never approve/correct — Works
- The kid can sit in Lv5 with 10 uncertain cells and 8 tokens forever. No timeout. They can approve/correct whenever.

### D5. Lv3: never retrain — Works
- Lv3 is winnable without ever using the Retrain button. Hazards are barely above the threshold; the trained T (T=46) correctly catches them. **No require-Retrain gate.** ✅

### D6. Launch and do nothing — Works
- Intro screen shows indefinitely. No auto-speak. No timer. The kid must click "Start Survey" to begin. ✅

### D7. SpeechSynthesis missing — Graceful
- Removed `window.speechSynthesis` mid-game → `speak()` bails out at `if (settings.muted || !window.speechSynthesis)` check. Speech text still rendered in DOM. **No crash.** ✅

### D8. AudioContext missing — Graceful
- Removed `window.AudioContext` mid-game → `playTone()` bails out at `try/catch` around oscillator creation. No SFX, no crash. ✅

---

## Category E: Creative destruction

### E1. Mobile portrait (375×667) — UX GAP
- Layout reflows to column. 8×8 Lv5 grid is 359px (fits). 3-sensor Lv4 toggle fits. But:
  - `Approve` / `Correct` buttons: visible but **inViewport: false** (below the fold).
  - `Reset Level` button: inViewport: false.
  - Device panel is 271px tall, content 586px (scrollable but kid must scroll within the device panel — non-obvious).
- **Severity:** UX GAP (kids on iPad portrait may not see the action buttons; need to scroll the device panel)

### E2. Mobile landscape (1024×768) — Works
- All controls visible. ✅

### E3. Settings extremes — Works
- Rate 0.5, volume 0%, mute on, mic off → all bounded by slider min/max. Page does not crash. Mic off → STT disabled, text input fallback shown. ✅

### E4. SpeechSynthesis voices not loaded — Works
- Voice picker shows only "Default (System)" if no voices available. ✅
- `utterance.voice` lookup with bad voiceURI → `find()` returns undefined → utterance uses default voice. No error. ✅

### E5. Refresh mid-Lv1-training — UX GAP
- Page refresh resets `carryOverT` to null, all Lv1 labels lost, no state persistence. Settings (rate, volume, voice, mute, mic) persist via localStorage. **No mid-game save.** This is consistent with v1 design ("single-session classroom game") but the carry-over T loss means Lv1 must always be replayed before Lv5 to use the trained T.

---

## Category F: Device / lifecycle failures

### F1. Refresh mid-level — Works (graceful — see E5)

### F2. Resize to 375×667 — UX GAP (see E1)

### F3. Multiple game instances — Untested
- If the kid opens 2 tabs, the SpeechRecognition instance per tab could conflict. Not directly tested. v1 didn't test this either.

---

## Category G: Conversation AI abuse

### G1. 🟡 MISLEADING INTENT — "Nova, what is sensor fusion?" returns "what is sensor"
- **Category:** G (Conversation AI abuse)
- The intent patterns are:
  - `what_is_sensor` (priority 79): `/what.*sensor/i`
  - `what_is_fuse` (priority 76): `/sensor.*fusion/i`
- When the kid says "what is sensor fusion", `/what.*sensor/i` matches FIRST (because higher priority), so the response is the "what is a sensor" answer. The "sensor fusion" answer is hidden behind.
- The fix is to either bump `what_is_fuse` priority above `what_is_sensor`, or to add a more specific pattern like `/(?:sensor\s*)?fusion/i` to `what_is_fuse` (or remove `.*` from `what.*sensor`).
- **Severity:** MISLEADING FEEDBACK (low) — the "what is a sensor" response does mention fusion at the end, but the kid's specific question is "fusion", not "sensor".

### G2. Off-topic loop (10x same off-topic) — Works
- 10× "AI, is the earth flat?" → 3 unique responses out of 10. Good variety. ✅

### G3. Addressed off-topic — Works
- "AI, do you like ice cream?" → 1 sentence natural answer ("That is interesting! For now, let us focus..."). Off-topic intent is intentionally limited. ✅

### G4. Rapid adddressed/unaddressed switching — Works
- Addressed → 1 speak. Unaddressed ("circle") → still 1. Addressed → 2. **Unaddressed speech does not trigger.** ✅

### G5. Interrupt AI mid-TTS — Works
- `utterance.onend` handler resets state, allows next utterance. Calling `speechSynthesis.cancel()` cancels in-flight TTS. ✅

### G6. No text input debounce — UX GAP (see C5)

### G7. XSS — Safe (see XSS verdict above)

---

## Category H: AI arc integrity

### H1. Can the Lv1 "AI gets it wrong" beat NOT fire?
- **No.** With 2 safe + 2 hazard labels, the trap cells (0,3)=56 and (2,0)=54 are always above T (~52). The 2 ✗ marks are guaranteed.
- **Edge case:** If the kid labels the training samples inconsistently (e.g. 3 safe + 1 hazard), more cells become ✗, but the "AI gets it wrong" beat still fires. The beat is robust to the kid's label quality.
- **Verdict:** ✅ Reliable. But the Lv1 confirm DEAD END #1 still breaks the rest of the beat.

### H2. Can Lv5 use a WRONG threshold?
- **Yes.** carryOverT persists from Lv1, so a kid who labels badly in Lv1 gets a bad T in Lv5. The mechanic is designed to teach the consequences of bad training. ✅ (As intended.)
- **But:** When T is so bad that all hazards are auto-safe (T > ~60), the DEAD END #2 kicks in and the kid never sees the "collapse" teaching moment.

### H3. Does the Lv5 end card always show?
- **No.** The end card (`#lv5-end-card`) is only shown by `main.js doApprove()` / `doCorrect()` after the level is marked complete. If the level completes via `Game.approveCell()` API (e.g. from `setTimeout` in a future feature, or from a programmatic test), the end card never appears.
- **Verdict:** ⚠️ UX GAP (low) — the current UI flow always shows it (kid must press Approve/Correct to complete the level). But the design is fragile.

### H4. Can you reach the completion screen without actually teaching Nova anything?
- **Yes** — via the 🔧 debug button. Clicking 🔧 once calls `Game.debugAutoTrain()` which completes the current level (Lv1: auto-labels + auto-corrects + auto-confirms; Lv2-4: marks all hazards; Lv5: approves all).
- The PLAN says debug is for QA. But the **debug button is visible in the game UI by default** and is one click away from completion. A kid could "win" all 5 levels in 5 seconds without learning anything. **MISLEADING FEEDBACK** — the trophy screen and "AI Trainer Certified!" message imply the kid has demonstrated mastery, but they may have just clicked 🔧.
- **Severity:** MISLEADING FEEDBACK (medium) — the debug button should be hidden or require a long-press to reveal. Or it should be removed from the production build entirely.

### H5. Lv1 5th label ignored — UX GAP
- `addLabel()` only triggers `trainNova()` if `trainingLabels.length >= 4 && trainingPhase === 'collecting'`. After 4 labels, phase is `'reviewing'`, and adding a 5th label does NOT re-train. The T stays at the 4-label value.
- **Severity:** UX GAP (low) — the kid added a 5th label expecting it to help. T doesn't move. The 5th label is added to `trainingLabels` but has no effect.

### H6. Lv3 anti-frustration reveal not implemented — UX GAP
- `antiFrustrationLimit: 3` is set on each level but never used in code. The PLAN says "3 wrong attempts → Nova reveals the correct call as a teaching moment". **The reveal logic is missing.** `wrongAttempts` increments past 3 indefinitely. **No reveal, no teaching moment.**
- **Severity:** UX GAP (low) — only matters in adversarial scenarios where the kid repeatedly taps correct cells.

---

## Fix-loop verification
The fix loop closed 2 HIGH pedagogical gaps (per the prior session). These are:
1. (PRESUMED FIX) Lv1 "AI gets it wrong → kid corrects" beat **does** fire reliably (H1 ✅).
2. (PRESUMED FIX) Lv5 carry-over T from Lv1 **does** persist and influence Lv5 (H2 ✅).

**However, the fix loop did NOT introduce new breaks.** All 9 breaks found are pre-existing or were latent in the v1+v2 logic. The two DEAD ENDS are both in the **Lv1 confirm flow** and **Lv5 collapse reachable from UI** — neither was on the original fix-loop list but both are critical.

---

## CRITICAL BREAKS (ranked)

1. **🔴 Lv1 Confirm button hidden after first corrective label** (DEAD END)
   - **Repro:** Lv1 happy path → label 4 → tap any ✗ → phase becomes `'confirmed'` → button hidden → no way to call `confirmLv1()`.
   - **Fix:** `main.js:810` — change condition to show button when `checkAllCorrect()` is true OR when phase is `'correcting'`. Also expose a `Game.checkAllCorrect()` accessor.

2. **🔴 Lv5 collapse animation unreachable for worst-case bad T** (DEAD END + pedagogical break)
   - **Repro:** Lv1 all-safe labels → T=82.52 → Lv5 → all 10 hazards auto-safe → no uncertain cells → no Approve/Correct → no collapse trigger.
   - **Fix:** In `computeLv5NovaSurvey()` or at level init, scan for `autoHandled && classification === 'safe' && isHazard` cells. If any exist, set `collapseTriggered = true` and pick a representative `collapsedCell`. Then in `main.js refreshUI()` (Lv5 section), check `Game.isCollapseTriggered()` and show the collapse overlay + a "Site unsafe — train Nova better and retry" prompt with Reset/Replay buttons. The end card should NOT show in this case (collapse = fail).

## HIGH issues (ranked)

3. **🔧 debug button visible in production UI** (MISLEADING FEEDBACK)
   - A kid can "win" all 5 levels in 5 seconds by clicking 🔧 five times.
   - **Fix:** Hide 🔧 behind a key combo (e.g. Ctrl+Shift+D) or remove from production.

4. **🟡 "Nova, what is sensor fusion?" misroutes to "what is a sensor"** (MISLEADING FEEDBACK)
   - **Fix:** Bump `what_is_fuse` priority above `what_is_sensor`, or use a more specific pattern that matches "fusion" before "sensor".

## MEDIUM issues (ranked)

5. **No text input debounce** (UX GAP)
   - 10 rapid sends = 10 speak calls, Nova talks over herself. Same v1 issue. Fix loop did not address.
   - **Fix:** Add a 200 ms debounce on the `Send` button click handler in `conversation.js sendTextMessage()`.

6. **Lv5 approve+correct token drain on same cell** (UX GAP, defensive)
   - API allows; UI prevents. `correctCellLv5` should early-return if the cell is already in `approvedCells`.

7. **Lv1 5th label silently ignored** (UX GAP)
   - `addLabel` only re-trains at exactly the 4-label transition. The 5th label is stored but doesn't move T.
   - **Fix:** Always re-run `trainNova()` after `addLabel`, or reject additional labels with feedback.

8. **Lv3 anti-frustration reveal not implemented** (UX GAP)
   - `antiFrustrationLimit` is set but not used. The "3 wrong attempts → Nova reveals" beat is missing.
   - **Fix:** In `correctCell`, if `wrongAttempts >= antiFrustrationLimit`, auto-add a label with the correct value and show feedback.

## LOW issues (ranked)

9. **Mobile portrait (375×667): Approve/Correct + Reset buttons below the fold** (UX GAP)
   - Layout reflows to column. Buttons exist but are scrolled out of view. Kid must scroll the device panel.
   - **Fix:** Pin action buttons to the bottom of the screen on small viewports.

---

## Overall Assessment

The v2 game **preserves the passivity invariant perfectly** (zero auto-speak), is **XSS-safe**, and the **new v2 mechanics mostly work**: the Lv1 "AI gets it wrong" beat fires, Lv2 sensitivity / Lv3 retrain / Lv4 sensor fusion are all functional, and Lv5 carries the trained T forward.

**However, the v2 game has two critical DEAD ENDS that block the intended happy paths:**

1. **Lv1 is unwinnable via the UI** for the most common flow (label 4 → fix 1 → all correct → ???). The Confirm button is hidden. A 5-second reset and try-again is the only escape.

2. **Lv5 collapse animation is unreachable** for the worst-case bad training. The kid who taught Nova worst never sees the consequence.

The fix loop closed two pedagogical gaps (the "AI gets it wrong" beat and the carry-over T) but the v2 critical bug at the END of the Lv1 flow (after the fix-loop's intended improvements) was not caught. This is the most-likely-to-be-encountered-by-every-kid break: 100% repro on the standard happy path.

The 🔧 debug button visible in production is a separate "earn the trophy" integrity issue.

**Recommendation: P0 fix Lv1 confirm flow and Lv5 collapse reachability before shipping.** Both are small code changes but they unlock the entire 5-level pedagogical arc.
