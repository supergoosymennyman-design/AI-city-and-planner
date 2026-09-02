# P5 AI Coding Buddy — Team Demo

## 1. What this is

A kid-facing coding buddy that teaches a 10-year-old what it feels like to work *with* an AI agent:
they name their buddy, chat with it in plain English, and watch it read their project's real
numbers — a "champion" photo classifier on one page, an if-then reflex course on another — propose
one tuning action at a time, and wait for a tap before anything changes. The SAME buddy hosts both
projects: it carries no project-specific vocabulary of its own, only 7 generic verbs, and learns
each project's real settings/collections/checks from a small **manifest** the host page hands it.
The chat, tool-proposals, and streaming all run on our own in-house engine (a small tool-loop we own
outright) rather than any third-party agent runtime. Safety here is by construction, not by policy:
the engine's tool map contains exactly seven whitelisted, manifest-validated verbs
(`setParam`/`createGroup`/`addItems`/`removeItems`/`runCheck`/`undoLast`/`rememberUser`) and nothing
else — no file, shell, or network tool exists anywhere in this build for a jailbreak to reach.

## 2. Quickstart

Requires **Node ≥ 20**.

**Default zip** (no `server/node_modules` inside — install once):

```bash
cd server
npm install
npm start
```

**Fat zip** (`node_modules` already inside — nothing to install):

```bash
cd server && npm start
```

`npm start` runs `node --env-file-if-exists=.env gateway.js`. Start it with a bare `node gateway.js`
and `server/.env` is **not** read, so any API keys in that file are ignored and the model picker shows
only the four no-key models.

Either way, once the gateway logs that it's listening, open:

- **http://localhost:8787** — the kid app: **Recycle-Eye Lab** (full-page buddy chat)
- **http://localhost:8787/mock-project.html** — **Reflex-Wiring**, a second mock project page; the
  SAME buddy lives here in a floating bubble (bottom-right) instead of full-page

The gateway serves both from one process on `localhost` only — no separate frontend build, no
CORS, nothing else to start.

## 3. The guided tour

Work through these in order in one browser tab (kid app).

1. **Name the buddy.** On first load you're asked to name your buddy — type any name and confirm.
   The buddy greets you by the name it just learned, and by yours if you gave one.
2. **Type `/` in the chat box.** A command palette pops up over the input — this is the buddy's
   *agent console*: the same slash vocabulary a real coding agent uses (`/clear`, `/compact`,
   `/model`, `/help`), not a kid-only toy command set.
3. **Run `/help`.** Shows the four commands and what each does. Notice it echoes into the chat log
   as `> /help`, the way a real agent session transcript would.
4. **Ask it to do something:** *"I took two new foil photos, foil-a and foil-b — add them and
   train!"* Watch the reply stream in token-by-token. Partway through (or at the end, depending on
   the model), a line prefixed **●** appears — e.g. `● Add 2 to foil (Photos) — waiting for your
   OK` — with **[Do it]** / **[No thanks]** buttons. That line is the buddy *proposing* an `addItems`
   change (the verb's summary is built from Recycle-Eye's own manifest labels — "Photos" is that
   project's label for its samples slot); the champion panel doesn't move until you tap.
5. **Tap [Do it].** The champion's foil count updates live and the tool line flips to `✓ done`.
   Nothing about this step touched the model again — applying is a local, deterministic state change.
6. **Run `/model`.** Pick a different verified brain from the picker (e.g. switch from the default to
   another curated model) mid-conversation. Keep chatting — the conversation history and the day's
   token budget both survive the switch (both live in YOUR BROWSER now, not the server, so switching
   brains can't reset either), same as a real agent letting you swap models without losing context.
7. *(Optional)* **Trip the child's spend budget.** This budget is enforced entirely in YOUR BROWSER
   now (the day-keyed Lesson store in `client/buddy.js`), not on the server — the server only
   advertises the number via `GET /api/model`'s `spendCap`. Stop the gateway, restart it with a tiny
   budget, and chat until it refuses:
   ```powershell
   $env:BUDDY_MAX_TOKENS_PER_LESSON = "8000"; npm start
   ```
   **Reload the browser tab after restarting the gateway** — `spendCap` is fetched once, at lab
   start (`loadModel()`), so a tab left open from step 1 keeps the OLD budget until you reload it.
   A few turns in you'll get the kid-friendly "all used up for today" reply instead of a model call
   — no request even reaches the server — and the champion state you already built stays exactly as
   it was. (There's a second, higher spend layer you'd need a curl loop to ever hit: the
   deployment-wide `BUDDY_DAILY_BRAKE` runaway brake in `server/brake.js`, ~15x this budget by
   default — abuse protection, not something a real child's own use should reach.)
8. **Open a second project: `http://localhost:8787/mock-project.html`.** This is **Reflex-Wiring**
   — a mock "future project app" (a reaction-speed slider, an if-then rules list, a "Try the
   course" button). There's no full-page chat here; instead a round bubble sits bottom-right.
   Click it — the SAME chat core slides up in a panel (`BuddyChat.mount`, the identical code that
   just ran full-page on the Recycle-Eye tab). Name your buddy again (a fresh page = a fresh
   lesson) and ask it something about the course, e.g. *"the course keeps failing at the dark
   tile — can we react faster?"* Watch it propose a `setParam` change to **Reaction speed** — the
   exact same verb you may have seen propose a change to **Unsure line** on the Recycle-Eye tab.
   One buddy, one verb set, two completely different projects — because the vocabulary
   ("Reaction speed" vs. "Unsure line", "rules" vs. "photos") comes from each page's own manifest,
   never from the buddy.
9. **Undo — shared with your own edits.** Still on the Reflex-Wiring tab, close the bubble and add
   a rule **yourself**, by hand: type something like *"if dark then use flashlight"* into the
   rules box and click **Add rule**. Now reopen the bubble and ask *"can you undo that?"* The
   buddy proposes `undoLast`; tap **[Do it]** — your hand-typed rule disappears. This proves the
   buddy's undo and the child's own direct edits (the slider, the rules list, the [Try the course]
   button) all push onto **one shared undo history** per project, not two separate ones — tap
   Undo once and it doesn't matter whether the last change came from you or from an approved
   buddy proposal.
10. **Bring your own key.** Back on either tab, open the `/model` picker — a paid model like
    `GPT (latest)` shows dimmed and locked, labeled `needs an OpenRouter key`. Tap it, paste a real
    OpenRouter key into the sheet, and it unlocks right there — chat with it, billed to that key.
    Now open the SAME url in an incognito window: the model is locked again, because the key lives
    only in the first window's `localStorage` and never touched the server.

## 4. Honest notes

- **The free endpoint's model list churns.** A model that answers today can stop working tomorrow (a
  listed model has failed live with a credits error, and another flipped from "supported" to
  "not supported" between two consecutive days in testing). Run `node server/scripts/verify-models.mjs`
  before any session you're demoing live — it's a required pre-flight, not a nice-to-have.
- **The free tier is flaky per request, not just per day.** A single turn can fail even when the
  endpoint is generally up. When that happens the gateway degrades to a clearly **labelled offline
  stub** reply (never a silent wrong answer) — just retry the turn.
- **Per-child by construction, but still unauthenticated.** The gateway holds no conversation
  between requests — each child's browser carries its own transcript, model choice, and spend
  counter, and every `/api/turn` is composed fresh from that one request's body (the "Scope Law";
  `tests/isolation-interleave.test.js` proves two children's interleaved turns can't see each
  other). What's still open: there's no login/class-code, so anyone with the URL can chat — bounded
  body size, the child's own day budget, and the deployment-wide runaway brake (`server/brake.js`)
  are the only defenses against abuse today, not a substitute for real authentication.
- **The model endpoint is external and no key ships in this bundle.** By default the gateway talks to
  a free OpenAI-compatible endpoint over the network; nothing in this zip embeds a credential. If your
  network blocks that endpoint, every turn falls back to the offline stub described above — the demo
  still runs, just without live model replies. A local endpoint (e.g. Ollama) can be pointed at via
  `BUDDY_MODEL_URL`/`BUDDY_MODEL_ID` for a fully offline run.
