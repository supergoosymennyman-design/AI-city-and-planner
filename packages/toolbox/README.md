# @edu/toolbox

Canonical on-device **AI/voice** implementations for the platform — the home the
contract points at ("Ported impls live in @edu/toolbox", see
[`packages/contract/src/services.ts`](../contract/src/services.ts)).

It wraps three salvaged R22 prototype engines (`src/engine/*.js`, ported from
`source/toolbox/`) behind the **frozen** `@edu/contract` surfaces:

| Factory | Contract surface | Backed by |
| --- | --- | --- |
| `createAIServices(opts)` | `AIServices` | `JointDetectionManager` (pose/hands), `RecognitionManager` (teachable image), Web-Speech STT |
| `createAudioBus(opts)` | `AudioBus` | `speechSynthesis` TTS + Web-Audio chimes |

The raw engine classes are also exported as an **escape hatch** for richer,
continuous use (live hand-tracking, gesture streams) that the one-shot contract
surface intentionally doesn't expose.

## How games use it
Games **never** import this package. The **host** composes these factories into
the `GameContext` it injects; games touch ML/voice only through `ctx.ai` /
`ctx.audio` (golden rule #2). Host wiring is a separate step — this package is
the standalone, tested implementation.

## Offline / no-CDN (rule #4)
The engine copies here contain **zero CDN URLs**. The ML libraries
(`@mediapipe/holistic`, `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`) are
declared as **peer dependencies** and loaded via dynamic `import()` so the
consuming host bundles them from npm — not from a CDN.

MediaPipe's runtime `.wasm`/model files and the coco-ssd weights still need to be
**served locally** by the host. Stage them with:

```
node scripts/vendor-ml-assets.mjs
```

which copies them into `packages/toolbox/assets/` (git-ignored). Pass the served
base path to the factory via `holisticAssetBase` / `cocoModelUrl`.

> **Verification boundary:** the package ships no CDN calls, but proving real
> end-to-end offline pose/image inference requires a host serving those assets —
> that browser smoke test lands with host wiring. Until then `probe('recognizePose')`
> / `probe('recognizeImage')` should be treated as provisional.

## Testing
`src/*.test.ts` run under Vitest/jsdom using `@edu/testing` fakes and **injected
fake ML libraries** — no real model download. Crash-proofing (rule #12) is
covered adversarially: model never responds, constructor throws, detector
rejects, speech `onend` never fires.
