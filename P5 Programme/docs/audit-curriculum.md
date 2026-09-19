# Gemini audit — Pass G: curriculum / "named-AI vs real-AI" honesty (2026-09-10)

**Surface:** every place the programme says "AI" (or "Smart") to a child — the 18 quest buildings,
the city metrics/mayors, the milestones, the badges, the planted-capability runtime, the Academy
lesson core, and the buddy personae.

**Method:** ONE single-shot pro request over a context of the programme's own source-of-truth docs
(`ai-concept-map.md`, `badges-and-tiers.md`, `tool-integration-map.md`, `city-design-benchmark.md`)
plus the current claims-code. Same `cat -n` mechanism; every finding re-read at the cited
`file:line` before acting. Calibration: **[V]** verified · **[A]** claimed · **[X]** refuted.

## Findings

| # | Sev | Verdict | Location | Claim vs reality | Action |
|---|---|---|---|---|---|
| G1 | HIGH | **[V] but not a lie** | `hong-kong-real/quests.js:26-47` | Building labels carry "AI "/"Smart " prefixes ("AI Finance Tower", "Smart Treasury", "AI Bus Scheduler", …) while `ai-concept-map.md:40` says "never 'AI' as a decorative skin". **However**, each building also has a real, honest `QUEST_THEMES[id].line` (e.g. id 1 → "Price AI compute fees with billing sliders", id 12 → "Train acoustic AI to find pipe leaks"), and undeployed ones show an honest ⏳. So the child *can* see/explain the concept; the tension is between the doc's strict wording and the code's branding — **not** a child-facing lie. | **DOCUMENTED, not renamed** — renaming 18 buildings (EN + zh + 3D labels) is a product/branding call. Recommend either softening `ai-concept-map.md:40` or dropping the prefixes; needs owner sign-off. |
| G2 | MEDIUM | **[V] real, but DEAD code** | `champion-city/buddy-bridge.js:253-255` | The persona instructed the buddy to say it "train[s] that department's AI agent (agents like Nova, Botly, and the bus fleet AI)" — fabricated agents the child never trains. | **FIXED** — the fabricated agents/over-claim removed. NOTE: `buddy-bridge.js` is imported nowhere (the interior scenarios were removed) → dead code; candidate for deletion, not resurrection. |
| G3 | MEDIUM | **[V]** | `city-builder/city-builder.js` (⏳ branch) | The honest "coming soon" ⏳ still prints the "AI "/"Smart " label, implying a hidden AI. | **Covered by G1** (resolves if the labels are renamed). |
| G4 | LOW | **[V] known** | `city-planner/planner.js` vs `city-builder/city-builder.js` | L2 (visible algorithm) is strong in the 2D planner (drawn Dijkstra routes, Explore) but drops to a text chip in the 3D city. | **DEFERRED** — already a planned Sprint-4 item in `city-design-benchmark.md`/`ai-concept-map.md` ("the 3D city shows the layout's walking reach / zoning as legible overlays"). Feature, not a fix. |
| G5 | LOW | **[V]** | `city-common/metrics.js` (balance penalty) | The balance/spread policy is real but its *rule* is not surfaced in the 3D HUD, so the score can feel arbitrary. | **DEFERRED** — legibility improvement; the localized `problem` strings already exist and could be surfaced in a later UX pass. |

## Doc-vs-code divergences (the pass's main output)

1. **L1 is overstated in the docs.** `ai-concept-map.md` claims the "never 'AI' as a decorative skin"
   rule is met; the building *labels* still use AI/Smart prefixes (the *entry cards* do carry the real
   concept, which is why this is a wording/branding gap, not a lie).
2. **L4 is understated.** `cap-runtime.js` is *more* honest than the docs require: it enforces
   `runSelftest` before mount, exposes the raw study/check/sealed split, and `stage1Note` says outright
   "not connected yet — it is not controlling anything". The docs should claim credit for this.
3. **Quests vs Capabilities are parallel, not joined** — the known "spine unwired" gap
   (`tool-integration-map.md`): the static quest minigames and the `.cap` runtime do not intersect.

## Strengths the pass reconfirmed (honesty done right)

- **Badges + milestones are genuinely recognition-only.** No quantity/time/100% triggers; milestones
  key off structural capability (`nearRoad && served`), badges promote only on empirical `.cap`
  evidence (`heldOut > 0`), and nothing gates content.
- **`cap-runtime.js` is the gold standard** for educational AI honesty (see divergence 2).
- **Academy `lesson-core.js` `dijkstraReveal`** steps through real settle/mark frontier expansion — L2.
- **The live city buddy persona** (`city-builder/buddy.js`) breaks the fourth wall honestly ("a
  computer helper program … not sure which exact AI brain you run on").

## Calibration tally

5 findings → 4 [V] (1 fixed in dead code, 1 documented as a branding call, 2 deferred as known/feature),
0 [X]. The pass's value was the doc-vs-code reconciliation: the programme is **more honest than feared
on recognition + capability**, and the one real over-claim was a fabricated-agents line in dead code.
