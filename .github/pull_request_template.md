<!--
PR template = the Definition of Done (AGENTS.md + DEFINITION_OF_DONE.md, plan §8).
CI enforces what it can; these checkboxes cover what CI can't yet (pedagogy, AT audit,
"teaches the concept"). Delete the "Game PRs only" block for foundation/infra PRs.
-->

## What & why
<!-- One or two sentences. Link the curriculum spec / issue / plan § this advances. -->

Closes #

## Definition of Done — every PR
- [ ] `npm run validate` green locally (typecheck + contracts) — CI mirrors it
- [ ] No new heavy dependency (or justified + sized below)
- [ ] No PII; no child data committed (§5c) — incl. work logs / playtest data
- [ ] No third-party CDN at runtime; new libs/models self-hosted + pinned (§5c R16)
- [ ] Comments follow debuggability-first style (TSDoc on exports, WHY inline, loud failures)
- [ ] [docs/PROGRESS.md](../docs/PROGRESS.md) updated if this starts/completes a tracked item

## Game PRs only (delete if N/A)
- [ ] English complete; all user-facing strings externalized (no hardcoded text, incl. Canvas labels)
- [ ] Standalone host runs it; **primary:** city subsystem wires in too
- [ ] Logic unit tests + render/unmount test present; **primary:** a `subsystem.tick` delta test
- [ ] Tested at tablet viewport (~768–1024px, touch)
- [ ] **a11y two-channel redundancy** (§6b): ≥2 instruction + ≥2 input channels, `tap` present
- [ ] **Pedagogy gates** (§5b): objective met by the interaction · age-appropriate · teaches the
      intended concept · `aiRepresentation` recorded · SME reviewed

## Notes for reviewers
<!-- Risk areas, deliberate trade-offs, anything CODEOWNERS/CodeRabbit should look at. -->
