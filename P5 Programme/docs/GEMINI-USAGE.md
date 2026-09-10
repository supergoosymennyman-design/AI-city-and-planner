# How to use the Gemini CLI well (agent playbook)

> Companion to `GEMINI-RELAY-RUNBOOK.md` (auth + relay mechanics). This file is the "when and
> how to point Gemini at this codebase" cheat-sheet, written from the 2026-09 audit cycles so a
> future session does not rediscover it.

## TL;DR

Gemini is a **discovery** engine (fresh eyes, adversarial, product/UX/pedagogy judgment).
DeepSeek is the **verdict + fix** engine. Run Gemini to surface candidate problems; re-read every
claim at `file:line` yourself, then fix. **Never ship a Gemini claim unverified.**

## How to run a pass (the mechanism that works)

1. **Auth** — the two exports in `GEMINI-RELAY-RUNBOOK.md` (`GEMINI_API_KEY` from
   `~/.cli-proxy-api/config.yaml` + `GOOGLE_GEMINI_BASE_URL`).
2. **Build ONE context file with REAL, per-file line numbers:**
   `for f in …; do echo "===== $f ====="; cat -n "$BASE/$f"; done > ctx.txt`
   Per-file headers matter: a plain `cat -n a.js b.js` numbers continuously, so every citation after
   the first file is off (un-numbered sources put Gemini's line numbers out by hundreds).
3. **ONE single-shot request:**
   `cat ctx.txt | gemini -p "$(cat prompt.txt)" -m gcli-gemini-3.1-pro-preview --skip-trust`
   - **NEVER** the `@p5-auditor` subagent / multi-turn tools — they 429-storm the relay and hang.
   - **pro** for judgment / adversarial / architecture; **flash** for high-volume shallow sweeps.
4. **Pacing:** 10 req/min — keep ≥100s between passes, one bulk read per pass, never run passes in
   parallel.
5. **Ask for a bounded report:** `### Findings` (numbered; `[SEV] path:line — problem — fix`),
   `### Strengths`, `### Open questions`; under ~1300 words; "do not invent".

## Use Gemini for (its strengths)

- **Fresh-eyes adversarial reading** — it catches the author's blind spots. Real bugs DeepSeek wrote
  and missed: the champion sidebar language-freeze (two i18n modules, two `_lang`s), a
  deployment-key log-leak path, a dead 1 MB save cap.
- **Red-team role-play** — "act as a 10-year-old, then a malicious adult" against the safety
  boundary. It found the synonym-jailbreak and naked-domain filter gaps.
- **Cross-cutting / duplication synthesis** — two i18n modules, two gateway shells, two stylesheets,
  a 4k-line monolith.
- **Product / UX / age-appropriateness taste** — AI-slop, tablet-first, "named AI vs real AI".
- **Pedagogy** — whether the programme *teaches* AI or merely *labels* it.

## Do NOT use Gemini for (its weaknesses)

- **Verdicts.** It hallucinates ~15–20% of its claims, and inflates severities. Concrete refuted
  examples: a "phantom backtick" bug the parser already strips; a symlink fix that would dangle in
  the home worker; a "canvas resize" bug that did not exist. **Always verify at `file:line`.**
- **Deterministic facts** — CC0 provenance, GLB manifest, orphan detection, import-graph, i18n key
  parity. These belong to tooling (`scripts/*.mjs`, `npm run test:*`), not a model.
- **Performance measurement** — measure, don't ask.
- **Writing tests or applying fixes** — it is read-only by design.

## The loop (calibration discipline)

Gemini proposes → DeepSeek verifies at `file:line` and marks each finding `[V]` verified /
`[A]` plausible-unverified / `[X]` refuted → fix the `[V]`s, document the rest → each pass writes a
handoff doc (`docs/audit-*.md`) and cross-references prior rounds so stale findings are not re-found.

**Empirical prior** (2026-09 passes): ~14 findings → ~10 `[V]`, ~2 `[X]` refuted, ~4 deferred as
medium/high-risk. Gemini is accurate on *where* to look, unreliable on *how bad* and occasionally on
*whether* — which is exactly why the verify gate is mandatory.

## Scoping a pass

- Feed the **full relevant files** (not snippets) so it can reason across them; add a **structure
  digest** (grep of top-level functions + line counts) for files too big to pipe whole.
- **One lens per pass** (fresh-eyes audit / red-team / architecture / curriculum) — mixing lenses
  dilutes both.
- Point it at what DeepSeek is weakest on: things DeepSeek **chose** (architecture, naming,
  duplication), not things it typed wrong.
