# Capability Bridge — the `.cap` contract (Workshop → AI City)

**Status:** LIVING DRAFT — v0.1, for joint review with the Workshop team.
**Owner (this repo):** the AI City runtime side.
**Workshop team:** implements the EXPORT side.
Fit Studio / Rigger have a separate handoff (see `tool-integration-map.md` → `.champ`).

The one-line contract: the Workshop exports an immutable, versioned **Capability
Bundle** — **data only, never code** — and the City runs it with its OWN independent
runtime. The two teams share a file-format spec and a small set of algorithm
runtimes; they share no codebase.

Core rule (from the Workshop's own invariants, carried across the bridge):

> The City never fakes what the model did. It calls a documented capability and
> displays exactly what it returns — including "I don't know".

---

## 1. The artifact — a single JSON bundle (v1)

For Stage 1 the bundle is ONE JSON file (no ZIP, no unzip dependency). Binary
buffers are base64-encoded strings. Later stages may move to a container if
payloads grow; the JSON shape is the contract now.

```
my-machine.cap.json
```

Top-level shape (version 1):

```jsonc
{
  "magic": "passiona.capability",
  "specVersion": 1,
  "kind": "classifier",            // classifier | forecaster | watcher (Stage 3 grows)
  "id": "cap_<random>",
  "revision": 3,
  "name": "Gate watcher",
  "createdAt": "2026-…",

  "workshop": { "appVersion": "…", "graphName": "Park gate sorter" },

  "input":  { … },                  // see §2
  "output": { … },                  // see §2

  "model":  { … },                  // algorithm + params + threshold, see §3

  "evaluation": { … },              // split counts + study/check/sealed scores + confusion

  "evidence": [ … ],                // the examples index (child-visible), see §4

  "selftest": { "cases": [ … ] },   // the City must reproduce these before going live

  "city": { … },                    // mapping decision → city action, see §5

  "hashes": { … }                   // sha256 of every string field that carries data
}
```

## 2. Input / output schemas

V1 ships **numeric vector in → label out** (the honest first case). Others are
declared but gated by Stage (see §7).

```jsonc
"input": {
  "kind": "vector",
  "fields": [
    { "name": "queueLength", "type": "float32", "required": true },
    { "name": "tempC",       "type": "float32", "required": true },
    { "name": "isWeekend",   "type": "float32", "required": true }
  ],
  "normalization": {              // EXPORTED, never recomputed by the City
    "type": "minmax",
    "epsilon": 1e-6,
    "min": [0, 10, 0],
    "max": [50, 40, 1]
  }
},
"output": {
  "kind": "label",
  "labels": ["open", "hold", "callHuman"],
  "abstainLabel": "__abstain"
}
```

Rules: `output.labels` ≤ 4 in v1 · `input.fields` ≤ 16 · the City event payload
must contain exactly the declared `required` fields, all finite numbers.

## 3. Model

V1 supports ONE algorithm family: **`knn-vector-classifier`**.

```jsonc
"model": {
  "algorithm": "knn-vector-classifier",
  "k": 3,
  "distance": "euclidean",
  "vote": "distance-inverse",
  "epsilon": 1e-6,
  "threshold": 0.62,
  "maxNearestDistance": 2.5,
  "tiePolicy": "abstain",
  "tieEpsilon": 0.05,
  "vectors": { "dtype": "float32le", "count": 48, "dim": 3, "data_b64": "…" },
  "labels":  { "dtype": "uint16le",  "count": 48, "data_b64": "…" }
}
```

- `vectors.data_b64` = row-major little-endian float32, `count × dim`.
- `labels.data_b64` = little-endian uint16, one index per vector into
  `output.labels`. `65535` is reserved (never a training label).
- The City reads these with a `DataView` — never assumes platform endianness.
- Only `split:"study"` examples may live in `vectors`/`labels` (see §4).

## 4. Evidence index

Every training vector maps back to a child-visible example:

```jsonc
"evidence": [
  { "index": 0, "id": "ex_0001", "label": "open", "split": "study",
    "display": { "queueLength": 8, "tempC": 24, "isWeekend": 0 },
    "source": { "file": "gate-data.csv", "row": 12 } },
  …
]
```

Rules: `evidence[i].index` must match row `i` of `vectors`/`labels` ·
`split` is `study|check|sealed` · only `study` rows appear in the executable
vector index · `check`/`sealed` rows may appear in `evaluation` metadata but never
in `vectors`. Images later: `thumb_b64` (small WebP ≤ 96px, ≤ 20 KB) — off by
default; no raw full-res photos in the bundle.

## 5. City mapping + the abstain path

```jsonc
"city": {
  "mount": "park_gate_01",
  "eventSource": "park.gate.sensor",
  "mapping": {
    "open":      { "set": { "gate": "open",  "lamp": "green",  "sign": "Come in" }, "sound": "chime" },
    "hold":      { "set": { "gate": "closed","lamp": "red",    "sign": "Wait" },    "sound": "buzz" },
    "callHuman": { "set": { "gate": "hold",  "lamp": "yellow", "sign": "Ask for help" }, "humanCheck": true },
    "__abstain": { "set": { "gate": "hold",  "lamp": "yellow", "sign": "Not sure" }, "humanCheck": true }
  }
}
```

Rules: the City object must NOT animate a success when the model abstained ·
`__abstain` is REQUIRED in every mapping (a planted machine must have an honest
"not sure" state) · `humanCheck: true` shows the "human check needed" prompt.

## 6. The self-test (the load-bearing device)

`selftest` lets the City verify that its INDEPENDENT runtime reproduces the
Workshop exporter's decisions BEFORE the mount goes live:

```jsonc
"selftest": {
  "cases": [
    { "name": "normal open", "input": { "queueLength": 9, "tempC": 24, "isWeekend": 0 },
      "expect": { "decision": "open", "minConfidence": 0.55 } },
    { "name": "missing field abstains", "input": { "queueLength": 9, "tempC": 24 },
      "expect": { "decision": "__abstain", "reason": "missing-fields" } }
  ]
}
```

If the self-test fails, the City:
1. does NOT activate the capability,
2. shows a plain error on the pod ("self-test failed"),
3. keeps the bundle inspectable.

This is the proof that "no shared codebase, honest inference" actually holds.

## 7. Headless inference (the runtime contract)

V1 exact algorithm — the City MUST implement this, not a look-alike:

1. **Validate** the event crate (capability id, event source, required fields, finite numbers, rate limit).
2. **Normalize** using the EXPORTED `input.normalization`:
   `x_norm[i] = (x_raw[i] - min[i]) / (max[i] - min[i] + epsilon)`, clamped `[0,1]`.
3. **Distance** `d_i = sqrt(Σ(x_j − v_ij)²)` over every training vector.
4. **Neighbours** = the `k` smallest (fewer than `k` → all).
5. **Weights** `w_i = 1 / (d_i + epsilon)`; **class score** `score_L = Σ w_i` for neighbours labelled L.
6. **Confidence** `= max(score) / Σ score`.
7. **Abstain** if: confidence < threshold · nearest distance > maxNearestDistance ·
   top1 − top2 < tieEpsilon (tiePolicy abstain) · invalid/missing input.
8. Return the result object with **evidence ids** (the top-k neighbours).

```jsonc
{ "eventId": "…", "capabilityId": "…", "artifactHash": "…",
  "decision": "open", "confidence": 0.81, "abstained": false, "abstainReason": null,
  "nearestDistance": 0.18,
  "evidence": [ { "exampleId": "ex_0007", "label": "open", "distance": 0.12 } ],
  "timing": { "totalMs": 2.4 } }
```

Every inference is appended to an **immutable local decision log** (time, event,
payload, normalized vector, decision, confidence, evidence ids, applied mapping,
artifact hash) — this is what makes the planted machine auditable.

## 8. UI (the pod, not a pipeline replay)

- **Capability Pod** — the planted machine as a small city object: name, status
  lamp, mini decision card, `Why?` button, `History` button.
- **Three-step timeline** on an event: `Event arrived → Machine thought → City acted`.
- **Why? card** — the evidence panel: the event values, nearest study examples
  with distances, votes, threshold. Abstention reads as *correct behaviour*:
  "The machine did not guess — confidence 41% is below threshold 62%."
- **History** — last decisions, each traceable to its artifact hash.
- Error states are explicit: unsupported spec version, missing dependency,
  self-test failed, hash mismatch, event schema mismatch. No silent fallback.

## 9. Three-stage rollout (cut lines)

| Stage | What the City does | What it does NOT do |
|---|---|---|
| **1. Narrative plant** | accept + validate the JSON, show the pod with name/algorithm/scores/evidence, honestly: *"planted, but not connected to the city yet"* | no live events, no inference, no gate control, no claim it is governing |
| **2. One live capability** | run `knn-vector-classifier` (numeric → label), one mount, gate/lamp/sign, self-test enforced, decision log | image/pose/other algorithms, multi-mount, auto-retrain from city data, invisible logic |
| **3. Richer contract** | more algorithm families (nearest-centroid, k-NN regressor, ridge, k-means signal, small NN), regression, declared post-processing (threshold/debounce/window), image-k-NN ONLY once a pinned offline feature extractor ships | arbitrary Workshop pipeline execution, hidden city heuristics, automatic retraining, executable scripts |

Cut line that never moves: if a Workshop machine cannot be expressed as one of the
supported families, it **stays in the Workshop** — honesty beats universal planting.

## 10. Rules that carry across the bridge

- The City never auto-trains on city data. New examples go to a **human-labelled inbox** first.
- Evidence must resolve INSIDE the City without the Workshop open (the bundle is self-contained).
- The bundle is immutable per `revision`; old decisions stay traceable to old hashes.
- No child PII in any field (ids are random; display values are data, not photos of people unless consented).

---

*To the Workshop team:* this is the export contract. Ship the JSON bundle above;
we will run it. Questions / drift → update this doc's version and bump `specVersion`.
