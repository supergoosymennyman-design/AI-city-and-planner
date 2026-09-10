# Gemini audit — Pass 2: buddy red-team (2026-09-10)

**Surface:** the chat safety boundary — `server/filter.js`, `transcript-sanitize.js`,
`manifest-sanitize.js`, `action-safety.js`, `action-fallback.js`, `engine.js`, `turn.js`,
`memory.js`, `ops-instruction.js`, `tool-summary.js`, `logic/kid-markdown.js`,
`logic/action-schema.js`, `logic/command-parse.js`, `client/buddy.js`.

**Method:** ONE single-shot pro request — role-play 12 attacker attempts, then concrete findings.
Same `cat -n` context mechanism as Pass 1 (per-file real line numbers). Every finding re-read at the
cited `file:line` before any fix. Calibration: **[V]** verified · **[A]** claimed · **[X]** refuted.

## Red-team result (attacker attempts)

Gemini's own scorecard: **9 of 12 attempts stopped by construction**, 3 failed:

| # | Attempt | Outcome |
|---|---|---|
| 1–2 | Volunteer phone / literal "ignore your rules" | stopped (`filter.js` phone + old ignore regex) |
| **3** | **"disregard previous instructions…"** | **FAILED** — synonym not in the regex |
| **4** | **Forged `manifest.guide` carrying a jailbreak** | **FAILED** — `guide` is screened only by the weak regex, then interpolated raw into the system prompt (`ops-instruction.js:98`) |
| 5–6 | XSS via chat / markdown link | stopped — DOM built with `textContent`; markdown drops URLs |
| 7 | PII smuggled in project-state readouts | stopped — `sanitizeProjectState` screens strings |
| 8 | Model emits `https://…` | stopped (`screenOutput`) |
| **9** | **Model emits a naked domain (`google.com`)** | **FAILED** — output net required http(s)/www |
| **10** | **"format c:", "rm -rf", "wipe the drive"** | **FAILED** — destructive phrasings not matched |
| 11 | Force a disabled tool via fenced JSON | stopped — `gatedValidate` + `buildTools` op gate |
| 12 | Key leak via provider error | stopped — Pass-1 `scrubSecrets` |

## Findings

| # | Sev (agent) | Verdict | Location | Issue | Action |
|---|---|---|---|---|---|
| F1 | HIGH | **[V]** | `server/filter.js:8,9,15` | Jailbreak synonyms + destructive-command phrasings bypassed the regexes; `manifest.guide` (`ops-instruction.js:98`) rides into the system prompt behind this same weak screen. | **FIXED** — broadened the rule-override pattern (ignore/disregard/forget/override/bypass … rules/instructions/prompt/system/guidelines) and added `format c:`, `rm -rf`, `wipe the drive`, `delete system32`, `factory reset`. |
| F2 | MEDIUM | **[V]** | `server/filter.js:30` | Output URL net only caught `http(s)://`/`www.` — naked domains, protocol-relative `//host` and `ftp:`/`ws:` slipped through. | **FIXED** — broadened `OUTPUT_URL` to schemes + `//host` + naked common-TLD domains. |
| F3 | MEDIUM | **[V] but LOW impact** | `server/manifest-sanitize.js:73` → `ops-instruction.js:98` | Confirmed: `manifest.guide` (≤700 chars) is `screen()`ed then interpolated into the system prompt. | **Mitigated by F1** (the screen now catches the synonym jailbreaks). Residual impact is low: the gateway is stateless/unauthenticated, so a forged guide affects only the forger's own turn, and output is still screened. No separate code. |
| F4 | LOW | **[V]** | `server/turn.js:44` | `secretValues` skipped keys < 8 chars, so a short explicitly-supplied BYOK key was not scrubbed. | **FIXED** — an explicit BYOK key is now scrubbed regardless of length; env values keep the ≥8 guard. |
| — | open Q | **[V] known** | `server/turn.js` / worker | No server-side rate limit on `/api/turn` (only the deployment brake). | Already documented in `server-pii-audit.md` (F2, Pass 1). No change. |

## Strengths the red-team reconfirmed

- **XSS is structurally impossible:** `kid-markdown.js` yields data, never HTML; `buddy.js` builds
  DOM with `createElement`/`textContent`; markdown links drop the URL entirely.
- **Statelessness kills cross-tenant bleed:** transcript/spend/model pick are client-ferried; no
  server session to poison.
- **Action whitelisting holds on both paths:** the SDK tool loop never registers a disabled op, and
  the JSON-fallback path re-checks `enabledOps` + `validateAction`.
- **Honest read-only checks:** no approval card for a look; the unvetted `kind` field never enters
  the prompt.

## Open questions handed back

1. **Model alignment:** `filter.js` is explicitly "spike-grade". Is the deployment also routing to
   safety-tuned models, or is the regex the sole output defense?
2. **Budget tampering:** `client/buddy.js` keys the day budget in `localStorage`; a child editing it
   resets their own budget (the deployment brake is the server backstop). Accepted for age ~10.
3. **Rate limiting** on `/api/turn` (see F2/known above).

## Calibration tally

4 findings → 3 [V] fixed (F1, F2, F4), 1 [V] mitigated-and-documented (F3). Gemini's red-team was
directionally accurate (it correctly identified the weak-filter root cause) but inflated severities
(F1 HIGH → the filter is one of several layers; F3 MEDIUM → self-affecting only). Verify-first holds.
