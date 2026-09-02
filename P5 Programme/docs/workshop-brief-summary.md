# AI Workshop — Team Brief Summary

Distilled from `AI-Workshop-Team-Brief.pdf` (internal draft, for the lesson designer).
Use this as the reference when planning lessons / builds against the Workshop; the
PDF is the primary source if something conflicts. The Workshop is a SEPARATE project
from this repo's apps (external team; live at `workshop.ai-education.workers.dev`).

## What it is

A **dataflow construction kit** (Node-RED / LabVIEW shape at child scale — NOT
"Scratch for AI"). A child wires real ML parts into a pipeline that *learns*: data
in (photos, poses, spreadsheets) → rides a conveyor as crates → read by real
learning algorithms → comes out as action (a gate, a lamp, a number). The subject is
**"how to tell whether AI is any good"**, not how to use AI.

Ethos: Scratch (plain parts, nothing locked) + micro:bit (real sensors, machines
that act). DNA of the shape: ML genuinely is a dataflow discipline.

## The 20 parts (5 families) — the planning vocabulary

- **Moving**: Feeder · Track (belt + speed) · Sorter gate (2–6 ways) · Buffer (holds until released) · Bin (end of route, counts)
- **Real data in**: Camera · Files (spreadsheet / photo folder) · **Splitter** (deals study / check / sealed-test before anything touches it)
- **Thinking**: **Model** (reads + answers, or says "not sure"; own sense/algorithm/dials) · Labeller (files onto a named Model's shelf) · **Evaluator** (compares guess to truth, keeps the two scores apart, draws the picture)
- **Logic/timing/output**: Filter · Counter · Timer · Window (sliding average) · Chance (weighted dice) · Button · Lamp · Sound · Display
- **3 plug shapes** (nothing invisible connects two parts): square = belt, round = cable, diamond = dial socket.

## The models (6 today, plug-in parts — shelf grows without product change)

k-Nearest Neighbours · Nearest Centroid · k-Means · k-NN regression · ridge regression
with polynomial capacity · a small neural network trained live. MobileNet embeddings
(vision), MediaPipe (pose).

## Test-enforced invariants (true whatever we design)

1. **Evaluation is the spine** — data split before anything touches it; Evaluator keeps *two* scores (studied vs never-met); the gap = overfitting.
2. **Nothing invisible connects two parts** — every relationship is a drawn cable / coupling / belt.
3. **The product cannot lie about the ML** — a model's face is the real math; Evidence traces back to stored examples; Run resets belt-fed learning.
4. **"Not sure" is built in** — abstention below a confidence threshold the child sets.
5. **Real vocabulary, plain sentence underneath** (k-Nearest Neighbours, Regularisation, confusion matrix…).
6. **In-app AI coach** can read any machine (optional, the one network feature).
7. **Offline, private, portable** — no network needed; a child's whole workshop saves to **one file they own**.

## Shipped machines (the raw experiences today)

Rubbish sorter · three-way sorter · watchdog · pose studio · ice-cream stand (study half) · data lab (full examination) · clustering sorter · sliding-average watcher · self-training sorter · + free-form wiring.

## The outcomes to design toward (judgement, not software skills)

"You cannot test on what you trained on" · "Memorising is not learning" (studied/new gap) · "'I don't know' is a valid answer" · "A metric is a choice" (tolerance dial) · "Rubbish in, rubbish out" (six photos from one desk fail on another) · "Machines that learn from themselves drift" (model collapse). The loop: **fit, evaluate, diagnose, adjust** — the practitioner's own.

## Age / audience

Upper primary and above, teacher-led. (Age banding is **asserted, not classroom-validated** — treat as a working assumption. NOTE: the P1 overview also names "the Workshop" for ages 5–6 — see `tool-integration-map.md`.)

## Planning horizon

- **PLAN ON IT**: full floor (20 parts), 6-model library, camera/pose/spreadsheet input, Splitter, readable rules, Evaluator's two scores, shipped example machines, save/load, live URL. Stable + test-enforced.
- **DAYS AWAY**: the "three acts of Run" (Model becomes act-driven: study → check → break the seal on the test pile). Live URL will keep moving.
- **DESIGNED, NOT BUILT**: clustering's piles face + the neural network's falling loss curve face. Don't build a lesson that needs those two pictures yet.
- **DIRECTION ONLY** (the second arc — composing multi-modal machines, no date): Speaker (label → speech), Microphone (speech → signal), Answer-with-the-nearest-example, the vector made visible, Tournaments (one sealed test set, best held-out score wins; points/skins/unlocks stay banned), Make-your-own-part (collapse a sub-machine into a reusable part).

## The one gap this brief can't close

The product is deliberately an **instrument, not a course** — lesson spine, pacing and assessment are ours to write.
