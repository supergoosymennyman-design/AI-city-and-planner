# Valid contract values (use ONLY these)

These mirror `packages/contract/src/{capability,manifest}.ts`. The downstream
`validate-contracts` gate rejects any value not in these enums, so the blueprint must use them
exactly. If the contract changes, this file is regenerated — treat the contract as the source
of truth.

## `track`
`kindergarten` | `primary`

## `capability` (a game lists ONLY what it actually uses)
| value | what it is | track / notes |
|---|---|---|
| `recognizeImage` | MobileNet + KNN teachable image classifier (tfjs) | camera teach-a-label; needs camera |
| `recognizePose` | MediaPipe Hands/Pose + gesture classifier | body/finger games; hardware-gated |
| `listen` | Speech-to-text (STT) | **Android-Chrome only — always skippable, never required** |
| `speak` | Text-to-speech (TTS) | the AI/bot voice (English-primary) |
| `converse` | scripted/rule-based dialogue (ConversationManager) | the AI's spoken lines |
| `generateImage` | offline sticker/shape remix (NOT real diffusion) | "AI draws/generates" lessons |
| `generateAudio` | Web Audio sequencing of recorded samples | beat/sound lessons |
| `trainModel` | on-device KNN / few-shot training | the "teach the AI" mechanic itself |

> Map the lesson's mechanic to capabilities honestly. "The kids teach the AI and it remembers"
> = `trainModel` (+ usually `recognizeImage` or `recognizePose` to sense, `speak`/`converse`
> for the voice). "AI generates a picture" = `generateImage` (offline remix — say so).
>
> **Draw-to-teach vs camera-recognize (common mix-up):** if the child *draws/colours on the
> tablet canvas* and the AI learns from those strokes, that is `trainModel` over the drawn
> input — **not** `recognizeImage`. Use `recognizeImage` / `recognizePose` only when the tablet
> **camera senses the real world** (a held-up object, the child's body). A shapes/colours
> drawing lesson is `trainModel` (+ `speak`/`listen`), no camera capability.

## `aiRepresentation` (be HONEST — this is a pedagogy-integrity field)
| value | meaning |
|---|---|
| `real-model` | a genuine ML model runs (e.g. MobileNet/MediaPipe inference) |
| `rule-based` | deterministic rules / nearest-neighbour over taught examples; no real "understanding" |
| `remix` | recombines pre-made assets (e.g. sticker remix) — not real generation |
| `remote-real` | a real model behind a network call (needs sign-off; rare, breaks offline) |

> The most common kindergarten honest answer is `rule-based` or `real-model` for teach-a-label,
> and `remix` for "AI generates" lessons. Do not write `real-model` for something that is a
> lookup table — the whole point (Big Idea 3) is that the AI only knows what it was taught.

## `a11y.instructionChannels` (choose ≥2)
`audio` | `visual` | `symbol`

## `a11y.inputChannels` (choose ≥2, and MUST include `tap`)
`tap` | `voice` | `camera` | `keyboard` | `switch`

## `bigIdea` (AI4K12 Big Idea, integer 1–5)
1 Perception · 2 Representation & Reasoning · 3 Learning · 4 Natural Interaction · 5 Societal Impact.
(Teach-by-example "the AI learns what you show it" lessons are almost always **3 Learning**.)

## `assetMode`
`composed` (built from code/SVG/synth — no external files) | `curated` (bundled self-hosted
assets) | `remote` (needs sign-off).

## `orientation`
`portrait` | `landscape` | `any`

## `ageBand`
A short string for the target band, e.g. `K2-K3` (kindergarten) or `P1-P2` … `P5-P6` (primary).
