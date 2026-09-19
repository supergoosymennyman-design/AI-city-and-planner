# P5 AI Coding Buddy

A kid-facing companion that helps a child tune **their project's own numbers** — a mock image
classifier today (**Recycle-Eye**: foil vs. can), an if-then reflex course tomorrow
(**Reflex-Wiring**), or any future P5 project that hands the buddy a small **manifest** — running
on the buddy's OWN thin engine, a Vercel AI SDK `streamText` tool-loop we own outright, not a
third-party agent runtime. The child names their buddy, chats with it, and the buddy reads the
project's real numbers (via the manifest), diagnoses the problem, and proposes ONE of 7 generic,
manifest-validated **verbs** at a time. The child taps **[Do it]** or **[No thanks]** — nothing ever
changes without that tap.

## What this is

- **A project** — any small, deterministic, buildless HTML/JS/CSS panel that owns its own state and
  hands the buddy a **manifest** declaring what it is and what may be touched
  (`logic/projects/*.js` + the shared `logic/project-state.js`). Two ship in this demo:
  **Recycle-Eye** (`client/index.html` + `client/champion.js`, full-page — a mock classifier
  simulating accuracy/threshold/class-counts) and **Reflex-Wiring** (`client/mock-project.html` +
  `client/mock-project.js`, the buddy lives in a floating bubble here — an if-then rule course).
  Neither runs real ML/physics; each models the *shape* of real behavior (see "The project
  manifest" below) so the propose → approve → apply loop is demonstrable on any project.
- **The buddy** — a persona (`server/memory/Setting.md`) driving the model engine's tool-loop
  (`server/engine.js`). It can propose exactly 7 generic, manifest-validated verbs and nothing
  else: `setParam`, `createGroup`, `addItems`, `removeItems`, `runCheck`, `undoLast`,
  `rememberUser`. WHAT a verb may touch (which setting, which collection, which check) is declared
  **per-project** by that project's own manifest — the buddy itself carries no project-specific
  vocabulary, so the same buddy coaches Recycle-Eye and Reflex-Wiring unchanged. There is no
  file/shell/network tool anywhere in its tool map — safety here is by construction (a small fixed
  capability surface), not by a sandbox restraining a general-purpose agent.
- **The gateway** (`server/gateway.js` + `server/turn.js`) — the one trust boundary. It holds the
  model credential (the browser never talks to the model directly), screens the child's input AND
  the model's output through a kid-safety filter, and streams the reply to the browser as NDJSON.
  `gateway.js` is transport only (listen, route, parse, pipe frames); `turn.js` composes each
  request into a self-contained local (**the Scope Law** — see
  [`docs/superpowers/specs/2026-07-26-buddy-scope-law-design.md`](../../docs/superpowers/specs/2026-07-26-buddy-scope-law-design.md)),
  so two children's turns can never see or clobber each other. There is no server-held conversation
  and no per-lesson spend cap anymore — see "Per-child by construction" below.
- **The mountable chat core + bubble widget** — `client/buddy.js` (`BuddyChat.mount`) and
  `client/buddy-widget.js` (`BuddyWidget.mount`) are THE integration surface a future project app
  drops in — see "Client: mountable chat core + bubble widget" below.

## The project manifest — how the buddy stays project-agnostic

Every host project hands the buddy a small declaration of what it is and what may be touched — the
one concept that lets ONE buddy coach ANY project with no hardcoded, project-specific vocabulary:

```js
{
  projectId: 'recycle-eye',       // /^[a-z0-9-]{1,40}$/ — used in the persona
  title: 'Recycle-Eye',           // kid-facing name (screened, ≤60 chars)
  kidJob: 'teach your champion to sort recycling by material', // one line for the persona (screened, ≤140)
  params:   [{ name: 'threshold', label: 'Unsure line', min: 0, max: 1, step: 0.05 }],  // ≤8
  slots:    [{ name: 'samples', label: 'Photos', grouped: true }],                       // ≤6
  checks:   [{ name: 'trainAndEvaluate', label: 'Train and test' }],  // ≤4 — an arbitrary per-project check id, not a verb; the verb that RUNS it is the generic `runCheck`
  readouts: [{ name: 'accuracy', label: 'Accuracy' }, { name: 'confusions', label: 'Mix-ups' }], // ≤6
}
```

- **params** — tunable *numeric* settings (numeric only this round; enum/choice params are a
  documented future extension, not built).
- **slots** — content collections. `grouped: true` means items live under named groups (e.g. photo
  classes like `foil`/`can`); `false`/absent means a flat item list (e.g. reflex rules).
- **checks** — runnable "prove it" beats (train/test/simulate).
- **readouts** — display-only values the buddy may *see* but never *set* (accuracy, mix-ups, course
  results).

Project **state** mirrors the manifest's own shape (replaces the classifier-only `championState` of
earlier rounds):

```js
{
  params:   { threshold: 0.5 },
  slots:    { samples: { groups: { foil: ['f1','f2'], can: ['c1','c2'] } } },  // grouped slot
         // { rules:   { items: ['r1','r2'] } }                                 // flat slot (Reflex-Wiring)
  readouts: { accuracy: '74%', confusions: 'foil↔can' },   // string|number, screened, ≤60 chars each
}
```

Both the manifest and the state arrive in the unauthenticated `/api/turn` POST body (Fresh Start is a
client act, not its own route — see "Per-child by construction" below) and are sanitized on entry
(`server/manifest-sanitize.js`'s `sanitizeManifest`/`sanitizeProjectState`) before either reaches the
model — invalid entries dropped, counts capped, every kid-visible string screened + length-bounded. Never
throws: a missing/garbage manifest degrades to a minimal empty one (`{projectId:'project',
title:'Project', kidJob:'', params:[], slots:[], checks:[], readouts:[]}` — the buddy still chats;
only `rememberUser`/`undoLast` stay proposable).

### The 7 universal verbs

```
setParam · createGroup · addItems · removeItems · runCheck · undoLast · rememberUser
```

`validateAction(action, manifest)` (`logic/action-schema.js`) is the single source of truth,
imported by the engine's tool loop, the gateway's json-fallback gate, and the browser executor:

| Verb | Shape | Manifest rule |
|---|---|---|
| `setParam` | `{op, name, value:number}` | `name` ∈ manifest.params; `min ≤ value ≤ max` |
| `createGroup` | `{op, slot, name}` | `slot` ∈ manifest.slots **and** grouped; `name` non-empty ≤40 |
| `addItems` | `{op, slot, group?, ids[]}` | `slot` declared; `group` required iff slot grouped; `ids` non-empty strings ≤40 |
| `removeItems` | same as `addItems` | same |
| `runCheck` | `{op, name}` | `name` ∈ manifest.checks (explicit, even if only one) |
| `undoLast` | `{op}` | always valid — the host project implements the undo stack |
| `rememberUser` | `{op, note}` | manifest-independent |

Validation is **structural** (against the manifest declaration); existence against *live* state
(does group "foil" actually exist right now?) is the client executor's job
(`logic/project-state.js`'s `applyAction` + `createProjectHost`) — the same split the
classifier-only schema used before this generalization. The content rule is unchanged too: the
buddy organizes and tunes; it never does the child's own real-world job — `ids` are opaque
references to child-made content, never generated by the buddy itself.

## Architecture at a glance

```
                     same-origin (no browser CORS)
 ┌──────────┐  HTTP   ┌──────────────────────────────────────────────────────────────┐
 │ Browser  │ ───────▶ │  Buddy Gateway (Node, ours) — server/gateway.js :8787         │
 │ (our UI) │ ◀─────── │  transport only: listen, route, parse body, pipe frames       │
 └──────────┘  NDJSON  │                                                                │
   client/*.js         │  server/turn.js — the WHOLE trust boundary, as pure functions:│
   logic/*.js (shared) │    composeTurnContext() → sanitize + resolve model + build the│
                        │    messages array, all as ONE request's locals (no module    │
                        │    state — see "Per-child by construction" below)            │
                        │    runTurn() → engine → screen → exactly one terminal frame  │
                        │                                                                │
                        │  filter.js screens child input AND the model's output         │
                        │  provider.js  → env → AI-SDK model (createOpenAICompatible)   │
                        │  engine.js    → streamText tool-loop, 7 generic verbs ONLY    │
                        │  manifest-sanitize.js → screens the manifest + state          │
                        │  ops-instruction.js → generates the "propose a change" persona│
                        │                 block: verb shapes + THIS project's vocabulary│
                        │  action-fallback.js → fenced-json action insurance for weak    │
                        │                 tool-calling models (screened same as tools)   │
                        │  brake.js     → the ONE mutable module state left: a          │
                        │                 deployment-wide runaway brake (NOT per-child)  │
                        │                                                                │
                        │  on engine-unreachable ──▶ ONE honest sentence, source:'error' │
                        │                             no canned brain, no actions        │
                        └──────────────────────────────────────────────────────────────┘
```

**The gateway is the trust boundary.** The engine itself is deliberately incapable of anything but
the 7 generic verbs — there is no sandbox to configure, no permission list to maintain, no external
process to keep alive: the safety guarantee comes from what the engine's tool map contains, not from
restraining a general-purpose agent after the fact. WHAT those verbs may actually touch is declared
per-project by that project's manifest (see above) — the engine itself hardcodes no project's
vocabulary.

### Per-child by construction (the Scope Law)

There is no server-held conversation. The child's browser carries its own transcript, model choice,
and spend counter in every request (`client/buddy.js`'s `createLesson`, `tests/lesson.test.js`), and
`server/turn.js` composes each `/api/turn`/`/api/tidy-up` call from that request's body into locals
scoped to the function call — no module-level `lesson` object, no shared history array, nothing one
child's turn could leak into or clobber against another's. `brake.js`'s deployment-wide runaway brake is the ONE piece of mutable
state left anywhere in `server/`, and it is deliberately not per-child (see "Budgets, honestly
layered" below) — `tests/scope-law.test.js` pins that as a hard rule. Full rationale + the leak this
replaced: [`docs/superpowers/specs/2026-07-26-buddy-scope-law-design.md`](../../docs/superpowers/specs/2026-07-26-buddy-scope-law-design.md).

**Three routes, and only three:**

| Route | Job |
|---|---|
| `POST /api/turn` | Streams one chat turn as NDJSON. Body carries the child's transcript, manifest, project state, model choice, and memory (persona/notes) — everything the request needs, since the server keeps none of it between calls. |
| `POST /api/tidy-up` | Summarizes the client-carried transcript into one line (manual compaction); returns the summary so the client can swap its own transcript for it. The server stores nothing. |
| `GET /api/model` | Returns the model picker list (gated by which provider keys the deployer set) plus `spendCap` — the number the CHILD'S BROWSER enforces against its own day-keyed spend counter (see below). |

**Fresh Start is a client act**, not a route: `client/buddy.js`'s `freshStart()` clears the page's
own transcript locally, re-takes the lesson-start project snapshot, and sends a normal `/api/turn`
with a synthetic "greet them" message — there is no dedicated Fresh Start route at all (it, and the
old POST-based model-switch route, were both deleted; only the three routes above remain). Similarly,
picking a model just changes what the client sends as `model` on the next turn — there is no
server-side "current model" to switch.

### Budgets, honestly layered

Three separate spend limits, none of them pretending to be the others (see
[`server/.env.example`](server/.env.example) §3 for the env-var side of this):

1. **The child's own guide (browser).** `GET /api/model`'s `spendCap` (from
   `BUDDY_MAX_TOKENS_PER_LESSON`, default 120000) is enforced entirely client-side by the day-keyed
   Lesson store — it refuses new turns once the day's spend is used up, with a kid-friendly message,
   and resets tomorrow. A guide for the child, not a security boundary: nothing server-side stops a
   hand-crafted request from ignoring it.
2. **The deployment-wide runaway brake (server, `brake.js`).** A high, day-bucketed ceiling
   (`BUDDY_DAILY_BRAKE`, default 2,000,000 tokens/UTC-day/instance) that exists so a curl loop or a
   leaked URL hits a bounded daily limit instead of the deployer's bill — no real child should ever
   reach it (the browser cap above sits ~15x lower).
3. **The wallet (your provider).** The real ceiling is the spend limit on your own provider key, set
   in that provider's own console — this codebase has no visibility into it at all.

**Streaming, safety-by-construction:**
- Every response streams to the browser as NDJSON (`logic/stream-frames.js`): a run of `delta` frames
  followed by exactly one terminal frame, `done` or `cut`.
- `stream-screen.js` gates every streamed character through the SAME kid-safety `screen()` used on
  input, holding back a trailing margin so a flagged phrase split across chunks is never partially
  shown — a flag mid-stream cuts to a safe deflection (`cut`) with no further text and no actions.
- The full accumulated reply is screened again at the end before the terminal `done` frame is built.
- Every proposed action — whether from a real tool call or from `action-fallback.js`'s json-block
  insurance path (for models with weak tool-calling) — is screened individually
  (`action-safety.js`) before it ever reaches the child as a `[Do it]` card.
- The deployment runaway brake (`brake.js`, layer 2 above) refuses new model calls once the day's
  cumulative token spend crosses its ceiling — a kid-friendly "all used up for today" reply, no
  engine call made, everything already learned stays safe.
- **If the engine is unreachable before any text streams (bad key, network down, etc.), the buddy
  says so and stops.** One fixed sentence, `actions: []`, `source:'error'`, and the client tells the
  child out loud that the answer did not come from the brain they picked. There is deliberately NO
  offline fallback brain: a `model-stub.js` used to answer in the model's place, and on 2026-07-29 it
  was caught fabricating a diagnosis AND a `[Do it]` card with invented item ids after a pasted key
  was refused. It was deleted rather than made more honest — any canned brain speaking in the buddy's
  voice is a lie a child cannot detect, and what an AI actually is happens to be the subject we teach.
  (A host with no key of their own is unaffected: the four curated free models answer without one.)

## Client: mountable chat core + bubble widget

`client/buddy.js` exports `window.BuddyChat.mount(rootEl, opts)` — the ONE integration surface a
host page needs, and the shape a future project app drops in. It builds the buddy's ENTIRE chat DOM
inside `rootEl` (no page-global ids — a widget panel can host a second copy of this DOM with no id
collisions) and wires the chat loop to the host's own project adapter:

```js
window.BuddyChat.mount(rootEl, {
  manifest,           // the host project's manifest (sent with every /api/turn)
  getState,           // () => projectState — read fresh on every send
  apply,              // (action) => {ok, note} — executes a kid-approved [Do it] card
  gatewayUrl,         // optional base ('' = same-origin, the default)
});
```

`client/buddy-widget.js` wraps the SAME contract as a floating bubble:

```js
window.BuddyWidget.mount({ manifest, getState, apply });  // same opts shape as BuddyChat.mount
// → { open(): void, close(): void }
```

A fixed bottom-right launcher (≥44px tap target, `aria-expanded`, Escape closes) opens a slide-up
panel that lazily `BuddyChat.mount`s into itself on first open — so a host page pays nothing for the
chat core until the child actually opens the bubble.

Both demo pages get their project adapter from the SAME shared engine —
`logic/project-state.js`'s `createProjectHost(project)`. It owns the current state (closure, not
exposed by reference), an undo stack (backing `undoLast`), and subscriber callbacks, so a project
definition (`logic/projects/recycle-eye.js`, `logic/projects/reflex-wiring.js`) only ever declares
`{manifest, initialState(), checkHandlers}` and never manages its own state or undo history:

- **`client/index.html` + `client/champion.js`** — Recycle-Eye, full-page: the champion side panel
  is **host UI** (`champion.js` owns the state + renders the panel), chat mounts full-screen via
  `BuddyChat.mount`.
- **`client/mock-project.html` + `client/mock-project.js`** — Reflex-Wiring, a presentable "future
  project app" mock editor (reaction-speed slider, if-then rules list with add/remove, "Try the
  course" button + result readout). The child's OWN controls call `host.apply()` directly — no
  `[Do it]` card; cards are only for BUDDY-proposed actions arriving through the chat.
  `BuddyWidget.mount` floats in the corner sharing the SAME `host.apply`/`getState` the direct
  controls use, so a buddy-approved card and the child's own slider/rule edits push onto ONE
  coherent undo stack.

## Run steps

One process — the engine runs in-house, in the same Node process as the gateway:

```bash
cd "web/coding agent/server" && npm install
npm start
```

**Use `npm start`, not `node gateway.js`.** The start script is
`node --env-file-if-exists=.env gateway.js` — a bare `node gateway.js` does **not** read `server/.env`,
so every key you put there is silently ignored and the picker shows only the four no-key models. (Set
the vars in your shell instead if you prefer; the flag is only about the file.)

### Changed a file? Whether you need to restart depends on WHICH file

Node loads `server/*.js` into memory once, at boot. Nothing in this repo watches or reloads them.

| You changed | What to do |
|---|---|
| `client/*`, `logic/*`, CSS, HTML | **Just refresh the browser.** These are served per-request. |
| **`server/*`** | **Restart the gateway** (Ctrl-C, `npm start`). A refresh will NOT pick it up. |
| `server/.env` | Restart — it is read once at boot. |

**Why this is worth its own section:** the failure is silent and reads like a broken fix. Edit a
server file, refresh, and the page loads your NEW client code while the gateway keeps answering from
the OLD server code — so you are looking at two halves of the app on two different versions, with
nothing on screen saying so. This cost a real debugging round-trip on 2026-07-29: an offline-fallback
bug was fixed, tested green, and still reproduced in the browser, purely because the gateway from two
days earlier was still running. If a server-side change "did nothing", check this first.

To be certain which process is serving you, on Windows:

```bash
netstat -ano | grep ":8787" | grep LISTENING     # -> the PID answering on that port
```

- **http://localhost:8787** — the Recycle-Eye Lab (full-page buddy chat)
- **http://localhost:8787/mock-project.html** — the Reflex-Wiring mock editor (buddy lives in the
  floating bubble, bottom-right)

Same gateway, same buddy persona, same 7 verbs — only the manifest each page hands the buddy
differs. Browser↔gateway is same-origin (the gateway serves the client too), so there is no CORS.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `BUDDY_MODEL_URL` | see `DEFAULT_BASE_URL` in `server/provider.js` | OpenAI-compatible base URL for the model provider. The one counsel-swappable external endpoint default in this codebase — a district/teacher-provided model swaps in purely via env, no code change. |
| `BUDDY_MODEL_ID` | `deepseek-v4-flash-free` | Model id requested from that endpoint. |
| `BUDDY_MODEL_KEY` | *(unset)* | API key, if the configured endpoint needs one. The default endpoint above currently answers without a key. |
| `BUDDY_MODEL_CONTEXT` | `200000` | The model's context-window size in tokens, backing the Memory Meter's usage percentage. Set to `0` for an honest "unknown" (the meter hides the percentage bar but still shows real token counts). |
| `BUDDY_MAX_TOKENS_PER_LESSON` | `120000` | The child's own per-DAY chat budget, advertised via `GET /api/model`'s `spendCap` and enforced entirely in the CHILD'S BROWSER — a guide, not a security boundary (spend layer 1 of 3; see "Budgets, honestly layered" above). |
| `BUDDY_DAILY_BRAKE` | `2000000` | The deployment-wide runaway brake (`server/brake.js`), tokens per UTC day per instance — abuse protection, not the wallet (spend layer 2 of 3). Blank = default; `0` = deliberately disabled; garbage refuses to boot. |
| `BUDDY_ENABLED_OPS` | *(all 7)* | Comma-separated whitelist of buddy verbs (`setParam`, `createGroup`, `addItems`, `removeItems`, `runCheck`, `undoLast`, `rememberUser`). Blank = all enabled. |
| `BUDDY_PORT` | `8787` | Port the gateway listens on (loopback only). |
| `BUDDY_HOST` | `127.0.0.1` | Interface to bind. The loopback default is safe for a laptop; a real deployment behind a platform proxy sets `0.0.0.0` deliberately. |
| `BUDDY_MEMORY_DIR` | `server/memory` | Where the baked default persona/notes **seeds** are read from at boot. The gateway never writes here — a child's own memory travels in their champion file. |
| `OPENROUTER_API_KEY` | *(unset)* | Unlocks the built-in OpenRouter options (see below). One key reaches hundreds of models. |

**A copy-paste template lives at [`server/.env.example`](server/.env.example)** — `cp server/.env.example server/.env` and fill in only what you have.

## Model options — what the child can pick

The menu is built by `effectiveRegistry` (`server/model-registry.js`) and is the **same list** that
backs both the picker (`GET /api/model`) and the `model` id every `/api/turn` request is resolved
against (`server/turn.js`'s `resolveRequestModel`), so a child can never select — and a hand-crafted
request can never reach — anything outside it. Three tiers, in picker order:

1. **Always available, no key** — the four curated free models (`MODELS`: Zippy, Mimo, Nemo, North)
   on the default endpoint. This is what you get with an empty `.env`.
2. **Provider-gated options** (`KEYED_MODELS`) — a provider's models appear the moment its key is
   supplied, and **all of them at once**. Endpoint + credential live on the provider (`PROVIDERS`),
   not on each model, so adding a second model from a vendor is one line:

   | Provider | Enable with | Adds |
   |---|---|---|
   | OpenRouter | `OPENROUTER_API_KEY` | Free Router · GPT (latest) · Claude Opus (latest) · Gemini 3.5 Flash |
   | DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek V4 Flash · DeepSeek V4 Pro |
   | Alibaba Model Studio | `DASHSCOPE_API_KEY` **+** `ALIBABA_BASE_URL` | Qwen Plus |

   Unset providers are hidden from the menu **and** refused by the server — nothing a child can tap is
   able to 401 mid-lesson. A blank `OPENROUTER_API_KEY=` does not count as supplied. Alibaba needs the
   URL too because theirs embeds your own workspace id and region, so no default can be shipped.
3. **Anything else, via env** — `BUDDY_MODEL_URL` + `BUDDY_MODEL_ID` + `BUDDY_MODEL_KEY` point the
   buddy at *any* OpenAI-compatible provider, including vendors not listed here; the id appears in the
   picker as a teacher-configured entry. Verified URLs for the common cases are in
   [`server/.env.example`](server/.env.example) — including **Ollama** (`http://localhost:11434/v1`)
   and **LM Studio** (`http://localhost:1234/v1`) for running a model on the school's own hardware,
   where nothing leaves the building and there is no per-message cost.

**Models are named honestly.** The picker shows the real model name, the raw id, *who made it*, and a
one-line trade-off — "Gemini 3.5 Flash · `google/gemini-3.5-flash` · made by Google · very fast with a
huge memory". No mascot names: this product teaches AI literacy, so a child should read that models
come from companies and differ from each other. `maker` is omitted rather than guessed where we could
not verify the attribution.

**We ship no keys.** A model behind a key bills that key's owner, so which (if any) to enable is the
deployer's call. `BUDDY_MAX_TOKENS_PER_LESSON` is the child's own per-day spend guard, enforced in
their browser — see "Budgets, honestly layered" above for the other two spend layers.

**Model ids churn** — the curated free list lost one in a single day. Two checks, deliberately split:

```bash
# Does every concrete slug still EXIST? Public model list, NO API key — safe in CI / fresh checkout.
node server/scripts/check-openrouter-slugs.mjs

# Does a model actually ANSWER with your key? Spends a real completion — run before a lesson.
node server/scripts/verify-models.mjs
```

The registry prefers ids that **cannot** rot — `openrouter/…` routers and `~author/model-latest`
aliases — so the rot-check has little to do; `isStableModelId` marks those and the script skips them.
Reach for a concrete `author/model` slug only when no alias is documented for that family.

## Bring your own key

Anyone using the buddy — teacher or child, on their own device — can unlock a paid model without the
deployer ever setting a server-side key. The picker always shows the full curated menu: models with
no key anywhere (server-side or device) appear dimmed and locked, labeled with which provider's key
would unlock them, e.g. `GPT (latest) · OpenAI · needs an OpenRouter key`. Tapping a locked model
opens a small sheet asking for that provider's key.

**Where the key lives.** A pasted key is written to THIS DEVICE's `localStorage`
(`buddy.key.<providerId>`) and nowhere else. It rides every `/api/turn`/`/api/tidy-up` request from
this device as `providerKey` + `modelProvider`; the server uses it once, for that one upstream call,
and never writes it to disk or a log (`tests/byok-key-hygiene.test.js` pins this). Messages sent
through that model bill the key's own account — exactly like pasting a key into any other AI coding
tool.

**"Your keys"** (a menu row) lists every provider with a device key, masked to its last 4 characters,
each with a **Remove** — removing re-locks that provider's models on this device only.

**"Add any model"** (tucked away in the menu) lets a device holder type any model id their key can
reach (an OpenRouter slug, say). A typed model always rides THIS DEVICE's own key, never a
server-side env key — even when the same provider is already env-unlocked for everyone.

**Use a budget-capped key in class** — an OpenRouter key can be created with a USD `limit` and a
`limit_reset` of daily/weekly/monthly (verified 2026-07-27 from OpenRouter's docs), so the worst case
on a shared device is bounded. (No other vendor's key-capping feature is claimed here.)

A hosted gateway must sit behind HTTPS — keys ride every request. Localhost development is exempt.

## Testing

```bash
cd "web/coding agent" && node --test
```

All offline — every module (`provider.js`, `engine.js`, `turn.js`, `brake.js`, `action-fallback.js`,
`action-safety.js`, `stream-turn.js`, `stream-screen.js`, `filter.js`, `manifest-sanitize.js`,
`transcript-sanitize.js`, `note-validate.js`, `static-path.js`, `route-static.js`, `meter.js`,
`config.js`, `model-registry.js`, `memory.js`, `ops-instruction.js`,
`tool-summary.js`, `command-parse.js`, `action-schema.js`, `kid-markdown.js`, `stream-frames.js`,
`project-state.js`, `client/buddy.js`'s `createLesson` (`tests/lesson.test.js`), and the project
definitions in `logic/projects/`) is unit tested with injected fakes / hand-rolled `LanguageModelV2`
mocks — no network, no key, no live model call anywhere in this suite. A handful of gateway-flow
tests (`gateway-turn-route.test.js`, `gateway-memory-payload.test.js`, `stateless-loop.test.js`,
`remember-action.test.js`, `isolation-interleave.test.js`, `scope-law.test.js`, and the
`deleted-*-routes` / `no-audit` route guards) drive `gateway.js` itself end-to-end with a fake or
forced-offline model, over a real (loopback) HTTP request. `stateless-loop.test.js` is the standing
proof that a full `/api/turn` writes **zero** files to `BUDDY_MEMORY_DIR`; `scope-law.test.js` pins
`brake.js` as the only mutable module state anywhere in `server/`; `isolation-interleave.test.js` is
the regression for the correctness leak the Scope Law refactor fixed (two children's turns,
deliberately interleaved, must not validate against or answer with each other's project).

## Tool-call reliability eval

```bash
node server/scripts/eval-toolcalls.mjs
```

Runs 16 fixed, action-shaped prompts (4 each across the 4 verb families a child's own words would
plausibly trigger — `createGroup`, `addItems`/`removeItems`, `setParam`, `runCheck`) against the
**Recycle-Eye** manifest, through the SAME real wiring the gateway uses (`turn.js` + `engine.js`
+ `action-fallback.js` + the SAME generated "propose a change" persona block from
`server/ops-instruction.js` + the SAME system prompt base from `server/memory/Setting.md`), and
tallies whether each turn produced a real tool-call action, a json-fallback action, or neither. It
is a measurement tool, not a pass/fail gate — there is no "correct" count; a model's reliability is
exactly the honest thing it reports. Needs no setup against the default endpoint (see the env table
above); point `BUDDY_MODEL_URL`/`_ID`/`_KEY` at a different provider to evaluate a swap.

## Live verification

### Tool-call reliability (16-turn eval)

Run of 2026-07-21 against the default free endpoint, using the Recycle-Eye manifest and the 7
universal verbs (this task's own re-verification of `server/scripts/eval-toolcalls.mjs` after the
verb rename — see the script for the exact prompts):

```
  #  type                 terminal  tool  fallback  kind
  1-4   createGroup        done      0     1 each   fallback
  5-8   addRemoveItems     done      0     1 each   fallback
  9-12  setParam           done      0     1 each   fallback
  13-16 runCheck           done      0     1 each   fallback

  totals: tool-call: 0   json-fallback: 16   none: 0   error: 0
```

**Reading:** the free model never native-tool-calls (0/16, consistent with every prior measurement
across this project, back to the 6-op classifier-only vocabulary), but the JSON-action fallback
recovered a valid, schema-checked verb action on **16/16 turns** — the `[Do it]` card feature is
currently carried entirely by the fallback, and that stays true after the verb rename: the
fallback path is manifest-aware (`gatedValidate`/`boundValidateAction` close over the live
manifest) exactly like the real tool-call path. A paid/tool-capable model can be evaluated by
re-running this script with `BUDDY_MODEL_URL`/`_ID`/`_KEY` pointed at it.

### Historical: pre-verb-rename browser drive (2026-07-20)

*Captured before the universal-projects round renamed the 6 champion ops (`createClass`,
`addSamples`, `removeSamples`, `setConfidenceThreshold`, `trainAndEvaluate`, `rememberUser`) to the
7 generic verbs described above. Kept for provenance that the underlying streaming / action-card /
Tidy Up / Fresh Start / spend-guard machinery was proven live at least once on the classifier-only
precursor; a full live re-tour of the CURRENT two-page + bubble-widget build (both projects, undo,
verb-toggle hot-apply) is the pending "Final" step in
`docs/superpowers/plans/2026-07-21-p5-buddy-universal-projects.md`, not part of this task.*

- **Streamed turn:** token-by-token deltas rendered in the child's bubble; markdown (bold, lists)
  rendered as real DOM; no raw JSON was ever visible mid-stream (the action channel stayed
  invisible to the child).
- **Action card:** an add-samples-style ask produced a `[Do it]`/`[No thanks]` card via the JSON
  fallback (the model's native tool-calling did not fire, 0/16 in the same session's eval); tapping
  `[Do it]` applied it — the champion panel updated live with a "Done!" confirmation, and the audit
  log recorded `proposed` then `applied`.
- **Tidy Up:** meter dropped from ~3084 to ~1114 tokens (a real one-shot summarize call, counted
  against the cap).
- **Fresh Start:** chat cleared, the "I still remember you — that's my memory files, not the chat"
  reveal showed, meter re-based to ~1478 tokens (≈ the injected memory files) — durable-vs-ephemeral
  memory demonstrated.
- **Streaming latency:** warm turns began rendering in roughly 2–4 seconds and streamed steadily
  thereafter, at `$0.0000` cost on the free tier.

### Spend-cap behavior (historical, pre-Scope-Law)

*Captured before the Scope Law refactor moved the child's budget to the browser and demoted the
server-side cap to `brake.js`'s deployment-wide runaway brake — see "Budgets, honestly layered"
above for the current three-layer model. Kept for provenance only; do not read this as today's
behavior.*

Tripped live with `BUDDY_MAX_TOKENS_PER_LESSON=1` (then still a server-enforced per-lesson cap): the
first turn ran, then every model-calling endpoint refused — `/api/turn` returned one kid-friendly
capped `done` frame, the since-deleted server-side Fresh Start endpoint still cleared the chat but
withheld the model greeting, `/api/tidy-up` returned the current meter untouched. Today the equivalent server-side
proof is `tests/brake.test.js` (the deployment brake trips and recovers on a UTC day roll) plus
`tests/lesson.test.js` (the child's own day-budget refusal, entirely client-side). The capped
message still does NOT promise that Fresh Start restores the budget — that stays true both before
and after this refactor.

## Agent console

The app exposes a command palette (triggered by `/` in the chat input) offering four slash commands
— real coding-agent vocabulary the child learns and transfers outside this lesson:

- **`/clear`** — Fresh Start (a client-side act: wipes this page's own chat transcript, keeps the
  durable champion memory)
- **`/compact`** — Tidy Up (summarizes this page's transcript to reduce token spend, holds durable
  memory)
- **`/model`** — switch the AI brain to a different verified free model
- **`/help`** — show the command palette

The friendly UI buttons (Fresh Start, Tidy Up, etc.) run these same commands — one execution path,
two UI surfaces. When executed, commands echo into the chat log as `> /command` lines so the
transcript reads like an agent session.

### Curated model picker

The `/model` command reaches a server-side whitelist (`server/model-registry.js`) curating verified
free models. The picker is necessary because the underlying free-model endpoint's `/models` listing
includes models that fail live: a listed model threw a credits error mid-session; another was listed
as "supported" one day and "not supported" the next. The free list **churns frequently**.

Verification is a required pre-classroom step:

```bash
node server/scripts/verify-models.mjs
```

This script runs a short action-shaped prompt through each listed model on the SAME real wiring the
gateway uses, exiting 1 if any fails. The verified output is safe to ship; unverified output should
NOT be trusted.

**Switch semantics:** the conversation (the child's own browser-carried transcript) and the day's
spend so far survive a switch (like a real agent) — both live client-side, so there is nothing
server-side to reset. The meter's context-window limit follows the new model (configured via
`BUDDY_MODEL_CONTEXT`; set to `0` for an honest "unknown").

### Visible tool calls

The stream carries additive `{type:'tool', op, summary, source}` frames. When a tool call fires, the
child sees `● Set Unsure line to 0.6 — waiting for your OK` appear mid-reply (for native tool
calls) or at reply-end (for JSON-fallback actions), then flip to `✓ done` or `✗ skipped` when the
`[Do it]`/`[No thanks]` card resolves. `summary` is generated per-verb from the LIVE manifest
(`server/tool-summary.js`'s `toolSummary(action, manifest)`), so it reads in that project's own kid
labels ("Unsure line", "Photos") rather than a raw verb/field name. This is display-only — the card
remains the ONLY approval path, and every summary is screened server-side before it reaches the
child.

### UI restyle (deferred)

A terminal/TUI visual restyle is held for now (owner decision, functionality-first). The current web
UI is stable and testable; visual polish is a follow-up once the model + agent-console reliability is
locked.

## Team demo bundle

The gateway + client + logic modules can be packaged as a sendable, self-contained team demo:

```bash
node scripts/pack-buddy-demo.mjs
```

Creates `dist/buddy-demo.zip` (or `--fat` with `node_modules` included) containing `client/`
(both demo pages — Recycle-Eye's `index.html` + Reflex-Wiring's `mock-project.html`, plus the
bubble widget and shared chat core), `logic/` (including both `logic/projects/*.js` project
definitions — `copyDir` recurses, so new files ride along with no script change needed), `server/`,
and `DEMO.md` — a guided tour at the bundle root. The memory ships freshly seeded (never a real
child's notes): `User.md` and `Champion.md` reset to empty defaults, `Setting.md` and the rest of
the code tree copy as-is. A teammate can unzip, run `cd server && npm install && npm start`,
and immediately see the demo flow described in `DEMO.md`. Re-run this script after changing any file
in `web/coding agent/` to keep the distributed bundle in sync — it is a generated build artifact, not
hand-edited, and `dist/` is gitignored.

## Known limitations

- **Spike-grade content filter.** `server/filter.js` is a small pattern list (personal-info asks,
  jailbreak phrasing, "run a command") run on both input and output — real coverage for a shipped
  product needs a proper classifier or a maintained blocklist service, not 4 regexes.
- **Simulated projects, not real ML/physics.** Recycle-Eye's `logic/projects/recycle-eye.js`
  `estimateAccuracy` is a deliberately simple formula (balance + volume → accuracy); `runCheck`'s
  `trainAndEvaluate` handler is a mock state transition, not a real training run. Reflex-Wiring's
  `testRun` handler is likewise a deterministic stand-in ("hazards covered by a rule → gates
  cleared"), not a real simulation.
- **No authentication** on `/api/turn` — bounded body size, the child-side day budget, and the
  deployment runaway brake are the only defenses against abuse today (fine for a spike behind
  `localhost` or a single classroom URL, not for an exposed deployment with no class code). This is
  the one gap the Scope Law spec names as still open (§7's "known gap, stated not implied") — a
  class code is the follow-up that closes it.
- **Per-child isolation is now real, not a limitation.** (Historical note: earlier builds of this
  gateway ran one `lesson` singleton in module scope, so two children on the same running process
  shared one buddy's history AND one `Champion.md` — a real privacy AND correctness leak. The Scope
  Law refactor (`docs/superpowers/specs/2026-07-26-buddy-scope-law-design.md`) deleted that
  singleton: every `/api/turn` is composed from ONLY that request's body, and
  `tests/isolation-interleave.test.js` interleaves two children's turns through the real gateway to
  prove neither can see the other.)
- **`unhandledRejection` isn't caught**, only `uncaughtException` — a stray fire-and-forget promise
  without a `.catch()` would still crash the process under Node's default behavior. A one-line
  follow-up, not currently known to be triggered by any code path here.
