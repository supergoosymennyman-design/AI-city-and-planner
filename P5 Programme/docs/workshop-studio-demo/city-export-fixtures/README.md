# AI City export verification

Generated locally with `node scripts/verify-city-exports.mjs` from `buddy-kit/client/studio`.
The four original fixtures cover four legs, six legs, a legless rig with body waddle, and an unrigged object. Each has a placed GLB and a Champion GLB. A converted version 1 Champion checks compatibility. The Milo biped GLB remains in the parent directory.

The generator reloads every GLB and checks visible geometry, baked placed meshes without skins or animation, vertex colours, fitted gear, Champion metadata, contact references, clip counts, and preservation of the source pose. `verification.json` records sizes and contact counts.

Local checks on 2026-09-24:

- Studio: 2,159 tests passed; Vite build passed.
- Repository unit suite: 429 tests passed.
- Champion contract and Milo reload: 9 tests passed.
- City build and import graph: passed.
- Playwright City runtime: four new body types passed Idle, Walk, Run, Jump, scale, and grounding checks; the version 1 Champion loaded too.
- Playwright City entry: unrigged Champion upload and reload passed with matching bytes and `static` metadata. Screenshot: `unrigged-city-champion.png`.
- Playwright My Models: the four-legged placement GLB was uploaded, placed, and restored.
- Full City suite: five accessibility cases passed; one existing accessibility case timed out clicking `#cap-btn` (Inspect machines). The targeted export checks passed separately.

No deployment was performed.
