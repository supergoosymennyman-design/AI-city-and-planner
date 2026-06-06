# Definition of Done

A game/PR is done only when **all** hold (technical-green is necessary, not sufficient):

## Technical
- [ ] `npm run validate` green (typecheck + contracts; lint + tests as tooling lands)
- [ ] Builds in `host-standalone`; primary games also run as a `CitySubsystem` in `host-city`
- [ ] Logic unit tests + a render/unmount test; primary adds a `subsystem.tick` delta test
- [ ] Tablet-viewport tested (~768–1024px, touch); within size/perf budget
- [ ] One ML runtime per game with teardown; capability-probe gates ML/voice gracefully
- [ ] No new heavy deps; no runtime third-party CDN

## Localization & i18n
- [ ] English complete; all user-facing strings externalized (incl. Canvas-drawn labels)

## Privacy & security (children)
- [ ] No PII; camera frames memory-only; cloud STT only behind consent; no student data committed

## Accessibility (§6b)
- [ ] `manifest.a11y`: ≥2 instruction + ≥2 input channels, `tap` present
- [ ] Reduced-motion honored; flash-safe; keyboard/screen-reader path for Canvas (City)

## Pedagogy (§5b)
- [ ] Objective met by the interaction; age-appropriate; teaches the intended concept
- [ ] `aiRepresentation` recorded honestly; SME review sign-off
