# Gemini CLI + Relay Runbook (durable tooling notes)

> How to run the **gemini CLI** through the **catiecli relay** on this Mac.
> Read this whenever a session needs the Gemini CLI for analysis/coding.
> Key file locations are verified and persisted on disk.
>
> **See also `GEMINI-USAGE.md`** — the agent playbook: what Gemini is good/bad at, the
> single-shot `cat -n` mechanism, the mandatory DeepSeek verify-at-`file:line` gate, and the
> `[V]/[A]/[X]` calibration discipline. Read both before driving a pass.

## What "the relay" is

A **remote** OpenAI/Gemini-compatible gateway (David's service) — always on,
nothing to run locally:
    https://catiecli.sukaka.top
- native Gemini protocol: `/v1beta/...`  ← the gemini CLI speaks this
- OpenAI-compatible:      `/v1/chat/completions`
- model list:             `GET /v1/models` OR `/v1beta/models`
- **web management panel / login: `https://catiecli.sukaka.top/login`** — the relay's OWN UI
  (username/password → token, plus optional Discord OAuth + Cloudflare Turnstile; after login
  `/dashboard`, admins also `/admin`). This web login is SEPARATE from the `sk-ant-…` API key in
  `~/.cli-proxy-api/config.yaml`, which is what the gemini CLI uses for inference.

Gemini CLI binary (on PATH): `/Users/kai/.local/bin/gemini` (v0.59.0)

## (1) Authenticate — export these two env vars before ANY gemini run

```bash
export GEMINI_API_KEY="$(grep -m1 'api-key:' ~/.cli-proxy-api/config.yaml | sed -E 's/.*"(sk-ant-[^"]*)".*/\1/')"
export GOOGLE_GEMINI_BASE_URL="https://catiecli.sukaka.top"
```

- The relay key (`sk-ant-…`) is stored ONLY in `~/.cli-proxy-api/config.yaml`
  (chmod 600). Do NOT paste it elsewhere.
- The old `AQ-*` Google key in `~/.zshrc` is DAILY-QUOTA-EXHAUSTED — don't use it.

## (2) Critical auth gotcha (already persisted; re-add if settings.json resets)

`~/.gemini/settings.json` MUST contain:

```json
"security": { "auth": { "selectedType": "gemini-api-key" } }
```

Without it, `GOOGLE_GEMINI_BASE_URL` makes the CLI pick `AuthType.GATEWAY` and
it fails with `Invalid auth method selected.`

## (3) Model IDs available on the relay

- pro   = `gcli-gemini-3.1-pro-preview`   (also `-maxthinking`)
- flash = `gcli-gemini-3-flash-preview`   (also `gcli-gemini-3.1-flash-lite`)

Planning/reasoning → pro. Bulk/simple work → flash.
`~/.gemini/settings.json` already pins the built-in subagents to these IDs.

## (4) Audit subagent (preinstalled)

`~/.gemini/agents/p5-auditor.md` — read-only, golden rules baked in, inherits
the main session model. Invoke with:  `@p5-auditor <task>`

## (5) Smoke test

```bash
cd "/Users/kai/Documents/AI-education-shrink/P5 Programme/buddy-kit/client"
gemini -p "Reply ok" -m gcli-gemini-3-flash-preview --skip-trust
```

Use `--skip-trust` (or set `GEMINI_CLI_TRUST_WORKSPACE=true` once) or headless
mode refuses to run outside a trusted directory.

## (6) Rate limit = 10 requests/min — HARD PACING RULES

- ≥100s gap between agent runs (30s gaps caused 429 retry-storms).
- One bulk `run_shell_command` read per `@p5-auditor` pass, NOT many small
  `read_file` round-trips (each tool round-trip burns a model request).
- Never run passes in parallel. If a run 429s, wait 60–90s before retrying.
- If a single minimal request returns 200, the cap is fine — keep it that way.

## (7) VPN

NOT required for the relay (third-party, no Google geo-block). VPN IS required
only if going back to the AQ Google key directly (HK is geo-blocked by
`generativelanguage.googleapis.com`).

## (8) Optional local proxy — NOT needed for the gemini CLI → relay path

CLIProxyAPI is installed at `~/bin/cli-proxy-api` with config
`~/.cli-proxy-api/config.yaml`, listening on `127.0.0.1:8317`. It may already be
running (it auto-reloads config changes). It only matters if you want an
OpenAI-compatible gateway for OTHER CLIs (Claude Code, Codex, …). After a Mac
reboot, restart it only if needed:

```bash
~/bin/cli-proxy-api --config ~/.cli-proxy-api/config.yaml
```

Otherwise leave it alone.
