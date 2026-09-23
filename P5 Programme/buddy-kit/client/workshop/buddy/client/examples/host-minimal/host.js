// examples/host-minimal/host.js — the smallest honest host: one number param, one list slot, one
// check. Small enough to read in one sitting, complete enough to copy. Everything a real host owes
// the buddy is here and nothing else is.
//
// The verb names and the state shape below are NOT invented for the example — they are the ones
// logic/action-schema.js's OPS and server/manifest-sanitize.js's sanitizeProjectState actually
// accept: `addItems`/`removeItems` are PLURAL and carry `ids[]`, and a flat slot's state is
// `{items:[...]}`, not a bare array. Both mistakes fail SILENTLY rather than loudly — a guessed
// `addItem` verb is dropped before the child ever sees a card, and a bare array reads as an empty
// list, so the buddy confidently tells the child they have no animals. Copy these shapes.
(function () {
  'use strict';

  // ── the host's own state (a real host would have a game / editor / lesson here) ─────────────────
  var state = { speed: 3, animals: [], counted: 'not counted yet' };

  var out = document.getElementById('state');
  function render() {
    out.textContent =
      'speed: ' + state.speed +
      '\nanimals: ' + (state.animals.join(', ') || '(none)') +
      '\ncount: ' + state.counted;
  }

  // ── 1) the manifest: what the buddy is ALLOWED to touch on this project ─────────────────────────
  // The seven verbs are generic; the manifest is what narrows them to THIS project. A verb naming a
  // param / slot / check that is not declared here is refused by the gateway before the child ever
  // sees a card — e.g. `animals` is declared FLAT, so a `createGroup` on it can never reach apply().
  var MANIFEST = {
    projectId: 'host-minimal',                  // /^[a-z0-9-]{1,40}$/
    title: 'Animal Sorter',                     // kid-facing name, <= 60 chars
    kidJob: 'collect your animals, then count them', // one line for the buddy's persona, <= 140
    // Every `name` must match /^[a-zA-Z][a-zA-Z0-9]{0,30}$/ — no dashes, no underscores, no spaces.
    // A name that does not is DROPPED by the gateway's sanitizer, and its verb then reads as
    // undeclared, so the buddy simply never proposes it.
    params: [{ name: 'speed', label: 'How fast', min: 1, max: 5, step: 1 }], // <= 8, numbers only
    slots: [{ name: 'animals', label: 'Animals' }],   // <= 6; add `grouped:true` for named groups
    checks: [{ name: 'countThem', label: 'Count them' }],  // <= 4 — a "prove it" beat, not a verb
    readouts: [{ name: 'howMany', label: 'How many' }],    // <= 6 — the buddy may LOOK, never set
  };

  // ── 2) getState: read fresh on every message, never cached ──────────────────────────────────────
  // Mirror the manifest's own shape. A flat slot is `{items:[...]}`; a grouped slot would be
  // `{groups:{cats:[...], dogs:[...]}}`. Readouts are strings or numbers the buddy can read out loud.
  function getState() {
    return {
      params: { speed: state.speed },
      slots: { animals: { items: state.animals.slice() } },
      readouts: { howMany: state.counted },
    };
  }

  // ── 3) apply: run ONE child-approved action, and say plainly whether it worked ──────────────────
  // Return {ok:true, note} — the child hears "Done! <note>". Return {ok:false, note} when you cannot
  // do it; the buddy then says its own kid-safe "that change didn't fit — no harm done" line, so the
  // note is for YOUR logs, not the child. NEVER THROW: the approval card is already gone by the time
  // apply() runs, so a throw leaves the child tapping [Do it] and getting nothing back at all.
  function apply(action) {
    if (action.op === 'setParam' && action.name === 'speed') {
      state.speed = action.value; render();
      return { ok: true, note: 'speed is now ' + action.value };
    }
    if (action.op === 'addItems' && action.slot === 'animals') {
      if (state.animals.length >= 6) return { ok: false, note: 'the list is full — six is the most it holds' };
      // `ids` is what the buddy ASKED for; skip what is already on the list, and any id repeated
      // inside one request (otherwise the child ends up with two cats).
      var fresh = action.ids.filter(function (id, i) {
        return state.animals.indexOf(id) < 0 && action.ids.indexOf(id) === i;
      });
      if (!fresh.length) return { ok: false, note: 'those are already on the list' };
      // THE RULE FOR EVERY NOTE IN THIS FUNCTION: report what ACTUALLY happened, never what was asked
      // for. `ids` can be longer than the room left, and the buddy reads this note out to the child
      // word for word — so an over-reporting note is the buddy stating a falsehood as fact. Naming the
      // overflow matters for the same reason: silently dropping two of three animals is a lie by
      // omission.
      var added = fresh.slice(0, 6 - state.animals.length);
      var noRoom = fresh.slice(added.length);
      state.animals = state.animals.concat(added);
      state.counted = 'not counted yet'; // the readout is stale until the check runs again
      render();
      return {
        ok: true,
        note: 'added ' + added.join(', ') + (noRoom.length
          ? ' — but ' + noRoom.join(', ') + ' did not fit (six is the most the list holds)' : ''),
      };
    }
    if (action.op === 'removeItems' && action.slot === 'animals') {
      // Work out what will actually GO before removing it, for the same reason as the add branch
      // above: `ids` is the request, and only the intersection with the list can be removed. Reported
      // straight, "remove cat, elephant" against a list holding only a cat would have the buddy tell
      // the child it removed an elephant that was never there. Read the intersection off the LIST,
      // which is duplicate-free by construction, so the note cannot repeat an animal either.
      var gone = state.animals.filter(function (a) { return action.ids.indexOf(a) >= 0; });
      if (!gone.length) return { ok: false, note: 'none of those were on the list' };
      state.animals = state.animals.filter(function (a) { return action.ids.indexOf(a) < 0; });
      state.counted = 'not counted yet';
      render();
      return { ok: true, note: 'removed ' + gone.join(', ') };
    }
    if (action.op === 'runCheck' && action.name === 'countThem') {
      state.counted = 'I count ' + state.animals.length; render();
      return { ok: true, note: state.counted };
    }
    // `undoLast` lands here too, and this host keeps no undo stack — answering ok:false is the honest
    // reply. (`rememberUser` never reaches apply: the widget gives it its own card and hands the note
    // to `onRemember`.) A real host would keep a stack of previous states and pop it here.
    return { ok: false, note: "I can't do that one here" };
  }

  render();

  // ── 4) the OTHER extension point: this project's own slash command ──────────────────────────────
  // Two ways to give the buddy a new ability, and they are not interchangeable:
  //   - a CHECK in the manifest (`countThem` above) is something the BUDDY can decide to propose,
  //     and the child approves it with a [Do it] card;
  //   - a COMMAND here is something the CHILD invokes by name, and it acts immediately — no card,
  //     same as /clear and /compact.
  // Everything below lives in THIS file. Adding it by editing the kit's own logic/command-parse.js
  // or client/buddy.js would work too, and would cost you a hand-merge every time a newer kit
  // arrives; keeping it here means you can drop a new kit on top and lose nothing.
  var COMMANDS = [{
    cmd: 'restock',                                   // one lowercase word, <= 16 chars
    desc: 'add three fresh animals',                  // <= 40 chars, shown in the palette + /help
    run: function (args) {
      // `args` is whatever the child typed after the word — '' when they typed nothing. Parsed
      // leniently on purpose: a child typing "/restock lots" should get the default, not an error.
      var n = parseInt(args, 10);
      if (!isFinite(n) || n < 1 || n > 5) n = 3;
      var stock = ['cat', 'dog', 'bird', 'fox', 'owl'];
      var added = [];
      for (var i = 0; i < stock.length && added.length < n; i++) {
        if (state.animals.indexOf(stock[i]) < 0) { state.animals.push(stock[i]); added.push(stock[i]); }
      }
      state.counted = 'not counted yet';
      render();
      // The returned note is spoken by the buddy VERBATIM, so it has to be true — name what actually
      // went in, not what was asked for (the same honesty rule as apply()'s notes above). Returning
      // nothing at all is also fine, and means "stay silent, the page already shows what happened".
      return { note: added.length ? 'added ' + added.join(', ') : 'they are all already out!' };
    },
  }];

  // ── 5) mount. One call. The loader handles the seven dependencies and the two stylesheets. ──────
  // Fire-and-forget is fine — a failure logs itself and this page keeps working without a buddy.
  window.BuddyBoot.mount({ manifest: MANIFEST, getState: getState, apply: apply, commands: COMMANDS });
})();
