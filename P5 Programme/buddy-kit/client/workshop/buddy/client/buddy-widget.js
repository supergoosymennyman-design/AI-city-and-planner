// client/buddy-widget.js — the bubble packaging of the chat core: a floating ROBOT launcher + a
// slide-up panel (with a name-tag + minimise header) that lazily BuddyChat.mount()s on first open.
// This file is no longer the integration surface a host writes against: buddy-boot.js is (one script
// tag), and the styling it needs is buddy-core.css + buddy-theme.css. This file is what BuddyBoot
// loads LAST and calls — hosts reach `BuddyWidget.mount(opts)` through `BuddyBoot.mount(opts)`, whose
// options are passed straight through. See INTEGRATION.md. Pure DOM + CSS, no emoji, no external
// assets — the whole buddy stays offline-safe.
(function () {
  'use strict';

  // The chat-bubble helper-bot (2026-08-11 restyle): ONE inline SVG whose head IS a speech
  // bubble — rounded shell, a wee tail at bottom-left, glass visor with two blinking glow eyes,
  // a pulsing antenna tip. SVG replaced the old span-built shapes so the art scales crisply to
  // BOTH sizes (64px launcher, 34px name-tag avatar) from one set of coordinates, and so the
  // name-tag copy renders even where the launcher's --bot-* vars aren't declared (every fill in
  // buddy-theme.css carries a fallback — the old avatar rendered as an empty dark blob there).
  // `aria-hidden` — the button/label carry the a11y text. The duplicate <defs> id across the two
  // copies is deliberate and safe: both define identical gradients, and first-id-wins.
  function botMarkup() {
    return (
      '<span class="bw-bot" aria-hidden="true">' +
      '<svg class="bw-bot-svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="bwBotSheen" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity=".5"/>' +
      '<stop offset=".45" stop-color="#ffffff" stop-opacity=".08"/>' +
      '<stop offset="1" stop-color="#0a1017" stop-opacity=".32"/>' +
      '</linearGradient></defs>' +
      '<rect class="bw-svg-stem" x="30.4" y="8" width="3.2" height="8" rx="1.6"/>' +
      '<circle class="bw-svg-tip" cx="32" cy="7" r="3.2"/>' +
      '<path class="bw-svg-tail" d="M19 44 v12.6 q0 2.9 2.5 1.4 L35 49 Z"/>' +
      '<rect class="bw-svg-shell" x="11" y="16" width="42" height="33" rx="11"/>' +
      '<rect class="bw-svg-sheen" x="11" y="16" width="42" height="33" rx="11"/>' +
      '<rect class="bw-svg-visor" x="17.5" y="23" width="29" height="17" rx="8.5"/>' +
      '<rect class="bw-svg-eye" x="24.5" y="27.5" width="5.2" height="8" rx="2.4"/>' +
      '<rect class="bw-svg-eye" x="34.3" y="27.5" width="5.2" height="8" rx="2.4"/>' +
      '</svg>' +
      '</span>'
    );
  }

  /**
   * A draggable launcher whose panel follows it — `opts.drag = { storageKey? }` (or `true`).
   * Promoted from p5-01's game-local makeBuddyDraggable the moment a second host (the workshop)
   * reached for it: a fixed-corner bubble covers whatever the host puts in that corner (p5-01's
   * stage berth, the workshop's table cards), and a child parks it where it is not in the way.
   *
   * Three things this must get right, each learned live in p5-01:
   *  - a TAP still opens the panel: a pointer that moves < 6px is a tap; anything more is a drag and
   *    the click that ends it is swallowed (else the panel flew open at the end of every drag);
   *  - the PANEL goes with the buddy — buddy-core.css pins it to its own corner, so an un-anchored
   *    panel left the speech behind ("two unrelated objects instead of a character and the thing it
   *    is saying"). It opens ABOVE the launcher when there is room (a speech bubble rises), below
   *    otherwise, and is clamped into the viewport so it can never open off-screen;
   *  - `!important` inline positions, because buddy-core.css positions both elements with its own
   *    rules and a plain inline `left` loses to a stylesheet `!important` a host theme may add.
   * The berth persists under `storageKey` (best-effort: storage can throw in private mode / on quota,
   * and a missing berth degrades to the CSS default corner, never to a dead bubble). Position uses
   * left/top, never transform — the launcher's hover/open scale already owns `transform`.
   * @returns {{ consumeDrag: () => boolean, anchorPanel: () => void }}
   */
  function makeDraggable(bubble, panel, cfg) {
    const key = cfg && typeof cfg.storageKey === 'string' ? cfg.storageKey : null;
    let store = null;
    try { store = window.localStorage; } catch (e) { store = null; }
    bubble.classList.add('bw-drag');
    bubble.style.touchAction = 'none'; // or the browser pans the page instead of dragging

    function place(left, top) {
      const w = bubble.offsetWidth || 64, h = bubble.offsetHeight || 64;
      // Clamp so it can never be dragged off-screen and stranded where no tap can reach it.
      const x = Math.max(4, Math.min(left, window.innerWidth - w - 4));
      const y = Math.max(4, Math.min(top, window.innerHeight - h - 4));
      bubble.style.setProperty('left', x + 'px', 'important');
      bubble.style.setProperty('top', y + 'px', 'important');
      bubble.style.setProperty('right', 'auto', 'important');
      bubble.style.setProperty('bottom', 'auto', 'important');
      bubble.dataset.bwMoved = 'true';
      anchorPanel();
    }
    function anchorPanel() {
      if (bubble.dataset.bwMoved !== 'true') return; // untouched → the CSS corner pair stands
      const r = bubble.getBoundingClientRect();
      const pw = panel.offsetWidth || 420, ph = panel.offsetHeight || 560, gap = 14;
      let top = r.top - ph - gap;
      if (top < 8) top = Math.min(r.bottom + gap, window.innerHeight - ph - 8);
      const left = Math.min(r.left, window.innerWidth - pw - 8);
      panel.style.setProperty('left', Math.max(8, left) + 'px', 'important');
      panel.style.setProperty('top', Math.max(8, top) + 'px', 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
    }

    // Restore a previous berth (best-effort, see above).
    if (key && store) {
      try {
        const saved = JSON.parse(store.getItem(key) || 'null');
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') place(saved.x, saved.y);
      } catch (e) { /* no stored berth — the CSS default corner stands */ }
    }

    let sx = 0, sy = 0, bx = 0, by = 0, moved = false, pid = null;
    bubble.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      pid = e.pointerId; moved = false;
      const r = bubble.getBoundingClientRect();
      bx = r.left; by = r.top; sx = e.clientX; sy = e.clientY;
      try { bubble.setPointerCapture(pid); } catch (err) { /* capture is a nicety, not a requirement */ }
    });
    bubble.addEventListener('pointermove', (e) => {
      if (pid === null || e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return; // still a tap, not yet a drag
      moved = true;
      bubble.classList.add('bw-dragging');
      place(bx + dx, by + dy);
    });
    function end(e) {
      if (pid === null || (e && e.pointerId !== pid)) return;
      try { bubble.releasePointerCapture(pid); } catch (err) { /* already released */ }
      pid = null;
      bubble.classList.remove('bw-dragging');
      if (!moved || !key || !store) return;
      const r = bubble.getBoundingClientRect();
      try { store.setItem(key, JSON.stringify({ x: r.left, y: r.top })); }
      catch (err) { /* the berth just won't persist; the drag itself still worked */ }
    }
    bubble.addEventListener('pointerup', end);
    bubble.addEventListener('pointercancel', end);
    // Keep the pair inside the viewport when the window changes shape under it.
    window.addEventListener('resize', () => {
      if (bubble.dataset.bwMoved !== 'true') return;
      const r = bubble.getBoundingClientRect();
      place(r.left, r.top);
    });
    return {
      // Called by the launcher's click handler: true exactly once after a drag, so that click is
      // swallowed instead of toggling the panel.
      consumeDrag: () => { const was = moved; moved = false; return was; },
      anchorPanel,
    };
  }

  function mount(opts) {
    opts = opts || {};

    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'bw-bubble';
    bubble.setAttribute('aria-label', 'Open your buddy');
    bubble.setAttribute('aria-expanded', 'false');
    bubble.innerHTML = botMarkup() + '<span class="bw-sr">Open your buddy</span>';

    const panel = document.createElement('div');
    panel.className = 'bw-panel';
    panel.hidden = true;

    // Header: a name tag (mini robot + the buddy's name) and a clear minimise button. Before this,
    // the only ways to close were re-tapping the launcher or pressing Escape — neither obvious to a
    // child. The name tag is fed by the chat core via opts.setBuddyName (below), since the name is
    // only known after the child names their buddy in buddy.js's gate.
    const head = document.createElement('div');
    head.className = 'bw-head';
    const id = document.createElement('div');
    id.className = 'bw-id';
    id.innerHTML = botMarkup() + '<span class="bw-name">Buddy</span>';
    const min = document.createElement('button');
    min.type = 'button';
    min.className = 'bw-min';
    min.setAttribute('aria-label', 'Minimise buddy');
    min.innerHTML = '<span class="bw-min-bar" aria-hidden="true"></span>';
    head.append(id, min);

    const body = document.createElement('div');
    body.className = 'bw-panel-body';
    panel.append(head, body);
    document.body.append(bubble, panel);

    const nameEl = id.querySelector('.bw-name');
    // The chat core calls this once it knows/updates the buddy's name — the widget owns the chrome,
    // buddy.js owns the name. Guarded + total: junk never throws, never blanks the tag.
    opts.setBuddyName = (name) => { if (typeof name === 'string' && name.trim()) nameEl.textContent = name.trim(); };
    // A carried (seeded) name shows on the tag from the start — before the chat core lazily mounts.
    if (typeof opts.buddyName === 'string' && opts.buddyName.trim()) nameEl.textContent = opts.buddyName.trim();

    // Optional drag (see makeDraggable). Wired BEFORE the click handler below so a drag's trailing
    // click can be swallowed there.
    const drag = opts.drag ? makeDraggable(bubble, panel, opts.drag === true ? {} : opts.drag) : null;

    let mounted = false;
    let chat = null; // the lazily-created BuddyChat handle — null until the panel first opens
    function setOpen(open) {
      // Anchor BEFORE revealing: the closed panel is still `display:flex` (buddy-core.css keeps it in
      // the render tree for the slide), so its size is measurable now and one placement is enough.
      if (open && drag) drag.anchorPanel();
      panel.hidden = !open;
      bubble.classList.toggle('open', open);
      bubble.setAttribute('aria-expanded', String(open));
      bubble.setAttribute('aria-label', open ? 'Close your buddy' : 'Open your buddy');
      if (open && !mounted) { mounted = true; chat = window.BuddyChat.mount(body, opts); }
    }
    bubble.onclick = () => { if (drag && drag.consumeDrag()) return; setOpen(panel.hidden); };
    min.onclick = () => setOpen(false);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
    return {
      open: () => setOpen(true),
      close: () => setOpen(false),
      // Memory deletion/import invalidates old proposals, in-flight replies and transcript.
      // No greeting request: clearing memory must not itself send another model request.
      clearConversation: () => { if (chat) chat.clearConversation(); },
      // Mid-session champion import: push a carried buddy name into a widget that is ALREADY up.
      // Chat not yet opened → seed opts + the name-tag, so the lazy BuddyChat.mount above greets
      // "welcome back" under the carried name; chat live → hand through to its own adoptName
      // (rename in place + one honest bubble). Guarded + total like setBuddyName: junk is a no-op.
      adoptName: (name) => {
        if (typeof name !== 'string' || !name.trim()) return;
        const n = name.trim();
        opts.buddyName = n;
        opts.setBuddyName(n);
        if (chat && typeof chat.adoptName === 'function') chat.adoptName(n);
      },
    };
  }
  window.BuddyWidget = { mount };
})();
