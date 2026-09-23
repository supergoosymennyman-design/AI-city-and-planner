# TrashNet photographs — attribution and projections

The existing local collection contains all **2,527 real TrashNet photographs** from Gary Thung
and Mindy Yang's Stanford CS 229 project. Source: [TrashNet](https://github.com/garythung/trashnet).
Redistributed under MIT; the [full copyright and licence notice](../library/TrashNet-LICENSE.txt)
ships locally. See the [official catalogue notice](../library/README.md) for preparation and limits.

| Folder | Photographs | Original material label |
|---|---:|---|
| paper | 594 | paper |
| metal | 410 | metal |
| plastic | 482 | plastic |
| cardboard | 403 | cardboard |
| glass | 501 | glass |
| trash | 137 | trash |

The 256 × 256 WebP derivative totals **13,932,636 bytes (13.3 MiB)**. Source folder labels are
retained, not independently re-certified. Real photos can be ambiguous; folder names are not a
guarantee of correctness. Material classes do not prescribe local recycling rules.

## Official data library, task 074

`assets/library/catalogue.js` exposes all six labels through ordinary Files/Models controls.
No pictures were excluded. All files decode; SHA-256 membership, duplicate candidate groups,
fixed training/test IDs and preparation are recorded in `assets/library/audit.json`.
Photo features are computed by the actual self-hosted embedder and packaged in lazy batches;
source IDs, not duplicated picture data, travel in champion files.

## Existing three-bin demo, unchanged

`manifest.js` retains all 2,527 paths. The demo's `LESSON_CURATED` filter uses
66 labelled paper/metal/plastic images (44 training, 22 test), selected for embedding separation,
plus all 1,041 cardboard/glass/trash photos as untaught inputs. Its null labels mean “not taught
in this demo”, not missing source ground truth. It does not play the complete official collection.
Success on this curated lesson is not a general TrashNet benchmark.

The reel loads photos lazily with a 48-image cache; its quick-teach action uses a small subset.
A model can confidently misclassify an untaught class. The sure threshold can reject some inputs,
but cannot guarantee rejection of all cardboard, glass or trash.
