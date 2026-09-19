# Integrating the AI Coding Buddy

This is the wiring guide for teams dropping the buddy into their own app. You need a text editor and
about five minutes for the first working version; the rest of this document is the detail behind it.
Everything here is buildless: classic `<script>` tags and plain CSS, no bundler, no TypeScript, no
build step, nothing fetched from a third-party origin.

If you would rather read code than prose, read `client/examples/host-minimal/` — a one-file fake
project wired end to end, short enough to read in one sitting. It is a real page: serve the gateway
and open `http://localhost:8787/examples/host-minimal/`.

---

## 1. What you get

A floating launcher in the bottom-right corner of your page. Tapping it slides up a chat panel where
a child talks to an AI buddy in plain English. The buddy can **read** your project's real numbers and
**propose** one change at a time; nothing changes until the child taps **[Do it]** on the proposal
card.

You supply three callbacks and one declaration. That is the whole integration surface:

- a **manifest** — what your project is, and what the buddy is allowed to touch
- **`getState()`** — read your current values
- **`apply(action)`** — perform one approved change

The buddy carries no vocabulary of its own. It knows seven generic verbs (§4); your manifest is what
turns them into *your* project's settings, collections and checks. Two completely different apps can
host the same buddy build with no forked code.

What lands on your page: one `<script>` tag, two stylesheets the loader inserts for you, and two DOM
nodes appended to `<body>` (the launcher and the panel). The chat core is not built until the child
actually opens the panel, so a page nobody taps pays almost nothing.

---

## 2. Wire it in (5 minutes)

### The two tags

```html
<script src="https://your-gateway.example/buddy-boot.js"></script>
<script>
  BuddyBoot.mount({ manifest: MANIFEST, getState: getState, apply: apply });
</script>
```

That is it. `buddy-boot.js` loads the seven files the chat needs, in the one order that works, plus
`buddy-core.css` and `buddy-theme.css`. You never list them — the list lives in
`BuddyBoot.DEPENDENCIES` (frozen, exported for tests) and the loader owns it, so a future release can
add a file without touching your page.

`mount(opts)` returns a promise resolving to `{open, close}`. Ignoring it is fine: it never throws
synchronously, and a failed load reports itself to the console rather than leaving a launcher that
dies on the first message. It is idempotent — a second call, or a doubled script tag, loads nothing
twice. A rejected mount stays rejected for the life of the page (recovery is a reload), because
retrying could race a second widget onto the page.

The loader derives everything from its own `src`: dependencies, stylesheets and the API base all
resolve against the directory the script tag pointed at. Serve `buddy-boot.js` from a path prefix
(`/buddy/buddy-boot.js`) and the whole buddy follows it there, with no configuration.

### 1. The manifest

Your project's declaration. Sent with every message.

```js
var MANIFEST = {
  projectId: 'host-minimal',
  title: 'Animal Sorter',
  kidJob: 'collect your animals, then count them',
  params:   [{ name: 'speed', label: 'How fast', min: 1, max: 5, step: 1 }],
  slots:    [{ name: 'animals', label: 'Animals' }],
  checks:   [{ name: 'countThem', label: 'Count them' }],
  readouts: [{ name: 'howMany', label: 'How many' }],
};
```

| Field | What it is | Rules |
|---|---|---|
| `projectId` | machine id, used in the buddy's persona | `/^[a-z0-9-]{1,40}$/` |
| `title` | kid-facing project name | <= 60 chars |
| `kidJob` | one line: what the child is trying to do | optional, <= 140 chars |
| `guide` | short paragraph naming your REAL on-screen controls and flow | optional, <= 700 chars |
| `params[]` | `{name, label, min, max, step?}` — tunable **numeric** settings | max 8; `min < max` |
| `slots[]` | `{name, label, grouped?}` — collections of the child's items | max 6 |
| `checks[]` | `{name, label, readOnly?}` — runnable "prove it" beats | max 4 |
| `readouts[]` | `{name, label}` — values the buddy may **see** but never set | max 6 |

Every `name` must match `/^[a-zA-Z][a-zA-Z0-9]{0,30}$/` — no dashes, no underscores, no spaces. Every
`label` is <= 40 characters and is shown to the child.

Four behaviours worth knowing before you debug something:

- **A malformed entry is dropped, not rejected.** The gateway sanitizes the manifest on arrival and
  never throws: an entry that breaks a rule above simply disappears, and the verb naming it then
  reads as undeclared. If the buddy stubbornly refuses to touch `my_param`, the underscore is why.
- **So is an entry whose text the kid-safety screen flags** — and that is not one of the rules above.
  The `title`, `kidJob`, `guide`, every `label`, a readout's string value and a finding's note are all
  screened on arrival, and a flagged string takes its whole entry with it. A perfectly-shaped label can
  disappear on its wording alone.
- **`grouped: true`** means items live under named groups (`{cats: [...], dogs: [...]}`); absent or
  `false` means a flat list. This choice changes both the state shape and which verbs are legal, so
  set it deliberately.
- **`guide` is worth writing.** Without it the buddy knows your machine vocabulary but not your
  screen, so it invents controls ("look for the Add Photo button") that do not exist.

### 2. `getState()`

Called fresh on every message — never cached, so you can hand back live values. Mirror the manifest's
own shape:

```js
function getState() {
  return {
    params:   { speed: 3 },                          // numbers, clamped to your declared min..max
    slots:    { animals: { items: ['cat', 'dog'] } }, // FLAT slot
    // slots: { photos:  { groups: { cats: ['c1'], dogs: ['d1'] } } },  // GROUPED slot
    readouts: { howMany: 'I count 2' },               // string (<= 60 chars) or number
    // findings: [],                                  // only if you declare a readOnly check — see §4
  };
}
```

A flat slot is `{items: [...]}`, not a bare array. Handing back `{animals: ['cat']}` is not an error
you will see: the gateway finds no `items`, and the buddy tells the child their list is empty.

### 3. `apply(action)`

Called once, when the child taps **[Do it]** on a proposal. Do the change and report back:

```js
function apply(action) {
  if (action.op === 'setParam' && action.name === 'speed') {
    state.speed = action.value; render();
    return { ok: true, note: 'speed is now ' + action.value };
  }
  // ...one branch per verb you support
  return { ok: false, note: "I can't do that one here" };
}
```

- **`{ok: true, note}`** — the child hears `Done! <note>`. Keep the note short, plain and true. (An
  approved `undoLast` gets its own "Undone!" line instead, so its note is not read out.)
- **`{ok: false, note}`** — the buddy says its own kid-safe line ("that change didn't fit — no harm
  done") and marks the step skipped. Your `note` is **not** shown to the child on this path; keep it
  for your logs.
- **Prefer returning `{ok: false}` to throwing**, for anything you cannot or will not do. A throw is
  caught for you and treated exactly as `{ok: false}` (§10c), so it can no longer strand the child on
  a tapped button — but the thrown path also prints an error with your stack every time, which is
  noise if the answer is simply "not supported here". Throw for bugs; return `{ok: false}` for
  answers.
- **`apply()` must be synchronous** — see §10c.

Your own UI can share this function. If your page has a slider the child can drag directly, call
`apply({op: 'setParam', name: 'speed', value: n})` from its handler and both paths stay on one
coherent state (and one undo history, if you keep one).

**Working reference:** `client/examples/host-minimal/host.js` implements all three against a
throwaway project, with the shapes above copied from the source of truth rather than paraphrased.

---

## 3. Optional options

All of these go in the same `BuddyBoot.mount({...})` object.

| Option | Effect |
|---|---|
| `buddyName` | A name you already know — skips the "name your buddy" gate and greets the child back. |
| `onBuddyName(name)` | Called once the child names their buddy, so you can persist it. |
| `notes` | Durable "about this child" text, re-sent every message (the gateway stores nothing). |
| `persona` | Durable buddy/setting text, re-sent the same way. |
| `getMemory()` | `() => {notes, persona}` — a LIVE read, preferred over the two static fields above and re-read every message. Use this if memory can change mid-session. |
| `onRemember(note)` | Called when the child approves a "remember this" card. You decide whether and where to persist it; the buddy never writes it anywhere itself. |
| `gatewayUrl` | API base. Defaults to the loader's own directory, which is almost always right. |
| `theme: false` | Skip `buddy-theme.css` and ship your own skin (see §5). `buddy-core.css` always loads. |
| `commands` | Your own slash commands, added to the child's `/` palette. See below. |

### Your own slash commands

The child's command palette (`/`) ships with four built-ins — `/clear`, `/compact`, `/model`, `/help`.
You can add your project's own without touching a single file inside this kit:

```js
window.BuddyBoot.mount({
  manifest: MANIFEST, getState: getState, apply: apply,
  commands: [
    {
      cmd: 'restock',                        // one lowercase word, max 16 chars
      desc: 'put three more crates out',     // <= 40 chars, shown in the palette and by /help
      run: function (args) {                 // `args` is whatever the child typed after the word
        addCrates(3);
        return { note: 'Three more crates are out!' };   // spoken by the buddy; omit to stay silent
      },
    },
  ],
});
```

**Keep them here, not in our files.** It is possible to add a command by editing `logic/command-parse.js`
and `client/buddy.js` instead. Don't: those are the files a new version of this kit replaces, so a
hand-edit there is a merge you own forever. Everything in `commands` lives in *your* page, which means
you can drop a newer kit on top and lose nothing.

The rules, all enforced at mount:

| Rule | Why |
|---|---|
| `cmd` matches `/^[a-z][a-z0-9-]{0,15}$/` | A child types it at a tablet keyboard. |
| `clear`, `compact`, `model`, `help` are **reserved** and refused | The lesson deliberately teaches this vocabulary; a project must not redefine it. |
| `desc` is plain text, 1–40 chars | It renders beside the command in the palette. It is **not** an i18n key — you never touch our string table. |
| `run` must be a function | It receives the trailing text (`''` when there is none). |
| Duplicates keep the first | |

**A command acts immediately — there is no `[Do it]` card.** That is deliberate: the approval card
exists for changes the *buddy* proposes, and the child typed this one by name, exactly like `/clear`.
If your command is destructive, confirm it in your own UI.

**A bad entry is dropped, not fatal** — the rest still work, and the reason is logged with
`console.warn` naming the command. Check the console if a command of yours never shows up.

**If your `run` throws**, the child is told it did not work and the chat carries on; the stack goes to
the console with your command's name. It cannot take the buddy down.

On a shared device, prefer `getMemory()` over `notes`/`persona`. The two static fields are read off the
options object you passed to `mount`, on every turn — so a host that hands over a plain string has no
way to change it afterwards, and a page that swaps children without reloading keeps re-sending the
first child's memory. `getMemory()` is a call you own, so it can always answer for whoever is at the
tablet now.

---

## 4. The seven verbs, and how the manifest narrows them

The buddy's entire action vocabulary, from `logic/action-schema.js`:

```
setParam · createGroup · addItems · removeItems · runCheck · undoLast · rememberUser
```

There is no eighth verb, and no file, shell or network tool anywhere in the build for a jailbreak to
reach. `logic/action-schema.js`'s `validateAction(action, manifest)` is the single source of truth,
used by the model's tool loop, the gateway's fallback gate and the browser.

| Verb | Shape your `apply` receives | Manifest rule |
|---|---|---|
| `setParam` | `{op, name, value}` (`value` is a finite number) | `name` is a declared param; `min <= value <= max` |
| `createGroup` | `{op, slot, name}` | `slot` is declared **and** `grouped: true`; `name` 1..40 chars |
| `addItems` | `{op, slot, group?, ids[]}` | `slot` declared; `group` required if and only if the slot is grouped; `ids` non-empty, each 1..40 chars |
| `removeItems` | same as `addItems` | same |
| `runCheck` | `{op, name}` | `name` is a declared check |
| `undoLast` | `{op}` | always valid — the undo stack is yours to keep |
| `rememberUser` | `{op, note}` | manifest-independent; never reaches `apply` (it goes to its own card and `onRemember`) |

**How narrowing works.** The verbs are generic; the manifest is what scopes them to your project. A
verb naming a param, slot or check your manifest does not declare is refused **server-side, before
the child ever sees a card** — the model's tool call is dropped, no proposal is filed, and nothing
reaches your `apply`. So the example's `animals` slot, declared flat, makes `createGroup` on it
permanently impossible; a `setParam` outside `min..max` never arrives; and a check you drop from your
manifest stops being proposable as soon as your page ships that manifest — the buddy's own code and the
gateway need no change at all, because the narrowing is read from what you send.

Two consequences to design with:

- Your `apply` still needs an honest fallback (`{ok: false, note}`) for the verbs you declared but
  chose not to implement — `undoLast` in particular, which is always valid.
- Validation is **structural**, against the declaration. Whether group "cats" exists *right now* is
  your business, in `apply`.

**Read-only checks.** A check you declare `readOnly: true` is a *look*, not a change. The buddy may run
it without an approval card, it never reaches your `apply`, and what it reports back is the `findings`
array from your `getState()`:

```js
findings: [{ kind: 'imbalance', note: 'many more cats than dogs', groups: ['cats'], ids: [] }]
```

Up to 6 findings; `kind` matches `/^[a-z][a-zA-Z]{0,20}$/`, `note` is 1..160 characters, `groups` and
`ids` are up to 8 strings each. Use it when you want the buddy to be able to inspect something ("what
looks wrong with my data?") and say so honestly, rather than propose a change. Anything other than the
literal boolean `true` is treated as a write check, on purpose — a truthy-but-not-`true` value must
never turn an approved change into an unapproved one.

A deployment can narrow the set further with `BUDDY_ENABLED_OPS` (comma-separated): a disabled verb
is never offered to the model as a tool at all.

---

## 5. Theming

Two supported ways to restyle the buddy, and no third:

1. **Override the custom properties** below. Usually four or five of them. This is the path to take.
2. **Replace `buddy-theme.css` wholesale** — mount with `theme: false` and load your own skin.

**Never re-author `buddy-core.css`.** It is structure: layout, sizing, scroll containment, tap-target
floors, focus outlines, `[hidden]` machinery, reduced-motion guards. Every layout bug of 2026-07-27
lived in structure — a flex item shrinking below its content, a `vh` cap inside a transformed
containing block, a percentage height ignoring a sibling header — and a host that copies structure
inherits all of them and then fixes them alone. Core carries no colours, fonts, shadows or gradients,
and reads exactly four variables (`--buddy-accent`, `--buddy-focus`, `--buddy-radius`,
`--buddy-radius-sm`), so there is nothing in it you need to fork to restyle.

### Copy-paste starting point

```css
/* Your own stylesheet — the loader inserts its two links AHEAD of yours, so this wins with no
   !important anywhere. Cascade order: buddy-core.css -> buddy-theme.css -> your sheet. */
.buddy-app, .bw-bubble, .bw-panel {
  --buddy-surface: #fffdf8;
  --buddy-ink: #2b2118;
  --buddy-accent: #b4552d;
  --buddy-accent-ink: #fffdf8;
}
```

**Use all three selectors.** The launcher (`.bw-bubble`) and the panel (`.bw-panel`) are appended to
`<body>`, outside the chat root (`.buddy-app`), so a block declared on `.buddy-app` alone recolours
the chat and leaves the launcher in the default mint green. That selector list is exactly the one
`buddy-theme.css` declares, so matching it keeps the two files in step.

### The variables

The main skin. Overriding these alone leaves a coherent buddy.

| Property | Default | What it paints |
|---|---|---|
| `--buddy-surface` | `#18232e` | panels, cards, chat surface |
| `--buddy-surface-2` | `#0c141b` | recessed: inputs, picker rows, palette, meter track |
| `--buddy-ink` | `#eaf2f8` | primary text |
| `--buddy-ink-dim` | `#9db2c4` | labels, notes, secondary text |
| `--buddy-ink-faint` | `#7f95a8` | command echo, model ids, section headers |
| `--buddy-accent` | `#39d98a` | affirmative actions, current selection, meter fill |
| `--buddy-accent-ink` | `#04110a` | text ON the accent |
| `--buddy-accent-wash` | `#132b22` | accent-tinted surface (current row, action card) |
| `--buddy-me` | `#2b6cb0` | the CHILD's chat bubble |
| `--buddy-buddy-bubble` | `#20303d` | the BUDDY's chat bubble |
| `--buddy-line` | `#33475a` | borders, dividers |
| `--buddy-danger` | `#e5687a` | inline validation |
| `--buddy-radius` | `1rem` | panels, cards, bubbles |
| `--buddy-radius-sm` | `.6rem` | inputs, buttons, rows |
| `--buddy-font` | `inherit` | proportional text — see below |
| `--buddy-font-mono` | `ui-monospace, monospace` | model ids, keys, tool lines |
| `--buddy-shadow` | `0 28px 64px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.25)` | the panel's drop shadow |
| `--buddy-launcher-bg` | `radial-gradient(circle at 32% 28%, #4be3a0 0%, #22b271 55%, #14895a 100%)` | the launcher orb |
| `--buddy-launcher-ring` | `rgba(86,230,166,.35)` | the launcher's glow while open |

**`--buddy-font` defaults to the keyword `inherit`, which means the buddy takes your page's typeface.**
It is wired as `font-family: var(--buddy-font)` on `.buddy-app, .bw-panel`, and `inherit` on a custom
property is guaranteed-invalid (no parent declares one), so `font-family` falls back to the inherited
value — the host page's own. This is deliberate: the buddy has never set a typeface, and shipping a
real stack as the default would have silently restyled every existing host. Set
`--buddy-font: Georgia, serif` to override it, and the chat, the bubbles and the panel's name tag all
follow while your page is untouched. The example host sets no font variable at all and the buddy
renders in that page's Georgia.

Second tier: one-off tints the names above could not honestly absorb. You can override these and
almost never need to.

| Property | Default | What it paints |
|---|---|---|
| `--buddy-focus` | `#eaf2f8` | the keyboard focus ring (read by `buddy-core.css`) |
| `--buddy-ink-muted` | `#8aa0b2` | a skipped tool line |
| `--buddy-hover` | `#1c2b38` | hovered / keyboard-focused palette row |
| `--buddy-line-strong` | `#5a6d80` | a locked model row on hover |
| `--buddy-scrim` | `rgba(3,8,12,.6)` | the dimmed backdrop behind the picker and key sheet |
| `--buddy-code-bg` | `rgba(255,255,255,.08)` | inline code inside a chat bubble |
| `--buddy-tool` | `#c7b56a` | a running tool line |
| `--buddy-tool-bg` | `rgba(199,181,106,.06)` | its background |
| `--buddy-accent-faint` | `rgba(57,217,138,.08)` | a finished tool line |
| `--buddy-memory-bg` | `#161a2e` | the "shall I remember this?" card — deliberately not the accent wash |
| `--buddy-memory-line` | `#6c7bff` | its border |
| `--buddy-shadow-up` | `0 -6px 18px rgba(0,0,0,.35)` | the command palette floating up out of the composer |
| `--buddy-head-ink` | `#f2f7fb` | the panel header's name tag and minimise bar |
| `--buddy-head-bg` | `rgba(0,0,0,.18)` | the panel header |
| `--buddy-head-line` | `rgba(255,255,255,.08)` | its bottom border |
| `--buddy-chip-bg` | `rgba(255,255,255,.1)` | the minimise button |
| `--buddy-chip-bg-hover` | `rgba(255,255,255,.2)` | hovered |
| `--buddy-launcher-shadow` | `0 10px 26px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.25)` | under the launcher |
| `--buddy-launcher-shadow-open` | `0 10px 24px rgba(0,0,0,.4)` | under the launcher while open |

The launcher's robot is CSS art (there are no image assets and no emoji anywhere in this build). It is
tintable with three more properties, declared on `.bw-bubble` and named `--bot-*`, not `--buddy-*`:

| Property | Default |
|---|---|
| `--bot-metal` | `linear-gradient(160deg, #eef5fa 0%, #c4d6e2 60%, #a7bcca 100%)` |
| `--bot-visor` | `#0e1c26` |
| `--bot-glow` | `#56e6a6` |

### Why overriding beats replacing

`buddy-theme.css` carries more than colour. One concrete example: `font-variant-numeric: tabular-nums`
on `.meter-stats`, the token readout under the chat. Without it, the digits change width as the
numbers tick up and the whole meter row twitches on every message — and the meter's width behaviour
was one of the three layout bugs measured live in July. A host that replaces the theme wholesale loses
that line, and a dozen others like it, and will not notice until a child is watching.

So: `theme: false` is supported and sometimes right, but it means owning the skin, including the small
typographic corrections that are not decoration. Overriding variables keeps them.

The focus ring is the one place we protect you either way: core writes
`outline: 3px solid var(--buddy-focus, currentColor)`, so a theme-replacing host that never defines
`--buddy-focus` still gets a visible keyboard ring instead of none.

---

## 6. Hosting the gateway

The buddy talks to a small Node gateway. It serves the client files, holds the model configuration and
is the trust boundary for everything a child types. Point `gatewayUrl` at one you already run, or run
the one in this bundle:

```bash
cd server
npm install
npm start
```

**Editing `server/` means restarting it.** Node loads those files into memory once, at boot, and
nothing here watches them. Your own page, the buddy's `client/` and `logic/` files are served per
request, so a browser refresh is enough for those — but a refresh will happily load your NEW client
code while the gateway keeps answering from the OLD server code, with nothing on screen saying so. If
a server-side change appears to have done nothing, restart before you debug anything else.

It listens on `http://127.0.0.1:8787` by default (`BUDDY_PORT`, `BUDDY_HOST`). Use `npm start`, not
`node gateway.js` — the start script is `node --env-file-if-exists=.env gateway.js`, and a bare `node`
run silently ignores `server/.env`, so any API keys in it do nothing. See `README.md` for the full
environment-variable list and `DEMO.md` for a guided tour of the running product.

**Same origin, or a proxy — the gateway sends no CORS headers.** It never has: in every deployment so
far the gateway also served the page. Two ways to satisfy that:

- **Serve your host page from the gateway.** Anything you drop into `client/` is served at the
  gateway root, which is exactly how `client/examples/host-minimal/` is reachable at
  `/examples/host-minimal/`.
- **Put the gateway behind a path on your own domain** — `/buddy` -> the gateway process — and point
  the script tag at `/buddy/buddy-boot.js`. The loader resolves its dependencies and its API base
  from its own `src`, so the whole buddy follows the prefix with no configuration. This repo's dev
  server does exactly this (`web/serve.js` proxies `/buddy/*`).

Pointing `gatewayUrl` at a different origin will fail in the browser, not in a way we can fix from
here. Proxy instead.

---

## 7. HTTPS and keys

**Serve over HTTPS.** This is no longer only good practice: a child (or a teacher on their behalf) can
paste their own provider API key into the model picker to unlock a model the deployment has no key
for, and that key travels with each message.

What happens to a pasted key:

- It is stored **on the device**, in that browser's `localStorage`, under `buddy.key.<provider>`.
- It rides the body of each `/api/turn` request that uses that model, and is used for exactly one
  upstream call.
- It is **never logged and never echoed in any response** — not even on the noisiest path, an upstream
  401, where errors love to serialize their own context. That much is gated, not merely intended: a
  key-hygiene test in our own repo (`tests/byok-key-hygiene.test.js`, which is not part of this bundle)
  fails our build if a key reaches any stream frame or any log line on that failing path. So the
  property is enforced upstream of you, on the code you received — you do not have the test to run.
- **Nothing writes it to the server's disk.** That one is a design property rather than a tested one:
  the gateway keeps no per-child state on disk at all, so there is no file for a key to land in.
- Open the same page in another browser or another profile and the model is locked again, because the
  key never left the first one.

Over plain HTTP, all of the above is still true of our code and irrelevant in practice: the key is
readable on the wire. Use HTTPS.

No key ships in this bundle. With none configured, the gateway uses a free no-key endpoint, and if
that endpoint is unreachable every turn degrades to a clearly labelled offline stub reply rather than
a silent wrong answer.

---

## 8. One trust note, stated plainly

A one-tag integration has a consequence worth naming: **the gateway becomes a trusted script origin
for your page.** Your page executes JavaScript served from it, and any script your page loads can read
your page's `localStorage` — including a pasted provider key. So:

- Host the gateway yourself, or trust whoever operates it, as much as you trust your own frontend.
- Serve it over HTTPS.

**We deliberately do not prescribe Subresource Integrity.** SRI defends against a third party tampering
with a file served from an origin you do not control — a public CDN. That is not this shape: the loader
and its seven modules are first-party files, from the same origin as your page (or a proxy of it), and
they change on every deploy. A pinned hash would break the page at each release while defending
against an attack the deployment does not have. A team that pins a specific release and wants SRI can
add `integrity` to its own `<script>` tag; nothing in the loader prevents it.

---

## 9. What is not supported

- **Cross-origin hosting.** The gateway sends no CORS headers. Same origin, or a proxy (§6).
- **No npm package**, no bundler entry point, no ES module build. Classic scripts only.
- **No TypeScript types.** The option shapes are documented in JSDoc on `client/buddy.js` and
  `client/buddy-boot.js`.
- **No inline or docked mount mode.** The widget mounts as a floating launcher plus panel, appended to
  `<body>`. (`window.BuddyChat.mount(rootEl, opts)` will fill a container of yours with the chat and
  no launcher, but it is the internal seam the widget uses, not a supported integration surface.)
- **No multi-instance page.** One buddy per page; `mount` is idempotent by design.

---

## 10. Extending the buddy

Two ways to give the buddy something new to do, and they are **not** interchangeable. Everything here
lives in *your* files — nothing below asks you to edit anything inside the kit.

| | An **ability** (a check) | A **command** (a slash command) |
|---|---|---|
| Who starts it | The **buddy** decides to propose it | The **child** types it by name |
| Approval | A `[Do it]` card the child taps | None — it runs immediately |
| Where you declare it | `manifest.checks[]` | the `commands` option (§3) |

### 10a. Adding an ability

Two edits, both yours. Declare the check in your manifest:

```js
checks: [{ name: 'toughenShelf', label: 'Toughen this shelf' }],   // max 4
```

…then handle it in your `apply()`:

```js
if (action.op === 'runCheck' && action.name === 'toughenShelf') {
  toughenTheShelf();
  return { ok: true, note: 'made 4 practice views' };
}
```

**The constraint that shapes every ability you will design: `runCheck` carries only a name.** The
engine's schema is literally `runCheck: z.object({ name: z.string().min(1) })` — there is no room for
a target, an amount, or any argument at all. So "toughen *the metal shelf* by *4*" cannot ride the
call. Get it from your own UI state (whatever the child currently has selected) or expose it as a
`readout` so the buddy can see it and say *"you have Metal picked — shall I toughen it?"*. Designing an
ability that needs a parameter and discovering this at the end is the most common way this goes wrong.

**A writing check keeps its approval card. A `readOnly: true` check does not** — it is a *look*, not a
change, so it runs without asking and hands the model that turn's real `findings` instead (§4). Mark a
check `readOnly` only if it genuinely changes nothing; the buddy will otherwise tell a child to approve
something that has already happened.

### 10b. Adding a command

See **§3, "Your own slash commands"** for the full shape and rules. In one line:

```js
commands: [{ cmd: 'restock', desc: 'put three more crates out', run: function (args) { /* ... */ } }]
```

`client/examples/host-minimal/host.js` demonstrates **both** extension points side by side — its
`countThem` check is the ability, its `/restock` is the command.

### 10c. What happens when your callback misbehaves

Every function you hand the buddy is called inside a guard. **Your bug degrades the buddy; it never
takes it down**, and you always get a named stack in the console — the child gets a gentle line, you
get the error:

| Your callback | If it throws | What the child sees |
|---|---|---|
| `apply(action)` | treated exactly as `{ok:false}` | "that change didn't fit — no harm done", the step marked skipped |
| `getState()` | `undefined` | the buddy talks about an empty project |
| `getMemory()` | falls back to your static `notes` / `persona` | nothing |
| `onRemember(note)` | ignored | the "I'll remember that" confirmation still appears |
| `setBuddyName` / `onBuddyName` | ignored | the name still shows, and the lab still opens |
| a command's `run(args)` | treated as a failed action | "that change didn't fit — no harm done" |

Three things worth knowing:

- **`apply()` must be SYNCHRONOUS.** If you return a Promise, the buddy cannot read `.ok` off it and
  will treat every action as a refusal. Do your async work first, then return `{ok, note}`. Returning a
  Promise logs a console error saying exactly this rather than failing quietly.
- **Returning garbage is safe.** `apply()` returning `undefined`, `null`, or an object without `ok`
  takes the refusal path. Only `{ok: true}` counts as success.
- **Check the console first.** Every one of these logs `buddy: your <callback>() threw` with the
  original error. If something is silently not happening, that message names which of your functions
  is responsible.
