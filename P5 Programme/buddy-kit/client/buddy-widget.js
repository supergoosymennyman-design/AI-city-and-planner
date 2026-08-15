// client/buddy-widget.js — the bubble packaging of the chat core: a floating ROBOT launcher + a
// slide-up panel (with a name-tag + minimise header) that lazily BuddyChat.mount()s on first open.
// This file is no longer the integration surface a host writes against: buddy-boot.js is (one script
// tag), and the styling it needs is buddy-core.css + buddy-theme.css. This file is what BuddyBoot
// loads LAST and calls — hosts reach `BuddyWidget.mount(opts)` through `BuddyBoot.mount(opts)`, whose
// options are passed straight through. See INTEGRATION.md. Pure DOM + CSS, no emoji, no external
// assets — the whole buddy stays offline-safe.
(function () {
  'use strict';

  // The visor helper-bot, built from spans so CSS can animate each part (antenna pulse, eye blink,
  // idle bob). `aria-hidden` — the button/label carry the a11y text. Reused at two sizes: the 64px
  // launcher and the small avatar on the panel's name tag (`.bw-id` scopes it down in CSS).
  function botMarkup() {
    return (
      '<span class="bw-bot" aria-hidden="true">' +
      '<span class="bw-bot-antenna"></span>' +
      '<span class="bw-bot-head">' +
      '<span class="bw-bot-visor"><span class="bw-bot-eye"></span><span class="bw-bot-eye"></span></span>' +
      '</span>' +
      '<span class="bw-bot-fin bw-bot-fin-l"></span>' +
      '<span class="bw-bot-fin bw-bot-fin-r"></span>' +
      '</span>'
    );
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
    // CSS-drawn close glyph (two crossed bars) — immune to any iOS font/glyph
    // rendering quirk that could show a Unicode ✕ as blank/tofu. Always paints.
    min.innerHTML = '<span class="bw-min-x" aria-hidden="true"><i></i><i></i></span>';
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

    let mounted = false;
    function setOpen(open) {
      panel.hidden = !open;
      bubble.classList.toggle('open', open);
      bubble.setAttribute('aria-expanded', String(open));
      bubble.setAttribute('aria-label', open ? 'Close your buddy' : 'Open your buddy');
      if (open && !mounted) { mounted = true; window.BuddyChat.mount(body, opts); }
    }
    bubble.onclick = () => setOpen(panel.hidden);
    min.onclick = () => setOpen(false);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
    return { open: () => setOpen(true), close: () => setOpen(false) };
  }
  window.BuddyWidget = { mount };
})();
