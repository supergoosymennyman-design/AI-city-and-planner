# Real observations and learned starters — task 074

Packaged 2026-09-11. This catalogue is separate from the legacy three-bin demo and synthetic
Plants/Buses/Ice-cream examples. No observations or labels were generated to improve scores.

## Sources and preparation

**Iris**: R. A. Fisher, 1936, UCI Machine Learning Repository,
[Iris, DOI 10.24432/C56C76](https://doi.org/10.24432/C56C76),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
150 observations, three species, four measurements in centimetres. The original archive is
`iris-source.zip`; its SHA-256 is in `audit.json`. Rows are identified by their original 1-based
position. UCI's documented corrections are applied to rows 35 and 38 and recorded in the audit.
No rows are excluded. Identical feature tuples are grouped before splitting. Features divide
the four lengths by a fixed 10 cm scale and use the existing dataset adapter's level-one
normalization and unit vector. The test partition does not fit the preprocessing scale.

**Auto MPG**: UCI Machine Learning Repository,
[Auto MPG](https://archive.ics.uci.edu/dataset/9/auto+mpg),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Cite: Quinlan, R. (1993). Auto MPG
[Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5859H.
200 observations, two features (horsepower and weight in pounds) and one numeric answer (miles
per gallon). The archive `auto-mpg-source.zip` holds 398 rows; the 6 with missing horsepower
('?') are excluded, the remaining 392 are sorted by mpg and 200 evenly spaced rows are kept, so
the whole range survives. Rows are stored in mpg order; the library picker therefore spreads a
selection across a split instead of taking a prefix. Identical rows share a split (same rule as
Iris).

**TrashNet**: Gary Thung and Mindy Yang,
[original repository](https://github.com/garythung/trashnet). The repository's MIT notice is
reproduced verbatim in `TrashNet-LICENSE.txt`. The existing local derivative contains all 2,527
256 × 256 WebP photographs (13,932,636 bytes): cardboard 403, glass 501, metal 410, paper 594,
plastic 482, trash 137. Photographs were originally collected largely against white posterboard
using phone cameras. Stable IDs and labels retain the source folder and filename. The local
derivative predates this catalogue; this task verifies each file decodes and records its SHA-256,
dimensions and membership. No new crops, relabeling or exclusions were applied.

Duplicate screening groups identical file hashes and 64-bit dHash neighbours within Hamming
distance 2, transitively, even across labels. The 88 candidate pairs are listed in `audit.json`.
This conservative screen is not an exhaustive duplicate detector or a full human label audit.
A 48-photo contact sheet was inspected as a source sanity check; ambiguous material labels,
backgrounds, packaging/brands and collection bias remain. Category means material, not a local
recycling instruction. An untaught class can receive a confident wrong answer.

For both collections, the first eight hexadecimal digits of a group's SHA-256, modulo 10,
assign values 0–6 to training and 7–9 to test. This rule was fixed before training or scoring.
Catalogue membership is immutable in version 1: Iris **105/45**, TrashNet **1,762/765** train/test.
The UI takes a stable prefix per selected class within a split. “3000 per class” includes every
available observation. Class imbalance remains; no score-selected test subset is offered.

## Actual photo features, not filename-derived answers

`features-000.js` through `features-078.js` hold actual MobileNet image embeddings, extracted
with the Workshop's self-hosted MediaPipe ImageEmbedder. The 256 px source is drawn to a 224 × 224
canvas, then embedded, packed as little-endian Float32 and normalized on load. The output has
**1,024 dimensions**. Source labels and filenames are not components of that vector.
`features-manifest.json` records the extractor model, catalogue and chunk SHA-256 hashes.
The preprocessing identity is `mobilenet-v3-small-224-squash-f32-unit-v1`.

Each classic local script holds at most 32 vectors (~171 KiB encoded). The complete feature
payload is about 13.2 MiB; all library assets together are about 14 MiB, in addition to the
existing photos. Runtime loads batches sequentially on demand and caches vectors; only up to
48 thumbnails are cached. No webcam, network service or ML runtime is needed to use these
packaged inputs. Stopping cancels the selection operation immediately; one in-flight batch can
finish into the shared cache, but cannot change a Model or Files selection. Requests time out
after 15 seconds. Full-collection loading still uses additional decoded-vector memory.

## Supplied learned state

`models.js` contains two independently reproducible **Nearest Centroid** artifacts:

| Starter | Training observations | Separate test result |
|---|---:|---:|
| Iris species starter | All 105 training rows | 44/45 correct |
| Waste material starter | First 10 training photos per class (60 total) | 472/765 correct |

Each includes the actual learned centroids, training IDs, adapter hash, schema/preprocessing
version and per-observation held-out predictions. No inference-time teaching occurs.
These are results on these specific frozen collections, not child-learning evidence or claims
about new camera photos. Comparing repeatedly on a test set makes it exploratory feedback;
it ceases to be an untouched final test for subsequent model choices.

## Reproduction

From the repo root, sequentially:

```text
python scripts/build-workshop-library.py
node scripts/build-workshop-photo-features.cjs --fresh
node scripts/build-workshop-models.cjs
node --test --test-concurrency=1 web/project/workshop/tests/model-library.test.js
```

Preparation requires Pillow. Feature extraction uses one Chromium browser via the shared
lightweight harness, one photo at a time, and the existing self-hosted extractor. It can resume
verified chunks when source/extractor hashes match. Rebuilt floating-point embeddings may vary
with browser/ML backend; distributed chunks and their hashes define this version. If those
features or an adapter change, regenerate and explicitly version compatible artifacts.
