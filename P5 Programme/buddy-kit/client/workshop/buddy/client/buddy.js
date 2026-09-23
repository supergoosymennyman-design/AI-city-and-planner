// client/buddy.js — mountable chat core. window.BuddyChat.mount(rootEl, opts) builds the buddy's
// ENTIRE DOM inside rootEl (no page-global ids — a widget panel must be able to host a second
// copy of this DOM without id collisions) and wires the chat loop to the host adapter:
//   opts = {
//     manifest,           // the host project's manifest (sent with every /api/turn)
//     getState,           // () => projectState — read fresh on every send
//     apply,              // (action, ctx) => {ok, note} | {pending:true, note?} — executes a kid-
//                         // approved [Do it] card. `ctx.settle(outcome)` is ALWAYS passed as the
//                         // second argument, even to hosts that ignore it (host-augment brief Task
//                         // 2): return synchronously as before, OR return {pending:true} for real
//                         // slow work and call ctx.settle({ok, note, followUp?}) later, from wherever
//                         // that work actually finishes. See "Live tool lines" below for the contract.
//     cardNote,           // optional (action) => string — an extra caution line under one [Do it]
//                         // card ('' or a throw renders no line; best-effort, like every host call)
//     pendingDeadlineMs,  // optional number — how long a claimed line waits for ctx.settle before
//                         // giving up and flipping skipped on its own (default 120000; test-only
//                         // override, not meant to be tuned by a real host)
//     gatewayUrl,         // optional base ('' = same-origin, the default)
//     notes,              // optional string — durable "about the child" memory, resent with every
//                         // /api/turn now that the gateway is stateless (no server-side /api/memory
//                         // disk write anymore — see stateless-buddy Task 6)
//     persona,            // optional string — durable buddy/setting memory, resent the same way
//     getMemory,          // optional () => {notes, persona} — a LIVE read, preferred over the static
//                         // notes/persona above when present (stateless-buddy Task 7b). Read fresh on
//                         // EVERY turn (mirrors getState) so a mid-session champion import or an
//                         // onRemember append is reflected on the next turn instead of resending
//                         // whatever child's memory was mounted at boot — the fix for a real
//                         // cross-child leak on a shared tablet. Falls back to static notes/persona
//                         // above when absent (keeps mock hosts + Task 6 callers working).
//     onRemember,         // optional (note:string) => {ok:boolean,note?:string}|void — called when the child approves a
//                         // "remember this" card; the HOST decides how/whether to persist it
//   }
// Chat loop, [Do it]/[No], Memory Meter + Fresh Start/Tidy Up + [Remember]/[No] approve-to-remember
// cards. Inlined STRINGS + t() — our branded kid UI only; the child sees zero upstream-agent-server
// strings, the gateway is the trust boundary.
// THE CONVERSATION LIVES HERE (Scope Law, spec §3/§5). The gateway remembers nothing between requests:
// this file owns the transcript, the child's model choice, their day-keyed chat budget and the last
// meter reading (see createLesson below), and ships what a turn needs in the request body. So Fresh
// Start clears a LOCAL transcript, picking a brain writes LOCAL storage, and two children on one
// tablet can never see each other's chat — there is no shared server state left to leak through.
(function () {
  'use strict';
  // Inlined for file:// parity (zero fetches) — MUST mirror i18n/en.json key-for-key (repo idiom;
  // intentional duplication, not a defect — see AGENTS.md "Strings inlined + externalized").
  const STRINGS = {
    "app.title": "Recycle-Eye Lab", "name.prompt": "First, give your buddy a name!",
    "name.placeholder": "type a name…", "name.go": "Meet my buddy", "chat.placeholder": "Ask your buddy…",
    "chat.send": "Send", "action.do": "Do it", "action.no": "No thanks", "panel.title": "Your Champion",
    "panel.accuracy": "Accuracy", "panel.threshold": "Unsure line",
    "chat.error": "Oops — I lost my train of thought! Try again?",
    "turn.stopped": "Okay, I stopped that answer.",
    "name.adopted": "Your champion brought me back — I'm {name}! Let's keep going.",
    "meter.label": "Buddy memory", "meter.cost": "cost",
    "control.fresh": "Fresh Start · /clear", "control.tidy": "Tidy Up · /compact",
    "action.remember": "Remember this", "action.forget": "No thanks",
    "fresh.reveal": "Chat cleared — but I still remember you! That's my memory files, not the chat.",
    "tidy.done": "Tidy Up! I feel lighter already.",
    // Tidy Up's honest refusal (P3b fix round, finding 1): this button's WHOLE job is to send the
    // chat so far away to be summarized, so when the host's outbound filter keeps that chat here
    // there is nothing to ask for. Said out loud — a button that quietly did nothing would be the
    // dead-control defect this repo keeps finding. Deliberately does not name a reason: only the
    // HOST knows why, and it says so itself through the note applyOutbound carries.
    "tidy.withheld": "I can't tidy our chat right now — this page is keeping it here with us. Nothing is lost: it's all still in our log.",
    // Agent console (Task 5): slash commands, palette, model chip/picker, live tool lines.
    "cmd.unknown": "Hmm, that's not a command I know — try /help",
    "cmd.help": "I'm your coding agent! Commands: /clear starts our chat fresh · /compact tidies my memory · /model picks my AI brain · /help shows this. Type / to see them.",
    "cmd.clear.desc": "start our chat fresh", "cmd.compact.desc": "tidy up my memory",
    "cmd.model.desc": "pick my AI brain", "cmd.help.desc": "show all commands",
    // Host-declared commands (host-extension brief Task 2) are appended to /help after this lead-in.
    "cmd.help.yours": "This project also added:",
    "model.title": "Pick my AI brain", "model.current": "brain", "model.switched": "model switched:",
    "model.picker.current": "current", "model.picker.by": "made by", "model.picker.via": "via",
    "tool.waiting": "waiting for your OK", "tool.done": "done", "tool.skipped": "skipped",
    // A READ is already finished the instant it is reported — there is nothing to approve, so it
    // never says "waiting for your OK". See addToolLine.
    "tool.looked": "looked",
    // Slow-action pending state (host-augment brief Task 2): a card whose apply() returned
    // {pending:true} sits here until the host calls ctx.settle — the line must never say "done"
    // before that, which is the whole reason this state exists. See makeSettleCtx/markWorking.
    "tool.working": "working on it",
    "apply.timeout": "That took too long and I stopped waiting. The work may still finish in the workshop.",
    // Universal-project mount refactor (Task 5): host-executor apply() outcomes.
    "action.undo.done": "Undone!", "apply.failed": "Hmm, that change didn't fit — no harm done!",
    // Scope Law (Task 7): the three things the CHILD's browser now decides for itself — the day's chat
    // budget being spent, a transcript grown too big to keep shipping, and the server resolving a
    // different brain than the one they picked. Each says what happened AND what they can still do.
    "cap.reached": "Our chat energy for today is all used up! Your champion is safe — we can keep building, and chat again tomorrow.",
    "cap.nudge": "Our chat is getting really full — tap Tidy Up so I can keep everything straight!",
    "model.fallback": "that brain isn't available right now — using",
    // Said out loud on any non-live turn: the chip names what was ATTEMPTED, so without this the
    // child reads a fallback answer as having come from the brain they picked.
    "model.notlive": "heads up — that answer did NOT come from",
    // BYOK (spec §3): locked entries, the key sheet, and the key-refused line.
    "model.locked": "needs a key", "model.locked.header": "needs a key — tap to add yours",
    "keys.title": "Use your own key",
    "keys.body.serves": "is served by", "keys.body.bill": "Paste your key to use it on this device. Messages will bill that key's account.",
    "keys.placeholder": "paste your key…", "keys.show": "show", "keys.hide": "hide",
    "keys.save": "Use it", "keys.cancel": "Not now",
    "keys.empty": "Paste a key first — or tap Not now.",
    "keys.rejected": "That key didn't work — check it under Your keys.",
    // "Your keys" management + "Add any model" (Task 6, spec §3.3/§3.4): the tucked-away power path.
    // "…" on the picker's BUTTON means "this opens a sheet"; the sheet's own title drops it.
    "keys.manage": "Your keys…", "keys.manage.title": "Your keys",
    "keys.none": "No keys on this device yet.", "keys.remove": "Remove",
    "keys.done": "Done",
    "custom.add": "Add any model…", "custom.title": "Add any model", "custom.note": "added by you",
    "custom.placeholder": "model id, e.g. author/model-name", "custom.save": "Add it",
    "custom.bad": "That doesn't look like a model id.",
  };
  // Guarded like the repo's game.js window-global idiom (e.g. web/games/p4-01-waste-sorters/game.js):
  // `typeof window` is undefined under plain `node --test`, so this is skipped there — the module.exports
  // seam at the bottom only needs the pure buildTurnBody, never T()/mount(), to survive that require().
  if (typeof window !== 'undefined') window.T = (k) => STRINGS[k] || k;

  /**
   * Mounts the buddy chat core into `rootEl`, building its entire DOM (no page-global ids) and
   * wiring the chat loop to the host's project-state adapter. This is the ONE integration surface a
   * host page needs — see the file header for the `opts` shape.
   * @param {HTMLElement} rootEl - empty container the widget takes over completely.
   * @param {{manifest:object, getState:() => object, apply:(action:object, ctx:{settle:(outcome:{ok:boolean,note:string,followUp?:object}) => {retire:(note?:string) => void}}) => ({ok:boolean,note:string}|{pending:true,note?:string}), gatewayUrl?:string, notes?:string, persona?:string, getMemory?:() => {notes?:string, persona?:string}, onRemember?:(note:string) => void, cardNote?:(action:object) => string, pendingDeadlineMs?:number}} opts
   * @returns {{rootEl: HTMLElement}}
   */
  /**
   * Builds the JSON body for `POST /api/turn`. Pure + DOM-free (no fetch, no `this`) on purpose — it's
   * the one seam `node:test` can exercise without a browser (see the `module.exports` guard at the
   * bottom of this file). `childName`/`buddyName` are threaded in by the caller from mount()'s own
   * closure state (the child never sets them directly); `notes`/`persona` are the optional durable-
   * memory strings the host re-sends every turn now that the gateway holds no server-side memory
   * state (stateless-buddy Task 6 — `POST /api/memory` is gone, 404s server-side). `opts.getMemory`
   * (stateless-buddy Task 7b), when present, is preferred over the static `notes`/`persona` fields —
   * it's read FRESH on every turn (mirrors `getState`), so a mid-session champion re-import or an
   * `onRemember` append is reflected on the very next turn instead of resending whatever child's
   * memory happened to be mounted at boot (the cross-child leak this task fixes). Hosts that only
   * supply the static fields (mock hosts, Task 6 tests) keep working via the fallback.
   *
   * SCOPE LAW (Task 7): the gateway holds NO conversation state either, so the last four fields carry
   * the child's own lesson store (`opts.lesson`, `opts.lessonStart` — threaded in by the send() call
   * site exactly like childName/buddyName):
   *   - `transcript` — the whole chat so far; the server has no history of its own to prepend.
   *   - `model` — the child's stored brain choice (omitted while they haven't picked one, so the
   *     server falls back to its boot default rather than reading a meaningless `null` as a choice).
   *   - `lessonStartState` — the project as it looked when this lesson began, so the buddy can answer
   *     "what have we changed today?" without the server remembering anything.
   *   - `lastMeterTotal` — the last honest meter reading, which the server echoes back on any turn
   *     that spends nothing (a deflected/braked/failed turn would otherwise report a false zero).
   *   - `providerKey`/`modelProvider` — BYOK (spec §5.2): present only when the picked model rides a
   *     device-held key; absent otherwise, keeping the no-key body byte-identical.
   * ALL FOUR ARE OPTIONAL, and that is load-bearing: a host with no lesson (mock hosts, the p5-01
   * scripted browser suites, the tests above) leaves them `undefined`, JSON.stringify drops them, and
   * the body on the wire is BYTE-IDENTICAL to the pre-Task-7 shape.
   * @param {{childName:string, buddyName:string, manifest:object, getState:() => object, getMemory?:() => {notes?:string, persona?:string}, notes?:string, persona?:string, lesson?:object, lessonStart?:object}} opts
   * @param {string} message
   * @returns {{childName:string, buddyName:string, manifest:object, projectState:object, message:string, notes?:string, persona?:string, transcript?:object[], model?:string, lessonStartState?:object, lastMeterTotal?:number}}
   */
  /**
   * THE HOST-CALLBACK BOUNDARY (host-extension brief Task 1). Calls one function supplied by the
   * HOST — code written by someone who has never seen this file — and never lets it take the buddy
   * down. Every host call in this file goes through here, so the behaviour is uniform rather than
   * remembered: five of the seven used to be bare, and the bare `opts.apply()` was the worst,
   * because the [Do it] card is removed BEFORE apply runs — a throw left the child tapping a card
   * that vanished and then getting nothing at all, the "dead air" INTEGRATION.md calls the one
   * outcome to avoid.
   *
   * The child's experience degrades to `fallback`; the DEVELOPER gets the stack AND the callback's
   * name. That pairing is the whole point: "fails safe" and "fails invisibly" are different things,
   * and only one of them is debuggable by a coworker wiring up their own project.
   *
   * Only HOST code is wrapped. The buddy's own errors must still surface loudly — swallowing those
   * would hide our bugs behind a message blaming the host.
   * @param {string} name the option key exactly as the host wrote it (e.g. 'getState')
   * @param {Function} fn zero-arg thunk performing the call
   * @param {*} fallback returned when `fn` throws
   * @returns {*} `fn()`'s value, or `fallback`
   */
  function hostCall(name, fn, fallback) {
    try {
      return fn();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error(`buddy: your ${name}() threw — the buddy carried on without it`, e);
      }
      return fallback;
    }
  }

  function buildTurnBody(opts, message) {
    // The documented fallback for a throwing/absent getMemory: the STATIC notes/persona the host
    // passed at mount. Losing the child's memory because a live read failed would be a worse answer
    // than using the slightly staler one we already hold.
    const staticMem = { notes: opts.notes, persona: opts.persona };
    const mem = (typeof opts.getMemory === 'function')
      ? hostCall('getMemory', () => opts.getMemory(), staticMem)
      : staticMem;
    return {
      childName: opts.childName,
      buddyName: opts.buddyName,
      manifest: opts.manifest,
      // `undefined`, not a fabricated empty project: the gateway's sanitizer already turns a missing
      // projectState into an empty one, so inventing a shape here would add a second place to be wrong.
      projectState: hostCall('getState', () => opts.getState(), undefined),
      message,
      notes: mem && mem.notes,
      persona: mem && mem.persona,
      transcript: opts.lesson ? opts.lesson.transcript() : undefined,
      model: (opts.lesson && opts.lesson.model()) || undefined,
      lessonStartState: opts.lessonStart || undefined,
      lastMeterTotal: opts.lesson ? opts.lesson.meterTotal() : undefined,
      providerKey: opts.byok ? opts.byok.providerKey : undefined,
      modelProvider: opts.byok ? opts.byok.modelProvider : undefined,
    };
  }

  /**
   * THE HOST'S LAST WORD ON WHAT MAY LEAVE — one optional hook, `opts.outbound(body)`.
   *
   * WHY IT EXISTS AT ALL. A host can already shape `projectState` (its own `getState`) and
   * `notes`/`persona` (its own `getMemory`). It CANNOT reach `transcript` or `lessonStartState`:
   * both are composed here, from this file's own lesson store, on every single request. A host
   * that must keep material off the wire — the Workshop's private learning session (its plan §3:
   * "omit Workshop-derived context from Buddy requests … clear/invalidate queued context and
   * prevent previously captured private context from entering later turns") — therefore has no
   * way to do it through its callbacks alone. This hook is that way, and it is the ONLY new
   * surface: the filter itself lives in the host, not here.
   *
   * ADDITIVE AND SILENT WHEN ABSENT. No `outbound` → the body is returned untouched and the bytes
   * on the wire are identical to before, which every existing host (p5-01, the mock project, the
   * scripted browser suites) depends on.
   *
   * IT DOES NOT GO THROUGH `hostCall`. Every other host call here degrades to a fallback, because
   * losing a nice-to-have beats taking the buddy down. This one is the opposite: a filter that
   * cannot answer must NOT be quietly ignored, because "ignored" means sending the unfiltered
   * body. A throw (or a malformed return) propagates to send()'s own try/catch, which shows the
   * friendly error bubble and sends NOTHING — fail closed, the whole point of a boundary.
   *
   * @param {object} opts the mount options
   * @param {object} body the composed turn body
   * @returns {{body:object, note:string|null}} the body to send, and an optional sentence the host
   *   wants the person to read BEFORE this turn goes (rendered as a buddy bubble by send()).
   */
  function applyOutbound(opts, body) {
    if (typeof opts.outbound !== 'function') return { body: body, note: null };
    var ruled = opts.outbound(body);
    if (!ruled || typeof ruled !== 'object' || !ruled.body || typeof ruled.body !== 'object') {
      throw new Error('buddy: your outbound() must return { body } — refusing the turn rather than sending an unfiltered body');
    }
    return { body: ruled.body, note: (typeof ruled.note === 'string' && ruled.note.trim()) ? ruled.note : null };
  }

  /**
   * One lesson's client-side state — the Scope Law's lesson scope (spec §3 row 2). The server keeps
   * NO conversation state; this store is the single home for what one child's page knows: the
   * transcript (in-memory — reload = honest amnesia: what the log shows is exactly what the buddy
   * knows), the day-keyed spend counter (localStorage — survives reload and Fresh Start so the
   * budget can't be reset with F5; expires when the LOCAL date changes, because a school day is
   * local), the model choice, and the meter's last honest total. Deliberately defined INSIDE
   * buddy.js, not as a new logic/ file: hosts hard-code the script list they load from the gateway
   * (p5-01 game.js:3029), so a new required file would silently never load there.
   * PRIVACY: keys use the buddy's name (child-invented robot fiction, already stored in the champion
   * file) — never the child's own name. No identity enters storage.
   * @param {{projectId:string, buddyName:string, storage:{get:Function,set:Function}, today:()=>string}} cfg
   *   `storage`/`today` are injected so node:test can drive day-rollover without a DOM or a clock.
   */
  function createLesson(cfg) {
    const spendKey = () => 'buddy.spent.' + cfg.projectId + '.' + cfg.buddyName + '.' + cfg.today();
    const modelKey = 'buddy.model.' + cfg.projectId;
    let transcript = [];
    let spendCap = null;      // unknown until GET /api/model supplies it; unknown = never refuse
    let lastMeterTotal = 0;
    const readSpent = () => { const n = Number(cfg.storage.get(spendKey())); return Number.isFinite(n) && n >= 0 ? n : 0; };
    return {
      /** Records one exchanged pair. Greet turns record their synthetic user text too — matching
       *  what the model actually saw.
       *  NEVER an empty (or over-long) entry: the gateway's transcript sanitizer 400s the WHOLE
       *  transcript on any content outside 1..16384 chars (transcript-sanitize.js — malformed
       *  fails LOUD by design), so one '' recorded here poisoned every later turn until /clear.
       *  Owner hit it live (2026-08-11): Esc before the first delta recorded an empty reply, and
       *  from then on every send answered "Oops — I lost my train of thought!" — read, fairly, as
       *  "it disconnected the model". Placeholders instead: the model is the only reader. */
      record(userText, replyText) {
        const u = String(userText).slice(0, 16000) || '(nothing)';
        const r = String(replyText).slice(0, 16000) || '(no answer arrived)';
        transcript.push({ role: 'user', content: u }, { role: 'assistant', content: r });
      },
      /** @returns a defensive copy — callers can never mutate the store's own history. */
      transcript() { return transcript.map((e) => ({ role: e.role, content: e.content })); },
      spend(n) { const v = Number(n); if (Number.isFinite(v) && v > 0) cfg.storage.set(spendKey(), String(readSpent() + v)); },
      spent: readSpent,
      setSpendCap(n) { const v = Number(n); spendCap = Number.isFinite(v) && v > 0 ? v : null; },
      /** False only when a known cap is exhausted — an unknown cap must never refuse a child. */
      canSend() { return spendCap === null || readSpent() < spendCap; },
      setModel(id) { if (typeof id === 'string' && id) cfg.storage.set(modelKey, id); },
      model() { return cfg.storage.get(modelKey) || null; },
      setMeterTotal(n) { const v = Number(n); if (Number.isFinite(v) && v >= 0) lastMeterTotal = v; },
      meterTotal() { return lastMeterTotal; },
      /** Fresh Start clears ONLY the conversation — the day spend survives on purpose (spec §7.1). */
      freshStart() { transcript = []; },
      tidyUp(summaryText) { transcript = [{ role: 'user', content: 'Summary of our chat so far: ' + String(summaryText) }]; },
    };
  }

  /**
   * localStorage behind a crash-proof shim (AGENTS.md crash-proof I/O): storage that is absent,
   * full, or throwing (private browsing) degrades to an in-memory map — the budget then resets on
   * reload on such devices, an accepted + documented trade (spec §9).
   */
  function safeStorage() {
    const mem = new Map();
    return {
      get(k) { try { const v = window.localStorage.getItem(k); return v === null ? (mem.get(k) ?? null) : v; } catch (e) { return mem.get(k) ?? null; } },
      set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { mem.set(k, v); } },
    };
  }

  /**
   * Device-scope provider keys (BYOK spec §4): `buddy.key.<providerId>` in localStorage — the
   * device owner's credential, exactly like a coding agent's settings. NEVER project-scoped, never
   * day-keyed (a key doesn't expire overnight), never in the champion file (that file travels
   * between people), never the child's name. Removal writes '' (localStorage has no reliable
   * delete through the safeStorage shim) and get() reads blank as absent.
   */
  function createDeviceKeys(storage) {
    const keyFor = (provider) => 'buddy.key.' + provider;
    return {
      get(provider) { const v = storage.get(keyFor(provider)); return (typeof v === 'string' && v.trim()) ? v.trim() : null; },
      set(provider, key) { const k = typeof key === 'string' ? key.trim() : ''; if (k && k.length <= 512) storage.set(keyFor(provider), k); },
      remove(provider) { storage.set(keyFor(provider), ''); },
      /** Last-4 display mask — the whole key never renders back onto a classroom screen. */
      mask(provider) { const v = this.get(provider); return v ? '…' + v.slice(-4) : null; },
    };
  }

  /**
   * Device-scope typed models (spec §3.4): `buddy.customModels` — `[{provider, id}]`. A typed model
   * ALWAYS rides the device's own key (the deployer's env key serves only what the deployer curated),
   * so these entries pair with createDeviceKeys at send time via byokFieldsFor. Corrupt storage
   * reads as empty (crash-proof I/O); the id shape mirrors the server's MODEL_ID_RE — the client
   * refuses early what the server would 400.
   */
  function createCustomModels(storage) {
    const KEY = 'buddy.customModels';
    const read = () => {
      try {
        const a = JSON.parse(storage.get(KEY) || '[]');
        return Array.isArray(a) ? a.filter((e) => e && typeof e.provider === 'string' && typeof e.id === 'string') : [];
      } catch (e) { return []; }
    };
    return {
      list: read,
      add(provider, id) {
        if (!/^[\w./~:-]{1,128}$/.test(id || '')) return false;
        const cur = read();
        if (!cur.some((e) => e.id === id)) storage.set(KEY, JSON.stringify([...cur, { provider, id }]));
        return true;
      },
      remove(id) { storage.set(KEY, JSON.stringify(read().filter((e) => e.id !== id))); },
    };
  }

  /**
   * Which BYOK fields (if any) one turn must carry for this model id (spec §5.2 client side):
   * server-unlocked ids → null (the deployer's env key serves them server-side); locked/custom ids →
   * the device key for their provider, or null when the device has none (the server then falls back
   * to the default and the done frame's `model` field announces it — the existing chip behavior).
   */
  function byokFieldsFor(id, serverModels, lockedModels, customList, deviceKeys) {
    if (!id || serverModels.some((m) => m.id === id)) return null;
    const entry = lockedModels.find((m) => m.id === id) || customList.find((m) => m.id === id);
    if (!entry) return null;
    const key = deviceKeys.get(entry.provider);
    return key ? { providerKey: key, modelProvider: entry.provider } : null;
  }

  /**
   * Today's date as `YYYY-MM-DD` in the DEVICE's LOCAL timezone — the day key the spend budget resets
   * on. Local, not UTC, on purpose: a school day is local, and a UTC key would roll over mid-afternoon
   * in Hong Kong (UTC+8), handing a child a second full budget in one lesson.
   * Passed to createLesson as the `today` FUNCTION (never its result) so a page left open across
   * midnight rolls over on its own, with no remount.
   * @returns {string} e.g. '2026-07-26'
   */
  function localToday() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function mount(rootEl, opts) {
    const base = opts.gatewayUrl || '';
    const api = (path, init) => fetch(base + path, init); // same-origin by default; opts.gatewayUrl can point elsewhere
    let buddyName = null, childName = 'friend';

    // ── The lesson store: THIS page's whole conversation state (Scope Law spec §3/§5) ──────────────
    // The gateway remembers nothing between requests, so everything a turn needs — transcript, model
    // choice, day-keyed spend, last meter total — lives HERE, mount-scoped, and rides in each request
    // body. Both are null until the buddy is named (startLab/startLabSeeded), because the spend key is
    // keyed by the buddy's name; every reader below therefore guards on `lesson` being truthy.
    // `lessonStart` is the project snapshot taken when this lesson began (re-taken on Fresh Start) —
    // it's how the buddy can say what changed today without the server holding a baseline.
    let lesson = null;
    let lessonStart = null;

    // Live tool proposals for the CURRENT turn only: `{op, el, base, flipped}` — appended as `● …`
    // lines on `tool` frames and flipped to `✓ done`/`✗ skipped` when the matching action card is
    // resolved. Reset at the START of every send() so a new turn never flips a stale line; the click
    // handlers in addActions/addRememberCard read THIS mount-scoped list (they fire after send()
    // returns, so the reference must live here, not inside send()). A `cut` frame clears it.
    let pendingTools = [];
    // Bumped ONLY when the WHOLE chat log is wiped out from under a slow action still in flight —
    // Fresh Start (see below), and nothing else. A pending `ctx` from before the bump belongs to a
    // conversation that no longer exists: `refs.log.isConnected` cannot catch this (Fresh Start empties
    // refs.log's CHILDREN via `textContent=''`, but refs.log ITSELF stays mounted, so that check alone
    // still passes), so a settle/deadline arriving after the bump would otherwise inject a bubble or a
    // follow-up card into the NEW conversation with nothing on screen explaining where it came from.
    // makeSettleCtx snapshots this at creation and compares. Deliberately NOT bumped by `clearToolLines`
    // (a round-2 review fix — a first draft did, and that orphaned every EARLIER turn's still-pending
    // ctx the instant a later message got kid-safety `cut`, since this counter is mount-scoped, not
    // per-turn — see clearToolLines' own comment for the full incident).
    let chatEpoch = 0;
    // ONE turn at a time (coding-agent contract, owner 2026-08-11). Before this, a message sent
    // while the previous answer was still streaming forked a SECOND parallel /api/turn: two
    // bubbles grew at once, the second turn's transcript lacked the first's unfinished reply (so
    // the model answered "why?" against stale context), and the store recorded pairs in
    // COMPLETION order — a permanently scrambled history. The fix is the same shape real coding
    // agents use (Claude Code's interactive mode): input typed while the agent works is QUEUED
    // and delivered at the next turn boundary; Esc interrupts the live stream explicitly.
    let turnAbort = null;   // AbortController of the ONE in-flight /api/turn; null = idle
    const sendQueue = [];   // {message, el} — chat typed while the buddy was answering, in order
    // Esc INTERRUPTS a streaming turn. CAPTURE phase, so the widget's own bubble-phase
    // "Esc closes the panel" handler only ever sees Esc while the buddy is idle — stopping the
    // work and closing the window must never be the same gesture.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !turnAbort) return;
      e.stopPropagation();
      turnAbort.abort();
    }, true);
    // The last GET /api/model snapshot — the picker's list + the switch-guard for `/model <id>`
    // (only ids in this list are switchable). Empty until startLab's ambient fetch resolves.
    let modelList = [];
    let currentModelId = null;
    let lockedList = [];        // GET /api/model's lockedModels — the picker's "needs a key" section
    let byokProviderList = [];  // GET /api/model's byokProviders — Task 6's add-any-model menu
    let serverDefaultId = null; // data.current — where the picker falls back when a key is removed
    const deviceKeys = createDeviceKeys(safeStorage());
    const customStore = createCustomModels(safeStorage());
    let customList = customStore.list();        // typed models the child added on THIS device (spec §3.4)
    // Host-declared commands (host-extension brief Task 2), validated ONCE at mount so a project can
    // add its own slash command WITHOUT editing any file inside the kit. That is the whole point:
    // adding `/toughen` used to mean five edits across command-parse.js and this file, four of them
    // here — so every host that added a command owned a hand-merge of a 1256-line file forever, and
    // "send them an updated kit folder" stopped being true. Dropped entries are reported to the
    // DEVELOPER, never silently: a silently dropped command is indistinguishable, from their chair,
    // from a command that runs and does nothing.
    const hostCmdResult = window.CommandParse.sanitizeHostCommands(opts.commands);
    for (const d of hostCmdResult.dropped) {
      if (window.console && console.warn) console.warn(`buddy: ignored your command '${d.cmd}' — ${d.reason}`);
    }
    const hostCommands = hostCmdResult.commands;
    const hostWords = hostCommands.map((c) => c.cmd);
    // The slash commands the palette offers, in display order. Built-ins carry an i18n KEY (our own
    // copy, translated with the app); host entries carry PLAIN TEXT, because a host must not have to
    // learn our string table to get a readable palette row. Both resolve to `desc` here so the
    // palette renders ONE shape and never branches on where the row came from.
    const COMMANDS = [
      { cmd: 'clear', desc: T('cmd.clear.desc') },
      { cmd: 'compact', desc: T('cmd.compact.desc') },
      { cmd: 'model', desc: T('cmd.model.desc') },
      { cmd: 'help', desc: T('cmd.help.desc') },
    ].concat(hostCommands.map((c) => ({ cmd: c.cmd, desc: c.desc })));
    let paletteItems = []; // `{cmd, el}` currently rendered in the palette
    let paletteIdx = -1;   // keyboard-focused row index, or -1 when the palette is closed

    // ── DOM: built, not looked up ──────────────────────────────────────────────────────────────
    // el(tag, className?, attrs?) helper; refs = plain object of node references — this mount's OWN,
    // never a global id lookup, so a page can host a second copy of this widget with no collisions.
    const el = (tag, cls, attrs) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); return n; };
    const refs = {};
    /** Builds the widget's entire DOM tree fresh into `rootEl` and populates `refs`. */
    function buildDom() {
      rootEl.textContent = '';
      rootEl.classList.add('buddy-app');
      refs.nameGate = el('section', 'gate');
      refs.namePrompt = el('h1'); refs.nameInput = el('input', null, { autocomplete: 'off' });
      refs.nameGo = el('button');
      refs.nameGate.append(refs.namePrompt, refs.nameInput, refs.nameGo);
      refs.lab = el('main', 'buddy-lab'); refs.lab.hidden = true;
      refs.hud = el('div', 'buddy-hud');
      refs.meter = el('div', 'meter', { 'aria-live': 'polite' });
      refs.meterLabel = el('span', 'meter-label');
      refs.meterTrack = el('div', 'meter-track'); refs.meterFill = el('div', 'meter-fill');
      refs.meterTrack.append(refs.meterFill);
      refs.meterStats = el('span', 'meter-stats');
      refs.meter.append(refs.meterLabel, refs.meterTrack, refs.meterStats);
      refs.modelChip = el('button', 'model-chip', { type: 'button' }); refs.modelChip.hidden = true;
      refs.controls = el('div', 'memory-controls');
      refs.btnTidy = el('button', 'ghost', { type: 'button' });
      refs.btnFresh = el('button', 'ghost', { type: 'button' });
      refs.controls.append(refs.btnTidy, refs.btnFresh);
      refs.hud.append(refs.meter, refs.modelChip, refs.controls);
      refs.chat = el('section', 'buddy-chat'); refs.log = el('div', 'buddy-log');
      refs.composer = el('div', 'composer');
      refs.palette = el('div', 'palette', { role: 'listbox' }); refs.palette.hidden = true;
      refs.form = el('form'); refs.input = el('input', null, { autocomplete: 'off' });
      refs.send = el('button');
      refs.form.append(refs.input, refs.send);
      refs.composer.append(refs.palette, refs.form);
      refs.chat.append(refs.log, refs.composer);
      refs.lab.append(refs.hud, refs.chat);
      refs.picker = el('div', 'model-picker'); refs.picker.hidden = true;
      refs.keySheet = el('div', 'model-picker'); refs.keySheet.hidden = true;
      rootEl.append(refs.nameGate, refs.lab, refs.picker, refs.keySheet);
    }

    function boot() {
      refs.namePrompt.textContent = T('name.prompt');
      refs.nameInput.placeholder = T('name.placeholder');
      refs.nameGo.textContent = T('name.go');
      refs.input.placeholder = T('chat.placeholder');
      refs.send.textContent = T('chat.send');
      refs.meterLabel.textContent = T('meter.label');
      refs.btnFresh.textContent = T('control.fresh');
      refs.btnTidy.textContent = T('control.tidy');
      refs.nameGo.onclick = startLab;
      // Every submit is parsed FIRST (handleInput) — a slash input is routed as a command and NEVER
      // reaches /api/turn. Buttons + typed commands share the ONE execution path (runCommand).
      refs.form.onsubmit = (e) => { e.preventDefault(); handleInput(refs.input.value); };
      refs.input.addEventListener('input', onInputChange);
      refs.input.addEventListener('keydown', onInputKey);
      refs.btnFresh.onclick = () => runCommand('clear');
      refs.btnTidy.onclick = () => runCommand('compact');
      refs.modelChip.onclick = openPicker;
      // Attached to rootEl (not document) — a page-embedded widget must never grab global keys.
      // stopPropagation when the picker actually CONSUMED the Escape: the bubble widget listens
      // for Escape at document level to close the whole panel, and without the stop one press
      // would close the picker AND dismiss the panel out from under the child (layered close:
      // innermost open overlay eats the key; only a bare Escape reaches the widget).
      rootEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!refs.keySheet.hidden) { e.stopPropagation(); closeKeySheet(); return; }
        if (refs.picker.hidden) return;
        e.stopPropagation();
        closePicker();
      });
    }
    function startLab() {
      // Name-first: NO default buddy name offered — the child must type one (blank falls back to a
      // neutral placeholder only if they submit empty, never pre-filled/suggested in the input).
      buddyName = (refs.nameInput.value || 'Buddy').trim();
      refs.nameGate.hidden = true; refs.lab.hidden = false;
      // Push the chosen name up to the widget's name-tag header (buddy-widget.js owns the chrome; the
      // name is only known here). Optional + guarded: a host that mounts the chat core directly (no
      // widget) simply has no setBuddyName, and this is a no-op.
      // Both wrapped: these run BEFORE openLesson/loadModel/the greeting, so an unguarded throw here
      // aborted the rest of startLab and left the child in an empty lab with no lesson store at all —
      // and because the gate is hidden on the line above, it LOOKED like it had worked.
      if (typeof opts.setBuddyName === 'function') hostCall('setBuddyName', () => opts.setBuddyName(buddyName), undefined);
      if (typeof opts.onBuddyName === 'function') hostCall('onBuddyName', () => opts.onBuddyName(buddyName), undefined);
      openLesson();
      // Panel rendering is the HOST's job (its own subscribe/render loop) — this widget never reaches
      // outside rootEl, so there is no render() call to make here anymore.
      loadModel(); // ambient: populates the model chip; a failure just hides the chip (no error bubble)
      // The first-meet line is the HOST's to word (a workshop is not a champion): opts.greeting =
      // { first: (name) => string, back: (name) => string }, either optional; the p5-01 lines are
      // the defaults so every existing host greets exactly as before.
      addBubble('buddy', greetLine('first', buddyName));
    }

    /** The greeting, host-wordable (see startLab). Defaults are the original champion lines. */
    function greetLine(kind, name) {
      const g = opts.greeting || {};
      const custom = typeof g[kind] === 'function' ? hostCall('greeting.' + kind, () => g[kind](name), null) : (typeof g[kind] === 'string' ? g[kind].split('{name}').join(name) : null);
      if (custom) return String(custom);
      return kind === 'back' ? `Welcome back! It's me, ${name}. Let's keep tuning your champion!` : `Hi! I'm ${name}. Let's tune your champion together!`;
    }

    /** Returning-child entry: a host that mounts with a known buddy name (carried in the champion)
     *  skips the name-gate entirely and greets "welcome back" instead of the first-meet line. */
    function startLabSeeded(name) {
      buddyName = name;
      refs.nameGate.hidden = true; refs.lab.hidden = false;
      // Both wrapped: these run BEFORE openLesson/loadModel/the greeting, so an unguarded throw here
      // aborted the rest of startLab and left the child in an empty lab with no lesson store at all —
      // and because the gate is hidden on the line above, it LOOKED like it had worked.
      if (typeof opts.setBuddyName === 'function') hostCall('setBuddyName', () => opts.setBuddyName(buddyName), undefined);
      if (typeof opts.onBuddyName === 'function') hostCall('onBuddyName', () => opts.onBuddyName(buddyName), undefined);
      openLesson();
      loadModel();
      addBubble('buddy', greetLine('back', buddyName));
    }

    /**
     * Adopt a carried buddy name AFTER mount — the mid-session "bring in your champion" path
     * (stateless-buddy Task 7c). Before this existed, a champion imported once the widget was
     * already up kept the gate-typed name for the whole session AND exported it back OVER the
     * carried one (the host's export prefers the live name — see p5-01's refreshAndSerialize).
     * Three states, all owned here because only this closure knows them:
     *   - gate still open (no lesson yet) → the seeded returning-child entry, exactly as if the
     *     mount had carried opts.buddyName ("Welcome back!");
     *   - in the lab under a different name → rename in place: the closure var (buildTurnBody
     *     reads it live at send time, so the very next /api/turn carries it), the widget name-tag
     *     + host hooks, and ONE honest bubble — the name must never change silently in front of
     *     the child;
     *   - same name → no-op (a same-champion re-import must not spam the greeting).
     * Total: junk input is ignored — never throws, never blanks a working name.
     */
    function adoptName(name) {
      if (typeof name !== 'string' || !name.trim()) return;
      const n = name.trim();
      if (!lesson) { startLabSeeded(n); return; }
      if (n === buddyName) return;
      buddyName = n;
      if (typeof opts.setBuddyName === 'function') hostCall('setBuddyName', () => opts.setBuddyName(n), undefined);
      if (typeof opts.onBuddyName === 'function') hostCall('onBuddyName', () => opts.onBuddyName(n), undefined);
      addBubble('buddy', T('name.adopted').replace('{name}', n));
    }

    /**
     * Opens this page's lesson store, the moment the buddy's name is known (both entries call it, and
     * it MUST run before loadModel(), which pours the fetched spendCap + the child's stored model
     * choice into it). Also takes the lesson-start project snapshot the buddy compares against.
     * The day key is `localToday` ITSELF, not `localToday()` — passing the function keeps the rollover
     * live, so a tablet left open past midnight starts a new budget without being remounted.
     */
    function openLesson() {
      lesson = createLesson({
        projectId: (opts.manifest && opts.manifest.projectId) || 'project',
        buddyName,
        storage: safeStorage(),
        today: localToday,
      });
      lessonStart = snapshotState();
    }

    /**
     * The lesson-start project snapshot, best-effort. A host `getState()` that throws must not dead-end
     * the name gate (openLesson runs the instant the buddy is named, before the greeting) — and the
     * degrade is honest rather than invented: with no snapshot the field is simply omitted from the turn
     * body, and the server falls back to comparing against the CURRENT state, which is the truthful
     * answer to "what changed since we started?" when the start is unknown.
     * @returns {object|undefined}
     */
    function snapshotState() {
      return hostCall('getState', () => opts.getState(), undefined);
    }

    /**
     * The single front-door for the chat form: parse the raw input, and route a slash-command down the
     * command path (echo + execute) instead of the model. `chat` → the existing streaming send();
     * `command` → runCommand; `unknown-command` → a gentle hint bubble. A slash input NEVER hits
     * /api/turn. Clears the input + palette on every submit.
     * @param {string} raw
     */
    function handleInput(raw) {
      closePalette();
      const parsed = window.CommandParse.parseCommand(raw, hostWords);
      if (parsed.kind === 'chat') { refs.input.value = ''; send(raw); return; }
      refs.input.value = '';
      if (parsed.kind === 'unknown-command') { addBubble('buddy', T('cmd.unknown')); return; }
      runCommand(parsed.cmd, parsed.args);
    }

    /**
     * The ONE command-execution path shared by typed commands, palette picks, and the HUD buttons:
     * echo a dimmed monospace line into the log, then dispatch. `/model <id>` switches directly IF the
     * id is in the last-fetched list, else shows the unknown-command hint; `/model` with no args opens
     * the picker.
     * @param {string} cmd @param {string} [args]
     */
    function runCommand(cmd, args) {
      const a = (args || '').trim();
      addCommandEcho(`/${cmd}${a ? ' ' + a : ''}`);
      if (cmd === 'clear') return void freshStart();
      if (cmd === 'compact') return void tidyUp();
      if (cmd === 'help') return void addBubble('buddy', helpText());
      if (cmd === 'model') {
        if (!a) return void openPicker();
        if (modelList.some((m) => m.id === a)) return void pickModel(a);
        const byokHit = lockedList.find((m) => m.id === a) || customList.find((m) => m.id === a);
        if (byokHit) { return deviceKeys.get(byokHit.provider) ? void pickModel(a) : void openKeySheet(byokHit); }
        return void addBubble('buddy', T('cmd.unknown'));
      }
      // Host commands are dispatched LAST, so a built-in can never be shadowed even if the reserved
      // -name check in sanitizeHostCommands were somehow bypassed. Two independent guards, because
      // shadowing `/clear` would silently break the vocabulary this lesson deliberately teaches.
      const hostCmd = hostCommands.find((c) => c.cmd === cmd);
      if (hostCmd) return void runHostCommand(hostCmd, a);
    }

    /**
     * The `/help` line: our built-in sentence, plus the host's own commands when it declared any.
     * Built from the live list rather than a fixed string, so a host command can never be offered by
     * the palette while `/help` denies it exists.
     * @returns {string}
     */
    function helpText() {
      if (!hostCommands.length) return T('cmd.help');
      const mine = hostCommands.map((c) => `/${c.cmd} ${c.desc}`).join(' · ');
      return `${T('cmd.help')} ${T('cmd.help.yours')} ${mine}`;
    }

    /**
     * Runs one host-declared command. It ACTS IMMEDIATELY, with no [Do it] card — the owner's
     * explicit decision, on the grounds that the CHILD typed it by name, exactly like /clear and
     * /compact. The approval card exists for changes the BUDDY proposes, not for ones the child
     * asked for.
     * WRAPPED, because `run` is HOST code written by someone who has never seen this file: a throw
     * must never dead-end the chat. The child gets the same kid-safe line a failed action gets; the
     * developer gets the stack AND the command name, because "fails safe" and "fails invisibly" are
     * different things and only one of them is debuggable.
     * SLOW WORK (host-commands pending, 2026-08-11): `run` receives a settle ctx as its SECOND
     * argument — the SAME contract `opts.apply` gets. A sync `{note}`/nothing return never touches
     * it; returning `{pending:true, note?}` arms the deadline and the host calls `ctx.settle
     * (outcome)` later — note bubble, followUp card (Keep/Rewind), epoch guards, all identical to
     * an approved card's slow path. No claimed tool line exists for a typed command (flipEntry on
     * null is a guarded no-op), so only the bubbles/cards speak.
     * @param {{cmd:string, desc:string, run:Function}} hostCmd
     * @param {string} args the trimmed text after the command word
     */
    function runHostCommand(hostCmd, args) {
      // Sentinel, not `null`/`undefined`: a command that legitimately returns nothing is SILENT by
      // design, so the fallback has to be distinguishable from a real "no note" answer.
      const FAILED = {};
      const ctx = makeSettleCtx({ op: `/${hostCmd.cmd}` }, null);
      const res = hostCall(`/${hostCmd.cmd} command`, () => hostCmd.run(args, ctx), FAILED);
      if (res === FAILED) { addBubble('buddy', T('apply.failed')); return; }
      if (res && res.pending === true) {
        ctx._arm(); // the deadline backstop, exactly like a card apply that went pending
        if (typeof res.note === 'string' && res.note) addBubble('buddy', res.note);
        return;
      }
      // `{note}` is optional: a command that returns nothing is deliberately SILENT (it presumably
      // changed the host's own UI, which the child can already see). Only a non-empty string speaks.
      if (res && typeof res.note === 'string' && res.note) addBubble('buddy', res.note);
    }

    /** Dimmed monospace echo of a typed/tapped command (`> /compact`) — textContent only. */
    function addCommandEcho(text) {
      const d = document.createElement('div'); d.className = 'cmd-echo'; d.textContent = `> ${text}`;
      refs.log.appendChild(d); refs.log.scrollTop = refs.log.scrollHeight;
    }
    /** System-style log line (e.g. a model switch) — same dimmed look, no `>` prefix. */
    function addSystemLine(text) {
      const d = document.createElement('div'); d.className = 'cmd-echo'; d.textContent = text;
      refs.log.appendChild(d); refs.log.scrollTop = refs.log.scrollHeight;
    }

    // ── Command palette ────────────────────────────────────────────────────────────────────────
    /** `input` handler: open the palette (filtered by the typed prefix) whenever the value starts '/'. */
    function onInputChange() {
      const v = refs.input.value;
      if (v.startsWith('/')) openPalette(v); else closePalette();
    }
    /**
     * Keydown on the chat input. When the palette is OPEN, Arrow keys move the focus, Enter runs the
     * focused command (or, if args were typed, submits the raw line), Escape closes it. When the
     * palette is CLOSED this returns immediately so normal typing + Enter-to-submit are untouched.
     * @param {KeyboardEvent} e
     */
    function onInputKey(e) {
      if (refs.palette.hidden || !paletteItems.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteIdx = (paletteIdx + 1) % paletteItems.length; highlightPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIdx = (paletteIdx - 1 + paletteItems.length) % paletteItems.length; highlightPalette(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); } // consumed — must not also close a hosting widget panel (layered close)
      else if (e.key === 'Enter') {
        e.preventDefault();
        const v = refs.input.value;
        // Typed args (a space) mean the child wants THAT line, not the highlighted bare command.
        if (v.includes(' ')) handleInput(v);
        else if (paletteItems[paletteIdx]) choosePalette(paletteItems[paletteIdx].cmd);
      }
    }
    /** @param {string} v the current input value (starts with '/'). */
    function openPalette(v) {
      const typed = v.slice(1).split(' ')[0].toLowerCase();
      const matches = COMMANDS.filter((c) => c.cmd.startsWith(typed));
      const box = refs.palette;
      box.textContent = ''; paletteItems = [];
      if (!matches.length) { closePalette(); return; }
      for (const c of matches) {
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.setAttribute('role', 'option');
        const name = document.createElement('span'); name.className = 'palette-name'; name.textContent = `/${c.cmd}`;
        const desc = document.createElement('span'); desc.className = 'palette-desc'; desc.textContent = c.desc;
        item.append(name, desc);
        item.onclick = () => choosePalette(c.cmd);
        box.appendChild(item);
        paletteItems.push({ cmd: c.cmd, el: item });
      }
      paletteIdx = 0; highlightPalette();
      box.hidden = false;
    }
    function highlightPalette() {
      paletteItems.forEach((p, i) => p.el.classList.toggle('focused', i === paletteIdx));
    }
    function closePalette() {
      const box = refs.palette;
      box.hidden = true; box.textContent = ''; paletteItems = []; paletteIdx = -1;
    }
    /** A palette pick runs the bare command through the shared path (same as typing it + Enter). */
    function choosePalette(cmd) {
      closePalette(); refs.input.value = ''; runCommand(cmd, '');
    }

    // ── Model chip + picker ────────────────────────────────────────────────────────────────────
    /**
     * Ambient GET /api/model at lab start: fills the chip. A failure hides the chip — no error bubble.
     * Also the ONE place the child's browser learns its `spendCap` (the server no longer counts for
     * them — spec §7.1); until it lands the store's cap is unknown, and an unknown cap never refuses.
     * The chip prefers the child's OWN stored choice over the server's boot default: `data.current` is
     * only what the gateway would use absent a choice, so showing it would lie about which brain the
     * next turn will actually use.
     */
    async function loadModel() {
      try {
        const r = await api('/api/model');
        if (!r.ok) throw new Error(`gateway responded ${r.status}`);
        const data = await r.json();
        modelList = Array.isArray(data.models) ? data.models : [];
        lockedList = Array.isArray(data.lockedModels) ? data.lockedModels : [];
        byokProviderList = Array.isArray(data.byokProviders) ? data.byokProviders : [];
        serverDefaultId = data.current || null;
        if (lesson && typeof data.spendCap === 'number') lesson.setSpendCap(data.spendCap);
        currentModelId = (lesson && lesson.model()) || data.current || null;
        updateChip();
      } catch (e) {
        refs.modelChip.hidden = true; // ambient control — degrade silently (AGENTS.md crash-proof I/O)
      }
    }
    function updateChip() {
      const chip = refs.modelChip;
      if (!currentModelId) { chip.hidden = true; return; }
      chip.textContent = `${T('model.current')}: ${currentModelId}`;
      chip.hidden = false;
    }
    /** Opens the DOM-built model picker (label + id + kidNote per model, current marked). */
    async function openPicker() {
      if (!modelList.length) {
        // The ambient startLab() fetch failed (or hasn't landed) — retry ON DEMAND before giving up.
        // A typed `/model` must never silently no-op (crash-proof I/O: dead-ends are the failure).
        await loadModel();
        if (!modelList.length) return void addBubble('buddy', T('chat.error'));
      }
      const box = refs.picker;
      box.textContent = '';
      const panel = document.createElement('div'); panel.className = 'picker-panel';
      const title = document.createElement('h2'); title.className = 'picker-title'; title.textContent = T('model.title');
      panel.appendChild(title);
      // One row-shape shared by the server-unlocked list AND the (device-unlocked) BYOK rows below —
      // hoisted so both sections render identically save the two documented differences on locked rows.
      function buildRow(m) {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'picker-row';
        if (m.id === currentModelId) row.classList.add('current');
        const label = document.createElement('span'); label.className = 'picker-label'; label.textContent = m.label;
        row.appendChild(label);
        // Custom (typed) entries set `label` to the id itself (spec §3.4 — no invented display name),
        // so a SEPARATE id span here would just print the exact same text twice (fold-in 5, a real
        // playtest catch). Only add the id line when it carries information the label doesn't already.
        if (m.id !== m.label) {
          const id = document.createElement('span'); id.className = 'picker-id'; id.textContent = m.id;
          row.appendChild(id);
        }
        const note = document.createElement('span'); note.className = 'picker-note'; note.textContent = m.kidNote;
        row.appendChild(note);
        // WHO MADE IT — shown because this product teaches AI literacy: the child should read that a
        // model comes from a company (Google, OpenAI, DeepSeek…), not from a mascot. Appended only
        // when the registry actually knows the maker; an unverified attribution is omitted, never guessed.
        // …and WHICH provider it is reached through, because the same model can legitimately appear
        // twice by two routes (e.g. DeepSeek V4 Flash free via Zen and direct from DeepSeek). Without
        // this the two rows look identical; with it the child also sees that a model and the service
        // that serves it are different things.
        const origin = [m.maker ? T('model.picker.by') + ' ' + m.maker : '', m.providerLabel ? T('model.picker.via') + ' ' + m.providerLabel : '']
          .filter(Boolean).join(' · ');
        if (origin) { const by = document.createElement('span'); by.className = 'picker-maker'; by.textContent = origin; row.appendChild(by); }
        if (m.id === currentModelId) { const cur = document.createElement('span'); cur.className = 'picker-current'; cur.textContent = T('model.picker.current'); row.appendChild(cur); }
        row.onclick = () => { closePicker(); if (m.id !== currentModelId) pickModel(m.id); };
        return row;
      }
      for (const m of modelList) panel.appendChild(buildRow(m));
      // BYOK (spec §3): locked ids the device already holds a key for render as normal, plain rows —
      // the child already unlocked them, so there is nothing left to ask. Ids with no device key get
      // their own headed section, a "needs a key" note, and a tap that opens the key sheet instead of
      // picking the model directly — never a dead row (crash-proof I/O: every row does SOMETHING).
      const lockedRows = lockedList.filter((m) => !deviceKeys.get(m.provider));
      const unlockedByok = lockedList.filter((m) => deviceKeys.get(m.provider));
      // Custom (Task 6, spec §3.4): a typed model follows the SAME rule as a locked one — a device
      // key for its provider makes it a normal row; no key joins the locked section below. Label is
      // the typed id itself, never an invented display name, and the note says so plainly.
      const customRows = customList.map((m) => ({
        ...m,
        label: m.id,
        kidNote: T('custom.note'),
        providerLabel: (byokProviderList.find((p) => p.id === m.provider) || {}).label || m.provider,
      }));
      const unlockedCustom = customRows.filter((m) => deviceKeys.get(m.provider));
      const lockedCustom = customRows.filter((m) => !deviceKeys.get(m.provider));
      for (const m of unlockedByok) panel.appendChild(buildRow(m)); // device-unlocked: normal rows
      for (const m of unlockedCustom) panel.appendChild(buildRow(m));
      const allLocked = lockedRows.concat(lockedCustom);
      if (allLocked.length) {
        const h = document.createElement('h3'); h.className = 'picker-locked-header'; h.textContent = T('model.locked.header');
        panel.appendChild(h);
        for (const m of allLocked) {
          const row = buildRow(m);
          row.classList.add('locked');
          // Just "needs a key" — the provider is NOT repeated here. buildRow's own maker line already
          // ends in "via OpenRouter" for every locked row, so naming it twice inside one row read as
          // clutter on the real panel (caught on the owner's screen), and the key sheet the tap opens
          // states the provider in a full sentence anyway.
          const need = document.createElement('span'); need.className = 'picker-note';
          need.textContent = T('model.locked');
          row.appendChild(need);
          row.onclick = () => { closePicker(); openKeySheet(m); }; // tap-to-unlock, never a dead row
          panel.appendChild(row);
        }
      }
      // Panel footer (Task 6): the tucked-away power path — manage device keys, or add any model by
      // typed id. Ghost buttons so they read as secondary to the model rows above.
      const manage = el('button', 'ghost picker-footer', { type: 'button' }); manage.textContent = T('keys.manage');
      manage.onclick = () => { closePicker(); openKeysManage(); };
      const addAny = el('button', 'ghost picker-footer', { type: 'button' }); addAny.textContent = T('custom.add');
      addAny.onclick = () => { closePicker(); openAddModel(); };
      panel.append(manage, addAny);
      box.appendChild(panel);
      box.onclick = (e) => { if (e.target === box) closePicker(); }; // tap the backdrop to dismiss
      box.hidden = false;
    }
    function closePicker() { const box = refs.picker; box.hidden = true; box.textContent = ''; }
    /**
     * Picks the brain the NEXT turn will use — a purely CLIENT act now (Scope Law spec §7.1). There is
     * no live server-side model to switch anymore: the choice is stored per project in this child's own
     * lesson store and rides in every turn's body, so it can never leak into another child's session on
     * a shared tablet. Nothing can fail here, hence no try/catch and no error bubble.
     * The meter is deliberately NOT re-rendered: usage% depends on the NEW model's context limit, which
     * only the server knows, and it arrives with the next turn's done frame (the meter is per-turn
     * anyway). Faking a new percentage locally would be a guess dressed as a reading.
     * @param {string} id a whitelisted model id (already checked against modelList by the caller).
     */
    function pickModel(id) {
      const from = currentModelId;
      if (lesson) lesson.setModel(id);
      currentModelId = id;
      updateChip();
      addSystemLine(`${T('model.switched')} ${from} → ${id}`);
    }

    /**
     * The footer row every BYOK sheet ends with: the one action that DOES the thing, beside the one
     * that backs out. They used to be appended straight into the sheet as two more full-width
     * children, which made the primary button read as the least important thing on the panel (the
     * owner's screen showed "Use it" as bare text under two bordered buttons — a host stylesheet only
     * styles `button.ghost`, so an unclassed button inherits nothing). `sheet-primary` is what the
     * hosts style as the affirmative action; the row keeps the pair on one line, primary first.
     * @param {HTMLElement} primary @param {HTMLElement} secondary @returns {HTMLElement}
     */
    function sheetActions(primary, secondary) {
      primary.classList.add('sheet-primary');
      const row = el('div', 'sheet-actions');
      row.append(primary, secondary);
      return row;
    }

    /**
     * The key sheet (spec §3.2): tap a locked model → explain who serves it → paste the key →
     * that provider unlocks ON THIS DEVICE and the tapped model is picked. The input is
     * type=password with a show/hide toggle; the key goes straight to the device store — it is
     * NOT chat, never enters the transcript, and never renders back in full.
     */
    function openKeySheet(m) {
      const box = refs.keySheet;
      box.textContent = '';
      const panel = el('div', 'picker-panel');
      const title = el('h2', 'picker-title'); title.textContent = T('keys.title');
      const body = el('p', 'key-sheet-body');
      body.textContent = `${m.label} ${T('keys.body.serves')} ${m.providerLabel}. ${T('keys.body.bill')}`;
      const input = el('input', 'key-input', { type: 'password', autocomplete: 'off' });
      input.placeholder = T('keys.placeholder');
      const toggle = el('button', 'ghost key-toggle', { type: 'button' }); toggle.textContent = T('keys.show');
      toggle.onclick = () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; toggle.textContent = show ? T('keys.hide') : T('keys.show'); };
      // show/hide belongs ON the field it reveals, not stacked under it as a third full-width button
      // competing with the two real choices below.
      const field = el('div', 'key-field'); field.append(input, toggle);
      const err = el('p', 'custom-error'); err.hidden = true; err.textContent = T('keys.empty');
      const save = el('button', null, { type: 'button' }); save.textContent = T('keys.save');
      const cancel = el('button', 'ghost', { type: 'button' }); cancel.textContent = T('keys.cancel');
      save.onclick = () => {
        // A blank/whitespace paste must NOT read as "declined" (that's what [Not now] is for): fold-in
        // 4 — the sheet used to close silently either way, so a mis-tap looked exactly like a working
        // save with nothing to show for it. `deviceKeys.set` already no-ops on blank input, so the old
        // code's `if (deviceKeys.get(...))` check merely detected the failure AFTER the sheet was gone;
        // checking BEFORE closing keeps the child in front of the input instead.
        if (!input.value.trim()) { err.hidden = false; return; }
        deviceKeys.set(m.provider, input.value);
        closeKeySheet();
        if (deviceKeys.get(m.provider)) pickModel(m.id); // saved → the tapped model is the choice
      };
      cancel.onclick = closeKeySheet;
      panel.append(title, body, field, err, sheetActions(save, cancel));
      box.appendChild(panel);
      box.onclick = (e) => { if (e.target === box) closeKeySheet(); };
      box.hidden = false;
      input.focus();
    }
    function closeKeySheet() { refs.keySheet.hidden = true; refs.keySheet.textContent = ''; }

    /**
     * "Your keys" management sheet (spec §3.3, Task 6): one row per provider the device already
     * holds a key for — `${label} · last-4 mask` plus Remove — so a wrong/expired key gets pulled
     * from ONE place instead of hunting back through whichever locked model first asked for it.
     * Custom (typed) entries get their own removable rows too, same surface. Reuses refs.keySheet
     * (the exact overlay pattern as openKeySheet — the two never show at once).
     */
    function openKeysManage() {
      const box = refs.keySheet;
      box.textContent = '';
      const panel = el('div', 'picker-panel');
      const title = el('h2', 'picker-title'); title.textContent = T('keys.manage.title');
      panel.appendChild(title);
      const held = byokProviderList.filter((p) => deviceKeys.get(p.id));
      if (!held.length && !customList.length) {
        const none = el('p', 'key-sheet-body'); none.textContent = T('keys.none');
        panel.appendChild(none);
      }
      for (const p of held) {
        const row = el('div', 'picker-row key-row');
        const label = el('span', 'picker-label'); label.textContent = `${p.label} · ${deviceKeys.mask(p.id)}`;
        const remove = el('button', 'ghost', { type: 'button' }); remove.textContent = T('keys.remove');
        remove.onclick = () => {
          deviceKeys.remove(p.id);
          // If the CURRENT model just lost its key, fall back honestly and immediately (spec §3.3) —
          // the alternative is a chip that lies until the next turn's server-side fallback corrects it.
          const cur = lesson && lesson.model();
          const nowLocked = byokFieldsFor(cur, modelList, lockedList, customList, deviceKeys) === null
            && (lockedList.some((m) => m.id === cur) || customList.some((m) => m.id === cur));
          if (nowLocked && serverDefaultId) {
            // ONE line for one involuntary event — same idiom as send()'s done-frame fallback block. Unlike
            // that block, the STORED pick IS overwritten here: removing the key was the device owner's own
            // deliberate act, so keeping a dead choice would just re-announce the fallback every session.
            if (lesson) lesson.setModel(serverDefaultId);
            currentModelId = serverDefaultId;
            updateChip();
            addSystemLine(`${T('model.fallback')} ${serverDefaultId}`);
          }
          openKeysManage(); // re-render the sheet
        };
        row.append(label, remove);
        panel.appendChild(row);
      }
      // Typed models are also device-scoped — remove them from this same one-stop surface.
      for (const m of customList) {
        const row = el('div', 'picker-row key-row');
        const label = el('span', 'picker-label'); label.textContent = m.id;
        const remove = el('button', 'ghost', { type: 'button' }); remove.textContent = T('keys.remove');
        remove.onclick = () => { customStore.remove(m.id); customList = customStore.list(); openKeysManage(); };
        row.append(label, remove);
        panel.appendChild(row);
      }
      // This sheet has no affirmative action — every change here already took effect on tap — so its
      // one button is the way out, and it gets the primary treatment for exactly that reason.
      const done = el('button', null, { type: 'button' }); done.textContent = T('keys.done');
      done.onclick = closeKeySheet;
      const row = el('div', 'sheet-actions'); done.classList.add('sheet-primary'); row.appendChild(done);
      panel.appendChild(row);
      box.appendChild(panel);
      box.onclick = (e) => { if (e.target === box) closeKeySheet(); };
      box.hidden = false;
    }

    /** "Add any model" (spec §3.4): provider dropdown + a typed id. The entry lands in the picker
     *  immediately — unlocked or locked purely by DEVICE key presence (a typed model never rides
     *  the deployer's env key). Labels stay the typed id — honest naming, never invented. */
    function openAddModel() {
      const box = refs.keySheet;
      box.textContent = '';
      const panel = el('div', 'picker-panel');
      const title = el('h2', 'picker-title'); title.textContent = T('custom.title');
      const sel = el('select', 'custom-provider');
      for (const p of byokProviderList) { const o = el('option', null, { value: p.id }); o.textContent = p.label; sel.appendChild(o); }
      const input = el('input', 'custom-id', { autocomplete: 'off' }); input.placeholder = T('custom.placeholder');
      const err = el('p', 'custom-error'); err.hidden = true; err.textContent = T('custom.bad');
      const save = el('button', null, { type: 'button' }); save.textContent = T('custom.save');
      const cancel = el('button', 'ghost', { type: 'button' }); cancel.textContent = T('keys.cancel');
      save.onclick = () => {
        if (!customStore.add(sel.value, input.value.trim())) { err.hidden = false; return; }
        customList = customStore.list();
        closeKeySheet();
        openPicker();
      };
      cancel.onclick = closeKeySheet;
      panel.append(title, sel, input, err, sheetActions(save, cancel));
      box.appendChild(panel);
      box.onclick = (e) => { if (e.target === box) closeKeySheet(); };
      box.hidden = false;
      input.focus();
    }

    // ── Live tool lines ────────────────────────────────────────────────────────────────────────
    /**
     * Appends a `● summary — waiting for your OK` line and tracks it in the per-turn pending list.
     * The server's summary already LEADS with the op (e.g. `Add 2 to foil (Photos)` — see
     * server/tool-summary.js), so the line shows the summary alone — wrapping it in `op(...)`
     * again would print the op twice (seen live). A screened-degraded summary is the bare op name,
     * so the op is always visible either way.
     */
    function addToolLine(f) {
      const el = document.createElement('div');
      el.className = 'tool-line';
      const base = f.summary || f.op;
      // A READ frame (`source:'read'` — a runCheck on a manifest-declared readOnly check) is ALREADY
      // DONE the moment it is reported: it changed nothing, so it raises no action card and there is
      // nothing to approve. Two things must therefore differ from a proposal, and both matter:
      //   1. It must NOT say "waiting for your OK". That sentence on a completed look is the exact
      //      lie this whole feature exists to remove — the owner's playtest caught the buddy telling
      //      a child to "tap Yes or OK" for a check that had already run. Relocating it into the
      //      console would just move the lie somewhere quieter.
      //   2. It must NOT enter `pendingTools`. `flipTool` matches the first un-flipped line BY OP,
      //      and a read is a `runCheck` — so a lingering read line would steal the flip belonging to
      //      a genuine `runCheck` proposal later in the same turn, leaving the real card's line stuck
      //      on "waiting" forever.
      if (f.source === 'read') {
        el.className = 'tool-line done';
        el.textContent = `✓ ${base} — ${T('tool.looked')}`;
        refs.log.appendChild(el); refs.log.scrollTop = refs.log.scrollHeight;
        return;
      }
      el.textContent = `● ${base}${f.direct === true && opts.manifest.directEdits === true ? '' : ' — ' + T('tool.waiting')}`;
      refs.log.appendChild(el); refs.log.scrollTop = refs.log.scrollHeight;
      pendingTools.push({ op: f.op, el, base, flipped: false, claimed: false });
    }
    /**
     * Claims the first unclaimed, un-flipped line of `op` for one action card, at the moment that
     * card renders (host-augment brief Task 2). flipEntry/markWorking then target the returned entry
     * DIRECTLY — never by another by-op search — so two in-flight cards of the SAME op (e.g. two
     * `runCheck: toughenShelf` proposals, one per group) can no longer cross: settling the second one
     * tapped used to be able to flip the FIRST one's line, because the old `flipTool(op, state)` just
     * grabbed "the first un-flipped line matching this op" with no memory of which card asked. A
     * claimed line is invisible to `flipTool` (see below), so a card that never claims one (there is
     * no proposal open) simply finds nothing, same as always.
     * @param {string} op
     * @returns {?{op:string, el:HTMLElement, base:string, flipped:boolean, claimed:boolean}}
     */
    function claimToolLine(op) {
      const entry = pendingTools.find((p) => !p.flipped && !p.claimed && p.op === op);
      if (entry) entry.claimed = true;
      return entry || null;
    }
    /**
     * Flips one already-resolved ENTRY (not an op lookup) to done/skipped — the glyph + trailing
     * status, plus the `.done`/`.skipped` class. This is the primitive both `flipTool` (by-op, for
     * callers with no claimed line of their own — addRememberCard) and the claim-based [Do it]/settle
     * paths funnel through, so the actual DOM mutation lives in exactly one place. No-op on a missing
     * or already-flipped entry (a stub/filter turn with no matching line, or a double-settle — see
     * makeSettleCtx, which relies on this idempotence too).
     * @param {?{el:HTMLElement, base:string, flipped:boolean}} entry @param {'done'|'skipped'} state
     */
    function flipEntry(entry, state) {
      if (!entry || entry.flipped) return;
      entry.flipped = true;
      const glyph = state === 'done' ? '✓' : '✗';
      const status = state === 'done' ? T('tool.done') : T('tool.skipped');
      entry.el.textContent = `${glyph} ${entry.base} — ${status}`;
      entry.el.classList.add(state);
    }
    /**
     * Flips a claimed line to the WORKING state — the instant a slow apply() returns {pending:true}
     * and never later, which is the honesty rule this whole contract exists for: the line must say
     * so, not sit on "waiting for your OK" and never say "done" before ctx.settle actually runs it.
     * @param {?{el:HTMLElement, base:string, flipped:boolean}} entry
     */
    function markWorking(entry) {
      if (!entry || entry.flipped) return;
      entry.el.textContent = `● ${entry.base} — ${T('tool.working')}`;
      entry.el.classList.add('working');
    }
    /**
     * Flips the FIRST un-flipped, UNCLAIMED pending line matching `op` to done/skipped. No-op if
     * there's no matching line (e.g. a stub/filter turn proposed an action without a mid-stream tool
     * frame). Claimed lines (host-augment brief Task 2) are invisible here on purpose: the card that
     * claimed one via claimToolLine holds it and calls flipEntry directly, so a second in-flight card
     * of the same op can never steal it out from under the first. addRememberCard still calls this
     * unchanged — a remember card never claims a line, so nothing here is different for it.
     * @param {string} op @param {'done'|'skipped'} state
     */
    function flipTool(op, state) {
      const entry = pendingTools.find((p) => !p.flipped && !p.claimed && p.op === op);
      flipEntry(entry, state);
    }
    /** Removes the current turn's tool lines (a `cut` turn's proposals are discarded server-side).
     *  Does NOT bump `chatEpoch` (round-2 review fix — a first draft did, and that was the bug): a
     *  `cut` turn is discarded server-side BEFORE its `done` frame ever arrives, so `addActions` never
     *  ran for it and NO CARD — therefore no `makeSettleCtx` ctx — can exist for the turn being
     *  cleared here. `chatEpoch` is mount-scoped, not per-turn, so bumping it here would invalidate
     *  EVERY ctx from EVERY earlier turn too, including a genuinely still-pending one the child
     *  approved several messages ago (the composer is never locked while a slow action is in flight —
     *  nothing stops the child from chatting on, and a later message getting `cut` is an ordinary kid-
     *  safety deflection, not a sign that earlier work should be abandoned). That earlier ctx's
     *  `settle()`/deadline would then silently no-op forever, leaving its tool line stuck at "working"
     *  with no recovery — the exact regression this comment exists to keep out. `chatEpoch`'s ONE job
     *  stays "the whole log was wiped" (Fresh Start, below) — a `cut` turn wipes nothing but its own,
     *  never-carded proposals. */
    function clearToolLines() { for (const p of pendingTools) p.el.remove(); pendingTools = []; }
    function addBubble(who, text) { const d = document.createElement('div'); d.className = `bubble ${who}`; d.textContent = text; refs.log.appendChild(d); refs.log.scrollTop = refs.log.scrollHeight; return d; }

    /**
     * Renders the buddy's markdown-ish reply into `el` as REAL DOM nodes. Model output is never
     * passed to innerHTML — every string goes through textContent, so a reply can't inject HTML.
     * `text` is untrusted MODEL OUTPUT; window.KidMarkdown.toBlocks (logic/kid-markdown.js) is a pure
     * parser that turns it into plain Block/Span data, never an HTML string — that split is what
     * keeps this XSS-proof by construction. Called on every streamed token AND on the terminal frame
     * (see send()'s paint()), so it must tolerate ragged partial markdown — toBlocks already does.
     * @param {HTMLElement} el
     * @param {string} text
     */
    function renderRich(el, text) {
      el.textContent = '';
      const blocks = window.KidMarkdown.toBlocks(text);
      const spansInto = (parent, spans) => {
        for (const s of spans) {
          const node = s.bold ? document.createElement('strong')
            : s.code ? document.createElement('code')
            : null;
          if (node) { node.textContent = s.text; parent.appendChild(node); }
          else parent.appendChild(document.createTextNode(s.text));
        }
      };
      for (const b of blocks) {
        if (b.type === 'ul' || b.type === 'ol') {
          const list = document.createElement(b.type);
          for (const item of b.items) { const li = document.createElement('li'); spansInto(li, item); list.appendChild(li); }
          el.appendChild(list);
        } else {
          const p = document.createElement(b.type === 'h' ? 'h4' : 'p');
          spansInto(p, b.spans);
          el.appendChild(p);
        }
      }
    }

    /**
     * Pulsing "…" bubble shown the instant a turn is sent, before the first delta frame arrives.
     * CSS-only animation (see styles.css .bubble.thinking) — stays under 3 flashes/sec (flash-safety)
     * and honors prefers-reduced-motion. Returns the element so send() can remove it once real text
     * (a delta, or a terminal frame with no visible text) is ready to take its place.
     * @returns {HTMLDivElement}
     */
    function addThinking() {
      const d = document.createElement('div'); d.className = 'bubble buddy thinking';
      d.innerHTML = '<span></span><span></span><span></span>'; // 3 dots animated via CSS
      d.setAttribute('aria-label', 'thinking'); refs.log.appendChild(d); refs.log.scrollTop = refs.log.scrollHeight; return d;
    }

    /**
     * Renders `res.meter` (`{total,limit,usage,cost}` — see logic/meter.js) into the ambient gauge.
     * `usage` is a 0..100 percent, or `null` when the model's context limit isn't known (unset/0).
     * Honest degradation (AGENTS.md "crash-proof, best-effort I/O"):
     * on `usage===null` the bar is HIDDEN rather than faked at some guessed width — the real token
     * count + cost still render, just without a percentage.
     * @param {{total:number, limit:(number|null), usage:(number|null), cost:number}|undefined} meter
     */
    function renderMeter(meter) {
      if (!meter) return;
      const total = meter.total || 0;
      const cost = meter.cost || 0;
      const usage = meter.usage;
      const track = refs.meterTrack;
      if (typeof usage === 'number') {
        track.hidden = false;
        // transform:scaleX (not width) so the bar's growth is a compositor-only animation, never a
        // layout-thrashing property (repo design lint: layout-transition).
        refs.meterFill.style.transform = `scaleX(${Math.max(0, Math.min(100, usage)) / 100})`;
      } else {
        track.hidden = true;
      }
      const usageText = typeof usage === 'number' ? ` (${usage}%)` : '';
      refs.meterStats.textContent = `${total} tokens${usageText} · ${T('meter.cost')} $${cost.toFixed(4)}`;
    }

    /**
     * Renders `[Do it]/[No thanks]` cards for each buddy-proposed action. A `rememberUser` proposal
     * is NOT a project-tuning action — it never touches project state, it proposes durable memory —
     * so it gets its own card shape/copy (addRememberCard) instead. Labels resolve through the host's
     * own manifest via window.ProjectState.actionLabel, so this function knows nothing about any
     * particular project's vocabulary (Recycle-Eye, Reflex-Wiring, or any future project).
     * @param {object[]} actions
     */
    function addActions(actions) {
      for (const a of actions) {
        if (a.op === 'rememberUser') { addRememberCard(a); continue; }
        const wrap = el('div', 'actions');
        // Claimed the INSTANT this card is built, not when [Do it] is tapped (host-augment brief
        // Task 2) — two same-op cards can render in one turn (a `takesGroup` check proposed once per
        // group, e.g. Glass and Metal both `runCheck: toughenShelf`), and whichever card taps first
        // must own ITS OWN tool line, never whichever line happens to be oldest. See claimToolLine.
        const line = claimToolLine(a.op);
        const label = el('span', 'action-label');
        label.textContent = window.ProjectState.actionLabel(a, opts.manifest);
        // Host-authored per-card caution line (opts.cardNote, host-augment brief Task 2) — e.g. "Metal
        // and Foil already look alike." Optional and best-effort like every other host callback: ''
        // or a throw renders no line at all, never a broken card.
        const extra = typeof opts.cardNote === 'function' ? hostCall('cardNote', () => opts.cardNote(a), '') : '';
        const yes = el('button'); yes.textContent = T('action.do');
        const no = el('button', 'ghost'); no.textContent = T('action.no');
        if (typeof extra === 'string' && extra) {
          const noteEl = el('span', 'action-note');
          noteEl.textContent = extra;
          wrap.append(label, noteEl, yes, no);
        } else {
          wrap.append(label, yes, no);
        }
        yes.onclick = () => {
          wrap.remove();
          // THE call this whole boundary exists for. `wrap.remove()` has already run, so an
          // unguarded throw here left the child looking at a card that vanished and then NOTHING —
          // no bubble, no failure line, and the tool line stuck on "waiting for your OK" forever.
          // A throw is now treated exactly as `{ok:false}`: the same kid-safe line and the same
          // skipped flip an honest refusal gets, because from the child's chair they are the same
          // event. (p5-01 shipped this bug once already — see its game.js note on checkPhotos.)
          const ctx = makeSettleCtx(a, line);
          const res = hostCall('apply', () => opts.apply(a, ctx), null);
          // DELIBERATE RULING, REWRITTEN (host-augment brief Task 2 — the original said apply() must
          // be SYNCHRONOUS, full stop; that is now only half the story). apply() must return EITHER
          // synchronously (`{ok, note}` or a throw — unchanged since the host-callback-boundary work)
          // OR, for genuinely slow work, `{pending: true, note?}` plus a LATER `ctx.settle(outcome)`
          // call from wherever that work actually finishes. A bare Promise is still exactly the trap
          // it always was: truthy but carrying no `.ok`, so it silently falls into the refusal path
          // below and EVERY action appears to fail — the mistake a developer reaching for `async
          // apply()` out of habit would make. So it stays a loud console error, not a third supported
          // shape. Awaiting the thenable was considered and rejected for the same reason as before: a
          // slow host would let the child tap a second same-op card first, and matching by op ALONE
          // let two in-flight actions cross and flip each other's lines. That hazard is what
          // claimToolLine (above) actually fixes now — this ruling is about the RETURN SHAPE, not
          // the line-matching, which is why it survives pending's arrival unchanged.
          if (res && typeof res.then === 'function' && window.console && console.error) {
            console.error('buddy: your apply() returned a Promise — return {ok, note} synchronously, or {pending: true} and call ctx.settle(outcome) when the work finishes.');
          }
          if (res && res.pending === true) {
            // Slow action: the line says WORKING (never "done" before it is — the honesty rule this
            // contract exists for), the host's note explains what started, and ctx.settle finishes it.
            markWorking(line);
            if (typeof res.note === 'string' && res.note) addBubble('buddy', res.note);
            ctx._arm();
            return;
          }
          if (res && res.ok) {
            addBubble('buddy', a.op === 'undoLast' ? T('action.undo.done') : `Done! ${res.note}`);
            flipEntry(line, 'done');
          } else {
            // A host {ok:false} with a NON-EMPTY string note speaks THAT note, not the generic
            // line. The host is already trusted to author child-facing strings on the ok and
            // settle paths; swallowing its kid-voiced refusal here was spec §6.1's "refuse out
            // loud" broken at the last seam — p5-01's "Those photos came back from a saved
            // champion…" rendered as "Hmm, that change didn't fit", which explains nothing.
            // A throw still lands here as null (hostCall) → generic line, unchanged.
            const refusal = res && typeof res.note === 'string' && res.note ? res.note : T('apply.failed');
            addBubble('buddy', refusal);
            flipEntry(line, 'skipped');
          }
        };
        no.onclick = () => { wrap.remove(); flipEntry(line, 'skipped'); };
        // Scroll on append, like the bubbles/tool lines do. This card and addRememberCard were the
        // only two append paths without it, and both arrive LAST in a turn — after the streamed
        // reply already scrolled — so precisely the element asking for the child's tap was the one
        // sitting below the fold (owner screenshot 2026-08-11).
        refs.log.appendChild(wrap); refs.log.scrollTop = refs.log.scrollHeight;
        // Same validated host apply, undo and refusal path as a click. Opt-in belongs to
        // the mounted host, never to the model's response. Memory has its own earlier branch.
        if (window.ActionSchema && window.ActionSchema.isDirectAction(a, opts.manifest)) yes.click();
      }
    }

    /** Per-approved-action settle context for slow hosts (host-augment brief Task 2, spec §4). Handed
     *  to `opts.apply` as its second argument on EVERY call — a host that ignores it keeps today's
     *  behaviour exactly, because a sync `{ok}`/`{ok:false}` return never touches `ctx` at all. Built
     *  fresh per [Do it] tap, closing over the exact line THIS card claimed (never re-looked-up by op)
     *  and a one-shot `settled` flag: `ctx.settle` is safe to call more than once (a slow host racing
     *  its own retry logic is a real shape, not a hypothetical), a late `settle` after `_arm`'s
     *  deadline fires is a no-op, and every DOM touch checks `refs.log.isConnected` first so a settle
     *  arriving after an unmount can never throw into a host's own callback.
     *  THE CHAT-EPOCH GUARD (review fix, Task 2): `refs.log.isConnected` alone does NOT catch a settle
     *  arriving after Fresh Start. Fresh Start empties `refs.log`'s CHILDREN (`textContent = ''`) but
     *  `refs.log` itself stays mounted, so that check still passes — a stale settle would flip a
     *  detached line (harmless, nobody sees it) but ALSO `addBubble`/`addFollowUpCard` straight into
     *  the NEW conversation's log, which is very much still connected. `chatEpoch` (mount-scoped,
     *  bumped ONLY by Fresh Start — see its own declaration comment for why `clearToolLines` must NOT
     *  also bump it) is snapshotted here at creation and compared at settle/deadline time: a mismatch
     *  means the conversation this card belonged to is gone, so settle/deadline become a no-op (after
     *  still clearing the timer — this ctx is done either way, it just leaves nothing new on screen).
     *  @param {object} action @param {?object} line the entry claimToolLine handed this card
     *  @returns {{settle:(outcome:{ok?:boolean,note?:string,followUp?:object}) => {retire:(note?:string) => void}, _arm:() => void}} */
    function makeSettleCtx(action, line) {
      let settled = false; let timer = null;
      const epoch = chatEpoch; // snapshot — see THE CHAT-EPOCH GUARD above
      const noopHandle = { retire() {} };
      const ctx = {
        settle(outcome) {
          if (settled) return noopHandle;
          settled = true;
          if (timer) { clearTimeout(timer); timer = null; }
          if (epoch !== chatEpoch) return noopHandle;                  // the conversation this card belonged to is gone
          if (!refs.log || !refs.log.isConnected) return noopHandle;   // widget unmounted mid-run
          const o = outcome && typeof outcome === 'object' ? outcome : { ok: false, note: '' };
          flipEntry(line, o.ok ? 'done' : 'skipped');
          if (typeof o.note === 'string' && o.note) addBubble('buddy', o.note);
          if (!o.followUp || typeof o.followUp !== 'object') return noopHandle;
          return addFollowUpCard(o.followUp);
        },
        // Armed ONLY once the card actually goes pending (yes.onclick, above) — a synchronous
        // ok/fail apply() never calls this, so it never starts a timer nobody will clear.
        _arm() {
          const ms = typeof opts.pendingDeadlineMs === 'number' ? opts.pendingDeadlineMs : 120000;
          timer = setTimeout(() => {
            // The widget never hangs on a host promise (AGENTS.md crash-proof I/O). Same visible
            // outcome as an honest refusal; the workshop may still finish its own work and say so on
            // its own channels — this line only says the WIDGET stopped waiting, not that the work
            // failed.
            if (settled) return;
            settled = true;
            if (epoch !== chatEpoch) return;         // the conversation this card belonged to is gone
            if (!refs.log || !refs.log.isConnected) return;
            flipEntry(line, 'skipped');
            addBubble('buddy', T('apply.timeout'));
          }, ms);
        },
      };
      return ctx;
    }

    /** Host-authored one-question card for a settle's `followUp` (Keep/Rewind lives here, but the
     *  shape is generic: text + yes/no labels and a host `run()` for yes). Returns `{retire(note?)}`
     *  so the host can withdraw a stale offer (e.g. the child undid the change some other way before
     *  tapping either button) without waiting for a tap that may never come.
     *  EPOCH-GUARDED (round-2 review fix): `retire` is the SIBLING path to `ctx.settle`/the deadline
     *  timeout — a card can outlive the conversation it was born in exactly the same way a pending ctx
     *  can (the host holds onto the returned handle and calls `retire(note)` on it whenever ITS OWN
     *  later logic decides the offer is stale, which can be well after a Fresh Start). Without a guard
     *  here, that `retire(note)` would still `addBubble` the note straight into the NEW conversation —
     *  round 1 fixed this for settle/deadline and missed this sibling. `chatEpoch` is snapshotted at
     *  CARD-CREATION time (this function only ever runs from a `settle()` call that already passed its
     *  own epoch check, so "at settle time" and "at card-creation time" are the same instant here).
     *  @param {{text:string, yes?:{label?:string, run?:() => {ok:boolean,note:string}}, no?:{label?:string}}} f
     *  @returns {{retire:(note?:string) => void}} */
    function addFollowUpCard(f) {
      const wrap = el('div', 'actions follow-up');
      const label = el('span', 'action-label');
      label.textContent = typeof f.text === 'string' ? f.text : '';
      const yes = el('button'); yes.textContent = (f.yes && f.yes.label) || T('action.do');
      const no = el('button', 'ghost'); no.textContent = (f.no && f.no.label) || T('action.no');
      let live = true;
      const epoch = chatEpoch; // snapshot — see EPOCH-GUARDED above
      yes.onclick = () => {
        if (!live) return; live = false; wrap.remove();
        // CRITICAL review fix (Task 2): `hostCall`'s fallback on a throw is `null`, and `null` used to
        // satisfy NEITHER `r && r.ok` nor `r && !r.ok` — so a throwing (or absent) `run()` left the
        // card gone and NOTHING after it: no bubble, no failure line, exactly the "dead air"
        // INTEGRATION.md's §10c table promises never happens (it lists `followUp.yes.run()` as
        // "treated exactly as {ok:false}"). Same unconditional-else split the apply() handler above
        // already uses: success posts the note (or, if the host returned no usable note, a neutral
        // done line rather than nothing), everything else — `null`, `undefined`, `{ok:false}`, a
        // throw — posts the same kid-safe failure line.
        const r = hostCall('followUp', () => f.yes && typeof f.yes.run === 'function' ? f.yes.run() : null, null);
        if (r && r.ok) {
          addBubble('buddy', typeof r.note === 'string' && r.note ? r.note : T('action.undo.done'));
        } else {
          // Same refusal rule as the apply() handler: an honest host {ok:false, note} speaks its
          // own kid-voiced note (p5-01's stale-rewind "Things changed since that experiment — use
          // Undo…" must reach the child, not vanish into the generic line); a throw/null keeps
          // the generic copy.
          addBubble('buddy', r && typeof r.note === 'string' && r.note ? r.note : T('apply.failed'));
        }
      };
      no.onclick = () => { if (!live) return; live = false; wrap.remove(); };
      wrap.append(label, yes, no); refs.log.appendChild(wrap); refs.log.scrollTop = refs.log.scrollHeight;
      return {
        retire(note) {
          if (!live) return; live = false; wrap.remove(); // removal is safe even if Fresh Start already detached wrap
          if (epoch !== chatEpoch) return;                // the conversation this card belonged to is gone — no bubble
          if (typeof note === 'string' && note && refs.log && refs.log.isConnected) addBubble('buddy', note);
        },
      };
    }

    /**
     * A `rememberUser` action gets a visually DISTINCT card ("Remember: <note>") from the project-
     * tuning [Do it]/[No] cards — approving it never mutates the project state; it hands the note to
     * the HOST via `opts.onRemember(note)` instead of POSTing it anywhere (the gateway is stateless —
     * `POST /api/memory` is gone, 404s server-side as of stateless-buddy Task 2 — so the host is now
     * the only place that can turn an approved note into a durable write, e.g. into the champion
     * file, same as it already owns `apply()` for project-tuning actions). `onRemember` is optional
     * and best-effort: a missing/throwing/refusing host shows a failure; a legacy void callback
     * still acknowledges success. New hosts should return explicit {ok,note} outcomes.
     * A bad host write must never dead-end this card. Declining just
     * drops it, same spirit as [No thanks] on a tuning action.
     * @param {{op:'rememberUser', note:string}} a
     */
    function addRememberCard(a) {
      const wrap = document.createElement('div'); wrap.className = 'actions memory-card';
      const label = document.createElement('span'); label.className = 'action-label'; label.textContent = `Remember: ${a.note}`;
      const yes = document.createElement('button'); yes.textContent = T('action.remember');
      const no = document.createElement('button'); no.className = 'ghost'; no.textContent = T('action.forget');
      yes.onclick = async () => {
        const memoryEpoch = chatEpoch;
        wrap.remove();
        // Crash-proof I/O (AGENTS.md #12): a throwing host onRemember must NEVER dead-end this card —
        // wrap.remove() already fired, so without the guard a synchronous throw here would abort the
        // handler with no confirmation bubble and its tool line stuck at "waiting for your OK"
        // forever. Routed through hostCall (Task 1) rather than its own bare try/catch, which is what
        // this used to be: swallowing without a console.error left the DEVELOPER with nothing to
        // debug, and "the child still sees a confirmation" was never the whole contract.
        const result = typeof opts.onRemember === 'function'
          ? await Promise.resolve(hostCall('onRemember', () => opts.onRemember(a.note), { ok: false })).catch(() => ({ok:false})) : { ok: false };
        if (memoryEpoch !== chatEpoch) return;
        if (result !== undefined && (!result || result.ok !== true || typeof result.then === 'function')) {
          if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
          addBubble('buddy', (result && typeof result.note === 'string' && result.note) || 'I could not save that memory.');
          flipTool(a.op, 'skipped');
          return;
        }
        addBubble('buddy', `Got it — I'll remember: ${a.note}`);
        flipTool(a.op, 'done');
      };
      no.onclick = () => { wrap.remove(); flipTool(a.op, 'skipped'); };
      // Scroll like EVERY other append path in this file — this and addActions' tuning card were
      // the two that didn't, so the card's buttons landed below the fold (owner screenshot
      // 2026-08-11: "the chat is not scrolled to the bottom automatically", Remember/No-thanks
      // half-hidden). Pinned by vb-buddy-widget-integration's "arrives ON SCREEN" test.
      wrap.append(label, yes, no); refs.log.appendChild(wrap); refs.log.scrollTop = refs.log.scrollHeight;
    }

    /**
     * Streams a turn: shows thinking dots instantly, then grows ONE buddy bubble as delta frames
     * arrive (see logic/stream-frames.js), and renders action cards + meter on the terminal `done`
     * frame. `cut` replaces the bubble with the safe deflection. A frame with NO `type` field is also
     * treated as a terminal `done` — the gateway's kid-safety input-filter early return replies with a
     * plain `{reply, actions, source:'filter', meter}` object (no `type`), and without this branch that
     * reply would render nothing and the thinking dots would spin forever. Crash-proof: any
     * network/parse failure degrades to the friendly error bubble (AGENTS.md "crash-proof, best-effort
     * I/O") and always clears the thinking dots — they must never be left spinning.
     *
     * SCOPE LAW (spec §5/§7.1): this is also where the lesson store is READ (the whole request body is
     * composed from it) and WRITTEN (the terminal frame records the exchanged pair and bills the turn's
     * spend). Two client-side guards run BEFORE the fetch, both of which the server used to own:
     * the day budget, and a transcript that has grown too big to keep shipping whole.
     * @param {string} message
     * @param {{greet?:boolean}} [sendOpts] `greet:true` marks the synthetic "greet them" turn Fresh Start
     *   sends, which no child typed. It changes exactly two things: the child's message bubble is not
     *   drawn, and any proposed ACTION CARDS are dropped (spec §5 — see the done branch). The turn is
     *   still recorded in the transcript, so the model's context matches what it was actually sent.
     */
    async function send(message, sendOpts) {
      if (!message.trim()) return;
      // A turn is already streaming: QUEUE this message instead of forking a second parallel one
      // (see the turnAbort declaration for the whole incident). The child's bubble appears NOW,
      // dimmed, so their words are visibly kept — it un-dims the moment its turn actually fires,
      // with the finished reply in its transcript. `{echoed:true}` on the re-fire skips send()'s
      // own echo below (the bubble already exists).
      if (turnAbort) {
        // A synthetic greet can't be queued: its message is a line the child never typed and must
        // never be drawn as their bubble. Only reachable if freshStart's synchronous slot-clear is
        // ever bypassed — drop it rather than misattribute it.
        if (sendOpts && sendOpts.greet) return;
        const el = addBubble('me', message);
        el.classList.add('queued');
        sendQueue.push({ message, el });
        return;
      }
      // The day's chat budget, enforced HERE because the child's browser is the only thing that counts
      // it now. An unknown cap (GET /api/model hasn't landed) never refuses — see lesson.canSend().
      // The message is not echoed first: showing it and then refusing would read as "the buddy ignored
      // me", where this way the buddy plainly answers about the budget.
      if (lesson && !lesson.canSend()) { addBubble('buddy', T('cap.reached')); return; }
      // BYOK (spec §5.2): which device key (if any) this turn must carry — computed once, up front,
      // so both the body-builder call below and the key-rejected check in `handle`'s done branch
      // read the SAME value instead of recomputing it after the child may have changed brains mid-turn.
      const byok = byokFieldsFor(lesson && lesson.model(), modelList, lockedList, customList, deviceKeys);
      // Stringify ONCE — the same bytes are measured and then POSTed, so the size the child is nudged
      // about is exactly the size that would have gone out.
      // Wrapped because buildTurnBody calls straight into the HOST (getState/getMemory). This line used
      // to sit inside the fetch's own try block, where a throwing host produced the friendly bubble;
      // out here an uncaught throw would reject send() into silence instead — and freshStart()'s greet
      // turn is not awaited by anyone who could catch it (AGENTS.md crash-proof I/O: dead air is the
      // failure). Same bubble, same early return, no dead-end.
      // `applyOutbound` is the host's last word (see its own doc): absent → the same bytes as
      // before; present and refusing → a throw caught right here, so the turn is NOT sent.
      let bodyStr, outboundNote = null;
      try {
        const ruled = applyOutbound(opts, buildTurnBody({ ...opts, childName, buddyName, lesson, lessonStart, byok }, message));
        outboundNote = ruled.note;
        bodyStr = JSON.stringify(ruled.body);
      } catch (e) {
        addBubble('buddy', T('chat.error'));
        return;
      }
      // The transcript rides in every request now, so it can grow past what a provider (or a school
      // wifi upload) will take. Nudge toward Tidy Up rather than letting the turn fail opaquely — this
      // is a teachable moment about context, not an error.
      // Measured in BYTES, not characters: the gateway's MAX_BODY_BYTES cap counts bytes, and this app
      // is English-primary but not English-only — CJK text is 3 bytes per character in UTF-8, so a
      // `.length` check would let a Chinese transcript sail ~3x past the real limit and fail at the
      // wire instead of here, where the child gets a useful nudge.
      // Entry-count nudge, BEFORE the byte nudge: the gateway's transcript sanitizer refuses a
      // transcript longer than 240 entries with a hard 400 (an error bubble, no explanation), and a
      // long chat of short messages hits that wall well before 200KB of bytes. Nudging Tidy Up at 220
      // gives the child a few turns of headroom and a teachable reason, instead of the chat simply
      // breaking one message later.
      if (lesson && lesson.transcript().length > 220) { addBubble('buddy', T('cap.nudge')); return; }
      if (new TextEncoder().encode(bodyStr).length > 200000) { addBubble('buddy', T('cap.nudge')); return; }
      pendingTools = [];                  // per-turn tool lines start empty (see the mount-scoped note)
      if (!(sendOpts && (sendOpts.greet || sendOpts.echoed))) addBubble('me', message);
      // The host's own sentence about what it kept back, in the chat, BEFORE the request goes out
      // (the fetch below is the first thing that leaves). It is not a reply and not an error: it
      // is the distinction the Workshop's plan §3 requires be explained before the buddy is used
      // while private material is held — "your words still go; what is on your table does not".
      if (outboundNote) addBubble('buddy', outboundNote);
      const thinking = addThinking();     // pulsing "…" bubble, replaced by the first delta
      let bubble = null, text = '';
      const paint = (t) => { if (!bubble) { thinking.remove(); bubble = addBubble('buddy', ''); } renderRich(bubble, t); refs.log.scrollTop = refs.log.scrollHeight; };
      // This turn claims the ONE in-flight slot; Esc aborts it; the epoch snapshot keeps a stream
      // that outlives Fresh Start from writing into the NEW conversation (same guard as settle ctx).
      const controller = new AbortController();
      turnAbort = controller;
      const epoch = chatEpoch;
      try {
        const r = await api('/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: bodyStr, signal: controller.signal });
        if (!r.ok || !r.body) throw new Error(`gateway responded ${r.status}`);
        const dec = window.StreamFrames.createFrameDecoder();
        const reader = r.body.getReader(); const td = new TextDecoder();
        const handle = (f) => {
          if (f.type === 'delta') { text += f.text; paint(text); }
          else if (f.type === 'tool') { addToolLine(f); }
          else if (f.type === 'cut') {
            paint(f.deflection); clearToolLines();
            // A cut turn still HAPPENED — the model saw the message and this deflection is what the
            // child read. Recording it keeps the transcript in step with the visible log (the honesty
            // the store exists for) and stops the buddy re-answering a question it already deflected.
            // "In step with", not identical to: a greet turn deliberately records a synthetic user line
            // the child never sees, because that is what the model actually received (see send's
            // `greet` option). That one exception is the only place the two diverge.
            if (lesson) lesson.record(message, f.deflection);
          }
          else if (f.type === 'done' || !f.type) {
            if (f.reply !== undefined) paint(f.reply);
            // THE CHIP MUST NOT TAKE CREDIT FOR AN ANSWER ITS MODEL DID NOT GIVE. `model` on this
            // frame is the id the turn RESOLVED to — i.e. what was attempted — so on a stub/error
            // turn it still equals the child's pick and the "using a different brain" line below
            // stays silent. The child was then left with a chip reading `brain: claude-opus-latest`
            // beside an answer from a hardcoded fallback (owner's live test, 2026-07-29). Naming
            // models honestly IS the AI-literacy lesson here, so say it outright rather than relying
            // on the small "(practice brain — offline)" suffix to be noticed.
            if (f.source && f.source !== 'live' && currentModelId) {
              addSystemLine(`${T('model.notlive')} ${currentModelId}`);
            }
            // A GREET turn proposes NOTHING (spec §5, carrying over the retired server-side Fresh Start
            // route's own reasoning): a card from a turn the child never typed has nowhere coherent to go —
            // it asks them to approve a champion change they didn't ask about, one tap from mutating
            // their project, as the opening move of a conversation. The reply still renders; only the
            // action cards are dropped.
            if (f.actions?.length && !(sendOpts && sendOpts.greet)) addActions(f.actions);
            renderMeter(f.meter);
            // The turn is over: fold it into the store. `f.spent`/`f.model` are ADDITIVE done-frame
            // fields — the plain-JSON filter/capped replies and the p5-01 scripted suites' fake frames
            // carry neither, and both guards below no-op on their absence rather than billing NaN or
            // announcing a fallback to `undefined`. That tolerance is what keeps those suites green.
            if (lesson) {
              lesson.record(message, f.reply !== undefined ? f.reply : '');
              lesson.spend(f.spent || 0);
              if (f.meter && typeof f.meter.total === 'number') lesson.setMeterTotal(f.meter.total);
            }
            // The server resolved a DIFFERENT brain than the child's stored pick (a stale/retired id, or
            // one whose provider key is missing today). Say so out loud and show the truth on the chip:
            // a silent substitution would leave the chip lying about which AI is answering, which is
            // precisely the AI-literacy point this product teaches. Only fires when the child actually
            // made a choice — `lesson.model()` null means they never picked, so the server's own default
            // is not a "fallback" worth a line.
            // The stored pick is deliberately NOT overwritten: "unavailable right now" must not cost the
            // child their choice permanently. It is retried on the next mount (and the server keeps
            // falling back harmlessly per turn until it resolves), so a provider outage today doesn't
            // silently rewrite what they chose. The `!== currentModelId` guard makes the announcement a
            // once-per-session line instead of a banner repeated on every single turn.
            if (f.model && lesson && lesson.model() && f.model !== lesson.model() && f.model !== currentModelId) {
              currentModelId = f.model;
              updateChip();
              addSystemLine(`${T('model.fallback')} ${f.model}`);
            }
            // A BYOK turn that failed AT THE PROVIDER'S DOOR (401/402/403) — say the honest, useful
            // thing: the key was refused. Only when this turn actually carried a key: the same
            // statuses on a keyless turn are the deployer's problem, not the child's.
            if (byok && [401, 402, 403].includes(f.upstreamStatus)) addSystemLine(T('keys.rejected'));
          }
          // Unknown/future frame types: no-op by design — the client must never break on a frame it
          // doesn't recognize (forward-compat with new gateway frames).
        };
        for (;;) { const { value, done } = await reader.read(); if (done) break; for (const f of dec.push(td.decode(value, { stream: true }))) handle(f); }
        for (const f of dec.flush()) handle(f);
        if (!bubble) thinking.remove();   // stream ended with no visible text — clean up the dots
      } catch (e) {
        thinking.remove();
        if (e && e.name === 'AbortError') {
          // Esc (or Fresh Start) cut this stream. Keep whatever partial reply the child already
          // read — deleting words they saw would be a small lie — and record that same partial
          // text so the transcript stays in step with the visible log (empty if the dots never
          // became words: the model still RECEIVED the message, so the pair must exist). Spend is
          // deliberately not billed: no terminal frame ever arrived to say what it cost.
          // Epoch-guarded: a stream cut BY Fresh Start belongs to the wiped conversation and must
          // write nothing into the new one.
          if (epoch === chatEpoch) {
            // an Esc before the first delta has no partial text — say what happened in the slot
            // (record() itself also guards against '', as the last line of defence)
            if (lesson) lesson.record(message, text || '(I was stopped before I could answer.)');
            addSystemLine(T('turn.stopped'));
          }
        } else {
          if (bubble) bubble.remove();
          if (epoch === chatEpoch) addBubble('buddy', T('chat.error'));
        }
      } finally {
        if (turnAbort === controller) turnAbort = null;
        // THE TURN BOUNDARY: deliver the next queued message now that this turn's reply is in the
        // transcript — this serialization is the whole coherence fix. Not awaited: the fired
        // send() owns its own errors exactly like a child-submitted one. (After Fresh Start the
        // queue is already empty — it belonged to the cleared conversation.)
        const next = sendQueue.shift();
        if (next) {
          if (next.el && next.el.isConnected) next.el.classList.remove('queued');
          send(next.message, { echoed: true });
        }
      }
    }

    /**
     * Fresh Start: an entirely LOCAL act (Scope Law spec §7.1) — it empties this page's own transcript,
     * clears the chat log, and re-takes the lesson-start snapshot so "what have we changed?" is measured
     * from here on. Clearing the transcript itself is a pure local mutation — there is no server-held
     * history left to reset, so no request is needed for that part. The greeting reply that follows IS
     * a real, metered /api/turn call (see below).
     * The honest reveal bubble (`fresh.reveal`) is the whole point of this control existing: it teaches
     * the child that "clearing the chat" and "the buddy forgetting them" are NOT the same thing — the
     * durable memory (notes/persona, resent from the champion file every turn) survives on purpose, and
     * so does the day's spend: nothing the child taps buys more budget.
     * The greeting turn that follows is sent as a normal turn and RECORDED as a normal pair, so the
     * model's view of the new conversation matches what it was actually sent. Note the one deliberate
     * divergence between transcript and visible log: the synthetic "greet them" user line is recorded
     * but never shown as a bubble (`{greet:true}`), because the child did not type it — the transcript
     * stays faithful to what the MODEL received, which is what makes its next reply coherent.
     */
    function freshStart(clearOnly = false) {
      if (!lesson) return;              // pre-name-gate: there is no conversation to clear yet
      // A live stream and any queued messages belong to the conversation being cleared: abort the
      // one, drop the others. The aborted send's own catch is epoch-guarded, so it writes nothing
      // into the fresh conversation (the bump below happens before its microtask runs). The slot
      // is cleared SYNCHRONOUSLY — abort() rejects on a microtask, and the greet send() below runs
      // before that lands; a stale slot would queue the synthetic greet line as a visible child
      // bubble. (The aborted turn's own finally compares controllers, so it won't null a new one.)
      if (turnAbort) { turnAbort.abort(); turnAbort = null; }
      sendQueue.length = 0;
      refs.input.value = '';
      closePalette();
      lesson.freshStart();
      lessonStart = snapshotState();    // the new baseline this fresh conversation compares against
      refs.log.textContent = ''; // clears the CHAT LOG only — never the durable memory files (that's the reveal's point)
      pendingTools = []; // the log (incl. any tool lines) is gone — drop stale references too
      chatEpoch++; // any slow-action ctx armed before this line now belongs to a vanished conversation
      // (review fix, Task 2) — see makeSettleCtx's "THE CHAT-EPOCH GUARD" for why refs.log.isConnected
      // alone can't catch this: refs.log itself is still mounted, only its children just got wiped.
      if (clearOnly) return;
      addBubble('buddy', T('fresh.reveal'));
      send('(the child is starting fresh — greet them briefly by name)', { greet: true });
    }

    /**
     * Tidy Up: sends this page's transcript to `/api/tidy-up`, which summarizes it into one line and
     * hands the summary back — the SERVER stores nothing; the client swaps its own transcript for the
     * summary. The chat LOG is deliberately left as-is (unlike Fresh Start): the child keeps reading
     * everything that was said, while the buddy carries less of it forward. Only the meter should drop.
     * Two honest degrades, both mandated by the route's contract (server/turn.js runTidyUp):
     *  - an EMPTY transcript never calls out at all — there is nothing to compact, so it just confirms.
     *  - a response with NO `summary` (braked, a flagged summary withheld, a failed provider call, or an
     *    old-shape/faked reply) leaves the transcript untouched and still renders the meter. Compacting
     *    to a summary we never received would silently delete the buddy's memory of the chat.
     * It ALSO goes through the host's outbound filter (`applyOutbound`, see its own doc): this is the
     * SECOND POST site in this file, and the transcript it ships is exactly the payload a host may be
     * withholding — a filter that only guarded `send()` would be defeated by this one button.
     * It is ALSO inside the child's day budget (spec §7.1): gated by `canSend()` on the way in and
     * billed by `lesson.spend(res.spent)` on the way out, because this button costs real tokens.
     */
    async function tidyUp() {
      if (!lesson) return;              // pre-name-gate: no lesson, nothing to tidy
      const tidyEpoch = chatEpoch;
      // Tidy Up is a real model call, so it obeys the SAME day budget send() does — otherwise the one
      // control that spends tokens would be the one spend the child's budget can't stop, and a spent-out
      // lesson could keep billing through this button forever. Same bubble as send()'s refusal.
      if (!lesson.canSend()) { addBubble('buddy', T('cap.reached')); return; }
      if (!lesson.transcript().length) { addBubble('buddy', T('tidy.done')); return; }
      // Same BYOK line send() computes — Tidy Up is a real model call too, and must ride the SAME
      // device key the child's chosen brain needs, or the summarize call would hit the deployer's
      // (missing) key for a locked/custom model instead of the child's own.
      const byok = byokFieldsFor(lesson.model(), modelList, lockedList, customList, deviceKeys);
      // THE HOST'S LAST WORD, on THIS route too (P3b fix round, finding 1). This is the second POST
      // site in this file and it ships the WHOLE transcript — the one payload a host may be
      // withholding — so it asks the same `applyOutbound` hook `send()` does rather than going
      // round it. Absent hook → the same bytes as before; a throw or a malformed return → the
      // friendly bubble and NOTHING sent, the same fail-closed shape send() has.
      let tidyBody, tidyNote = null;
      try {
        const ruled = applyOutbound(opts, { transcript: lesson.transcript(), model: lesson.model() || undefined, buddyName, lastMeterTotal: lesson.meterTotal(),
          providerKey: byok ? byok.providerKey : undefined, modelProvider: byok ? byok.modelProvider : undefined });
        tidyNote = ruled.note;
        tidyBody = ruled.body;
      } catch (e) {
        addBubble('buddy', T('chat.error'));
        return;
      }
      // The host's own sentence first (same order send() uses: it is read BEFORE anything leaves).
      if (tidyNote) addBubble('buddy', tidyNote);
      // …and if the filter kept the chat back, this route has nothing to summarize. Refuse out
      // loud instead of POSTing an empty transcript: that request would spend the child's day
      // budget, and could only come back as an error or a summary of nothing.
      if (!Array.isArray(tidyBody.transcript) || !tidyBody.transcript.length) { addBubble('buddy', T('tidy.withheld')); return; }
      let res;
      try {
        const r = await api('/api/tidy-up', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(tidyBody) });
        if (!r.ok) throw new Error(`gateway responded ${r.status}`);
        res = await r.json();
      } catch (e) {
        if (tidyEpoch === chatEpoch) addBubble('buddy', T('chat.error'));
        return;
      }
      // A late response still cost tokens, but may not restore forgotten conversation content.
      lesson.spend(res.spent || 0);
      if (tidyEpoch !== chatEpoch) return;
      if (typeof res.summary === 'string') lesson.tidyUp(res.summary);
      // Bill the summarize call against the day budget, like any turn. `res.spent` is an ADDITIVE field
      // (server/turn.js runTidyUp): an old-shape or faked reply simply has none, and `|| 0` bills
      // nothing rather than NaN — the same tolerance the done-frame path relies on.
      renderMeter(res.meter);
      // Same guard the done-frame path uses, and for the same reason: `res.meter && res.meter.total`
      // yields `null` for a `{meter: null}` reply, and the store reads `Number(null)` as a perfectly
      // valid 0 — which would overwrite the last honest reading with a false zero and then echo that
      // zero back to the server as the next turn's `lastMeterTotal`. Only a real number may land.
      if (res.meter && typeof res.meter.total === 'number') lesson.setMeterTotal(res.meter.total);
      addBubble('buddy', T('tidy.done'));
    }

    buildDom();
    boot();
    const seeded = (typeof opts.buddyName === 'string' && opts.buddyName.trim()) ? opts.buddyName.trim() : null;
    if (seeded) startLabSeeded(seeded);
    return { rootEl, adoptName, clearConversation: () => freshStart(true) };
  }
  if (typeof window !== 'undefined') window.BuddyChat = { mount };
  // node:test seam (mirrors the game.js window-global + module.exports guard idiom, e.g.
  // web/games/p3-01-waste-sorters/game.js): `typeof module` is undefined in a real browser, so this
  // is a no-op there — only `require()` under Node reaches it. Exposes ONLY the pure, DOM-free
  // buildTurnBody; mount() itself needs a real DOM and stays browser-only.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { __test: { buildTurnBody, applyOutbound, createLesson, safeStorage, createDeviceKeys, byokFieldsFor, createCustomModels } };
  }
})();
