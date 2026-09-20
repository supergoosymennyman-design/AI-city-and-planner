# AI City visual review — 13 September 2026

Reviewed the canonical browser city, sample layout, scene lighting and postprocessing, tree/plant batching, model catalogue and CC0 manifest, floating labels, and the placement library. Browser inspection used Chromium at 1280×800 and 768×1024.

## Changes worth making

- **Restore vegetation materials.** The geometry merge discarded every source material and rendered trees and park plants in white. Preserve mesh material groups and textures through normalization and instancing. Matte vegetation now keeps bark, foliage colour and leaf transparency. Instances remain batched by variant; separate bark/leaf materials require additional draws, so this is not a performance improvement.
- **Keep tablet vegetation lightweight.** Touch/mobile devices use the two already bundled low-poly trees (about 55 KB combined) and skip the five detailed forest GLBs (about 3.7 MB and fourteen 1024×1024 textures). This reduces tree batches to at most two on tablets. No new assets were added.
- **Let children see models before choosing.** Replace 36px thumbnails and a tall category-button stack with two columns of 100px previews, a native category selector and search across the catalogue. Model cards are real buttons with visible keyboard focus. Long names wrap. Empty searches explain how to try again. Search and controls are localized; individual model names remain the catalogue's English names.
- **Keep browsing controls usable.** Use an opaque panel, explicit Close, Escape dismissal and expanded state. Suppress city keyboard shortcuts while interacting with the shelf. The proximity mission banner steps aside during browsing so it cannot cover Close on tablets. Room-only entries (`picker: false`) are excluded from browsing, without changing saved records.

## Design assessment

The existing night palette, warm buildings, restrained road edges and distance-based label system provide a coherent direction. Repairing lost material information gives existing greenery more value without introducing another art style or asset download. No new models, rendering dependencies, lighting overhaul, or changes to student layouts were needed.

The catalogue is already broad; discovery is a more immediate issue than quantity. Large previews also expose a future curation task: several similarly named building thumbnails look almost identical, and model names are English. A bilingual, curated outdoor starter collection would be a reasonable separate project, after reviewing each candidate's actual geometry, scale and thumbnail. Avoid further bulk pack imports until then.

## Verification and limits

City boot, model loading, instancing, search, empty results, category browsing, tablet Close and placement/save regression checks are covered by browser checks. No physical iPad GPU benchmark was performed. The full root unit run reported 174 passes and 10 failures in optimizer/walkability behaviour outside this change; the import-graph and CC0/library integrity checks passed. Touch-device emulation also checks that no detailed forest pack is requested and compact trees retain textures. This review does not certify those unrelated behaviours.

Changes are local source edits, not a live deployment.

## Captures

- [Model library at tablet size](visual-qa/review-2026-09-13-library.png)
- [Touch-tablet city with compact trees](visual-qa/review-2026-09-13-tablet-city.png)
