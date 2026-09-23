'use strict';
/**
 * floor-art.js — how every object on the FLOOR is drawn (spec 2026-08-19-workshop-floor-design.md
 * §3). One canvas 2D vocabulary, and it is p5-01's: a gunmetal bay wall, a dark deck, dark steel
 * machines separated by RIM LIGHT, LIGHT-BLUE trim, cyan signals, and kraft crates — the one
 * warm thing left, because cargo must never read as electricity. Every function is (ctx, object, live, t) → paints at the object's rect; `t` is
 * the ONE decorative clock (ms) — reduced motion passes t = 0 and gets the calm frame for free.
 * `live` carries what the run knows (counts, armed chute, lit lamp, shown word, last reading,
 * tally, weights); no state lives here.
 *
 * Sprites: FloorArt.sprites.set(kind, image) swaps a painted sprite in for a kind WITHOUT
 * changing its footprint (day-2 art pass); until then the vector object below is the art.
 * Zero emoji: every pictograph is drawn.
 */
(function () {
  const sprites = new Map();

  /* The FLOOR's pure geometry module. Some blocks (the Splitter's bar) are DRAWN here and
     DRAGGED in floor.js, and two copies of one geometry are two copies that drift — so both
     files read the same functions out of logic/floor-layout.js.
     Resolved LAZILY, never captured at IIFE time: this is a classic <script>, and a capture
     would freeze `undefined` for the life of the page if the load order in index.html ever
     moved (the mirror3d lesson — that exact capture cost three bugs). */
  const layout = () => (typeof window !== 'undefined' ? window.WorkshopFloorLayout : null);

  /* THE HALL'S PALETTE — six names, and one rule that makes the colour teach the model:
       LAMP amber is ITEMS + POWER (the square/item family, the Run key, a lit crate route)
       SIGNAL teal is READINGS + THOUGHT (the round/signal family: cables, screens, a guess)
     so a child can tell what a wire carries by its colour before reading a single word.
     styles.css carries the same six as CSS tokens — chrome and canvas are one room. */
  const P = {
    /* THE ROOM. Gunmetal, straight off p5-01's own L1 bay-wall plate prompt, so the workshop's
       wall and the bay's wall are literally the same alloy. */
    wall: '#1a2231', wallShade: '#141a26', rail: '#2b7f8c',
    floor: '#12161f', floorLine: '#232e41', front: '#0b0d12',
    /* THE MACHINES. Dark steel: nothing is separated from the floor by TONE any more, so every
       box is separated by its machined top edge. steelLight is BRIGHTER than it was for exactly
       that reason — it stopped being a body colour and became the rim light. */
    steel: '#2a3446', steelDark: '#141a26', steelLight: '#46566f',
    /* `brass` is a RETIRED NAME kept because every draw call speaks it — the value is the bay's
       lens now (owner 2026-08-20: light blue, like p5-01). There is no warm metal in this hall. */
    brass: '#5fe3dc', brassDark: '#2b7f8c',
    /* The belt stays a step ABOVE the deck. It was near-black on a pale floor (high contrast);
       on a dark deck the same value would disappear, so it inverts to read the same way. */
    rubber: '#232b38', rubberLight: '#46566f',
    /* Crates stay warm. They are ITEMS, items are the gold family, and a warm object is the one
       thing in the hall that is unmistakably not part of the machine. */
    kraft: '#c08b45', kraftDark: '#7d5722', tape: '#e8c98d',
    screen: '#080d14', screenText: '#5fe3dc',
    /* TEXT AND ITS GROUND, and they are OPPOSITES — edit them as a pair or a word goes invisible.
       `ink` is the colour of a word ON a plate; plates are dark now, so ink is light (#f2f6fa on
       #171d29 = 15:1, well past the 7:1 floor). `paper` is the plate's FILL, never a text colour
       — see the checker's verdict word, which used to borrow it to mean "neutral". */
    ink: '#f2f6fa', inkSoft: '#b9cbdb', paper: '#171d29',
    /* A live READING gets its own ground: signals are lens-coloured in this room, so a readout
       is a dark lens-tinted plate, never the same plate the block's NAME is stamped on. */
    readout: '#0d2a2e',
    ok: '#4ad991', bad: '#d8405c', warn: '#e8a13c', glow: 'rgba(182,255,248,0.55)',
    iron: '#171d29', oil: '#0b0d12', chalk: '#f2f6fa', lamp: '#b6fff8', signal: '#5fe3dc',
  };

  /* The concrete: painted once per size into an offscreen canvas, then stamped each frame. The
     size room() asks for is capped at the WINDOW's height (see its own note), so a 60-line machine
     whose floor band is ~9000 px tall cannot ask this for a 1280x9000 canvas.
     Everything in it is a pure function of a seeded integer hash — no Math.random, so the floor
     never shimmers between repaints and two machines of the same size look identical. */
  let concreteKey = '', concreteTile = null;
  function concrete(w, h) {
    const key = w + 'x' + h;
    if (key === concreteKey && concreteTile) return concreteTile;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    const g = c.getContext('2d');
    let s2 = 0x1f3a5c7;
    const rnd = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return (s2 % 10000) / 10000; };
    // Aggregate: fine light and dark grains, the way a poured floor reads up close.
    for (let i = 0; i < Math.round(w * h / 900); i++) {
      const x = rnd() * w, y = rnd() * h, r = 0.5 + rnd() * 1.6, up = rnd() > 0.5;
      g.fillStyle = up ? 'rgba(190,212,238,0.07)' : 'rgba(0,0,0,0.22)';
      g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    // Old scuffs: long, faint arcs where machines have been dragged across the hall.
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = rnd() * w, y = rnd() * h, len = 60 + rnd() * 260, ang = (rnd() - 0.5) * 0.5;
      g.strokeStyle = 'rgba(0,0,0,' + (0.05 + rnd() * 0.09).toFixed(3) + ')';
      g.lineWidth = 2 + rnd() * 7;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y + Math.sin(ang) * 26, x + len, y + Math.sin(ang) * 8);
      g.stroke();
    }
    concreteKey = key; concreteTile = c;
    return c;
  }

  /* Dust motes for the lamp beam: seeded ONCE from a plain integer hash (never Math.random — the
     scene must repaint identically), then animated by t. Reduced motion holds t at 0, so this
     collapses to a correct still frame with the dust at rest. */
  const MOTES = (() => {
    const out = []; let h = 0x2f6e2b1;
    for (let i = 0; i < 90; i++) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const a = (h % 1000) / 1000;
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const b = (h % 1000) / 1000;
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const c = (h % 1000) / 1000;
      out.push({ x: a, y: b, r: 0.7 + c * 1.7, sp: 0.35 + c * 0.9, ph: a * 6.28 });
    }
    return out;
  })();
  const COLOURS = { red: '#e0553d', green: '#2fbf71', blue: '#3b82f6', yellow: '#f2c53a' };
  // The room's one breath period, ms of the shared clock (~7.4 s, ~0.13 cycles/s — flash-safe).
  // ONE named value so the pool, the dial glow and anything else that breathes cannot drift apart;
  // reduced motion passes t = 0, where sin(0) = 0 is the calm rest frame (NIT 6).
  const BREATH_MS = 1178;

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function shadow(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 4, w * 0.5, Math.max(4, h * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  /* The ONE canvas font stack (task 085). A canvas never inherits the page's font — ctx.font
     carries its own family — so widening styles.css for Traditional Chinese fixes the DOM
     half of the app and NOTHING drawn here. HK faces are named before the TW ones because
     some glyph forms differ; system faces only, since a webfont would be a runtime CDN
     fetch (offline law) and a self-hosted CJK face is megabytes.
     Leading space is deliberate: every caller writes `size + 'px' + FAMILY`.
     Published on WorkshopFloorArt so brain-view-art.js and chart-art.js share it rather
     than each keeping a copy that drifts. */
  /** Han characters. Used to pick a legibility floor and a truncation bite, not for validation. */
  const HAN = /[一-鿿]/;

  /**
   * The smallest px a shrunk label may use, by script (task 085).
   *
   * 7px was tuned for Latin, where a letter that small is tight but still readable. A Han glyph
   * at 7px is a smudge — the same box carries several times the strokes — so CJK gets 9. This
   * only ever RAISES the floor, so every Latin label renders exactly as it did before.
   * @param {string} s the text about to be drawn
   * @returns {number}
   */
  function minPx(s) { return HAN.test(s) ? 9 : 7; }

  const FAMILY = ' system-ui, "Segoe UI", Roboto, "PingFang HK", "Noto Sans CJK HK", "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", sans-serif';

  /**
   * Draw one label INSIDE `w` px — shrinking the type to fit before ever cutting a word.
   *
   * WHY (owner, 2026-08-19: "minor overflow everywhere … it should be dynamic so that any
   * resolution works"): the floor is drawn at whatever size the room happens to be, so a label
   * sized for the design width clips the moment the room is short and wide. The old helper only
   * ellipsised, which turns "Plastic" into "Pla…" and "is not paper" into "is no…" — the word is
   * gone, and the machine stops explaining itself. A point or two smaller still READS.
   *
   * The fit is one division, not a search: text width scales linearly with font size, so the size
   * that fits is `size * (w / measured)`. That matters — this runs for every label of every block,
   * every frame.
   *
   * @returns {number} the width actually drawn, so a caller can flow the next thing after it.
   */
  function label(ctx, text, x, y, w, opts) {
    const o = opts || {};
    ctx.save();
    const weight = o.weight || '700';
    let size = o.size || 12;
    ctx.font = weight + ' ' + size + 'px' + FAMILY;
    ctx.fillStyle = o.colour || P.ink;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    let s = String(text === undefined || text === null ? '' : text);
    let wide = ctx.measureText(s).width;
    if (wide > w && w > 0 && s) {
      // Never below `min` (default ~62 % of the asked size): past that it is not a label any more.
      const floor = Math.max(minPx(s), o.min || size * 0.62);
      size = Math.max(floor, Math.floor(size * (w / wide) * 2) / 2);
      ctx.font = weight + ' ' + size + 'px' + FAMILY;
      wide = ctx.measureText(s).width;
      // Drop ONE glyph at a time for CJK, two for Latin. A Han glyph is a whole word-part, so
      // dropping two at a time throws away roughly twice the meaning a Latin pair does.
      const bite = HAN.test(s) ? 1 : 2;
      // Keep the suffix outside the shrinking text. Removing one glyph and adding '…' back
      // to the same string never shortens a CJK label after its first pass and freezes the UI.
      const glyphs = Array.from(s);
      while (glyphs.length && wide > w) {
        glyphs.splice(-Math.min(bite, glyphs.length));
        s = glyphs.join('') + '…'; wide = ctx.measureText(s).width;
      }
    }
    ctx.fillText(s, x, y);
    ctx.restore();
    return wide;
  }

  /**
   * Would label() (so plate(), which calls it) have to ELLIPSISE `text` in a box `w` px wide, asked
   * for at `size`? Replays label()'s own shrink math — same weight, same 7px/62% floor — without
   * drawing, so a caller can ask "is THIS the case that needs wrapping" instead of "did this not
   * measure at its natural size" (clip-browser fix, 2026-09-02, finding 2: the reader's name+brain
   * band used the natural-size question first, which also caught "Cups reader · Linear Regression"
   * — a name label() already shrinks-to-fit on one line with no ellipsis, today, at 1280 wide — and
   * routed it into a needless two-line wrap whose second line then overlapped a nearby dial tag
   * (overlap-browser). Only a name that would ACTUALLY lose words belongs on the wrap path.
   * @returns {boolean}
   */
  function wouldEllipsize(ctx, text, w, size) {
    const s = String(text === undefined || text === null ? '' : text);
    if (!s || w <= 0) return false;
    ctx.save();
    ctx.font = '700 ' + size + 'px' + FAMILY;
    let wide = ctx.measureText(s).width;
    if (wide <= w) { ctx.restore(); return false; }
    const floor = Math.max(minPx(s), size * 0.62);
    const shrunk = Math.max(floor, Math.floor(size * (w / wide) * 2) / 2);
    ctx.font = '700 ' + shrunk + 'px' + FAMILY;
    wide = ctx.measureText(s).width;
    ctx.restore();
    return wide > w;
  }

  /**
   * Prose in a box: wrap on spaces across at most `lines` rows, then fit each row like a label.
   * A sentence ("Press Run — every crate the Checker opens lands here.") has no business being
   * squeezed onto one line of a 280 px screen; it wants wrapping, not shrinking.
   */
  function wrapLabel(ctx, text, cx, y, w, opts) {
    const o = opts || {};
    const size = o.size || 11, lh = o.lineHeight || size + 3, max = o.lines || 3;
    ctx.save();
    ctx.font = (o.weight || '700') + ' ' + size + 'px' + FAMILY;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const rows = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > w) { rows.push(line); line = word; if (rows.length === max) break; }
      else line = next;
    }
    if (line && rows.length < max) rows.push(line);
    ctx.restore();
    rows.forEach((row, i) => label(ctx, row, cx, y + i * lh, w, opts));
    return rows.length * lh;
  }
  /**
   * wrapLabel, but the CUT IS VISIBLE (Composing Arc Plan C, task 3 fix round 1).
   *
   * WHY it exists: `wrapLabel` above fits what it can into `lines` rows and drops everything past
   * them in SILENCE — no ellipsis, no sign that words are missing. Measured on the real canvas, a
   * placed Frame renders 118.8x97.2 (fit 0.90) with only ~87 px of mat, and the k-NN Regressor
   * names an example with a whole sentence; wrapLabel painted "window A → 10 (78% of the" and threw
   * the rest away — INCLUDING the ellipsis game.js had already put there to mark the cut. A face
   * that quietly eats half its own sentence is the dead-surface law wearing an honest face's
   * clothes, so this one says so: whatever will not fit becomes a trailing "…" on the last row,
   * and `label()` (which ellipsises rather than drops) then fits that row to the width.
   *
   * ONE pass, no re-wrapping — the leftover is known the moment the row budget runs out.
   *
   * Scoped to frameBox for now. The same silent drop is reachable on the Board's and Microphone's
   * captions; widening it to `wrapLabel` itself is a change with a blast radius across every face,
   * so it is written here first and left for a task that can re-gate all of them.
   */
  function wrapCut(ctx, text, cx, y, w, opts) {
    const o = opts || {};
    const size = o.size || 11, lh = o.lineHeight || size + 3, max = o.lines || 3;
    ctx.save();
    ctx.font = (o.weight || '700') + ' ' + size + 'px' + FAMILY;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const rows = [];
    let line = '', dropped = false;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > w) {
        rows.push(line); line = word;
        // The budget is spent, and `line` (plus every word after it) has nowhere to go.
        if (rows.length === max) { dropped = true; break; }
      } else line = next;
    }
    if (!dropped && line) rows.push(line);
    ctx.restore();
    // Say the cut OUT LOUD. A trailing comma or dash before the ellipsis reads as a typo, so it
    // goes; a full stop would claim the sentence ended, which is the very lie being fixed.
    if (dropped && rows.length) rows[rows.length - 1] = rows[rows.length - 1].replace(/[.,;:—–-]+$/, '') + '…';
    rows.forEach((row, i) => label(ctx, row, cx, y + i * lh, w, opts));
    return rows.length * lh;
  }
  /**
   * A stamped plate: dark machined face, gold hairline, the word on it.
   * `colour` is the FILL and `textColour` is the WORD, and they are a PAIR — a caller that sets
   * one without the other is how two readouts ended up white-on-white when ink went light.
   */
  function plate(ctx, text, cx, y, w, h, colour, textColour) {
    rr(ctx, cx - w / 2, y, w, h, 4);
    ctx.fillStyle = colour || P.paper;
    ctx.fill();
    // Gold hairline, not black: on a dark plate standing on a dark deck a black stroke is
    // invisible, and the plate loses its edge entirely.
    ctx.strokeStyle = 'rgba(95,227,220,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, text, cx, y + h / 2, w - 8, { size: Math.max(10, Math.min(13, h - 6)), colour: textColour });
  }
  /**
   * A NAME PLATE THAT SCALES, and wraps rather than shrinks (vision-breaker 2026-09-02, finding
   * 8). `plate()` above sizes its word from a plate height the caller pins — the act Buttons
   * passed 15, so every label was asked for 10 px and `label()` then shrank the longest of them
   * ("Test what it studied") to its own 7.5 px floor, where it reads as `Testwhatitstudied`. Worse,
   * it did not grow: at 2800 wide the block is 142 px across and the label was STILL 10 px.
   * Here the type comes from the BLOCK, the box is always two lines tall (so a row of Buttons
   * keeps one geometry whatever their names), and a label too long for one line WRAPS — the
   * per-line `min` keeps `label()` from shrinking a row below the asked size, so it ellipsises a
   * single monstrous word instead of turning the whole name into a smear.
   * @param {number} bottomY  the plate's BOTTOM edge; it grows upward from there
   * @returns {number} the plate's height, so a caller can lay the rest of the block out under it
   */
  function namePlate(ctx, text, cx, bottomY, w, size) {
    const inner = w - 10, lh = Math.round(size) + 2, ph = 2 * lh + 8, py = bottomY - ph;
    rr(ctx, cx - w / 2, py, w, ph, 4);
    ctx.fillStyle = P.paper; ctx.fill();
    ctx.strokeStyle = 'rgba(95,227,220,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.font = '700 ' + size + 'px' + FAMILY;
    const oneLine = ctx.measureText(String(text || '')).width <= inner;
    ctx.restore();
    if (oneLine) label(ctx, text, cx, py + ph / 2, inner, { size, colour: P.ink, min: size });
    else wrapLabel(ctx, text, cx, py + 4 + lh / 2, inner, { size, lines: 2, lineHeight: lh, colour: P.ink, min: size });
    return ph;
  }
  function steelBox(ctx, x, y, w, h, r) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, P.steelLight); g.addColorStop(0.5, P.steel); g.addColorStop(1, P.steelDark);
    rr(ctx, x, y, w, h, r || 6);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    // THE RIM. A dark box on a dark deck has no silhouette without it; this is the single line
    // that keeps the machines from reading as one mud-coloured mass.
    ctx.save();
    rr(ctx, x + 0.8, y + 0.8, w - 1.6, h - 1.6, (r || 6) - 0.8);
    ctx.clip();
    const rim = ctx.createLinearGradient(x, y, x, y + Math.min(h, 14));
    rim.addColorStop(0, 'rgba(226,238,252,0.5)'); rim.addColorStop(1, 'rgba(226,238,252,0)');
    ctx.fillStyle = rim; ctx.fillRect(x, y, w, Math.min(h, 14));
    ctx.restore();
  }
  function bolt(ctx, x, y) {
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = P.steelDark; ctx.fill();
    ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, 1, 0, Math.PI * 2); ctx.fillStyle = P.steelLight; ctx.fill();
  }
  function screen(ctx, x, y, w, h) {
    rr(ctx, x, y, w, h, 5);
    ctx.fillStyle = P.screen; ctx.fill();
    ctx.strokeStyle = 'rgba(126,240,194,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // ---------------- the room ----------------
  /**
   * THE HALL the machine stands in — one WINDOW'S worth of it, painted in SCREEN space.
   *
   * TWO FRAMES OF REFERENCE, on purpose (the fix for the vision-breaker's 2026-09-05 "the room does
   * not exist outside the first screen"):
   *   - The STRUCTURE travels with the machine. `bands` arrive already shifted by the pan (floor.js
   *     `roomBands`), so wall.y / floor.y / front.y / lane are wherever those seams really are in
   *     the room, routinely negative or far below the canvas on a big machine; and `ox` — where the
   *     window's left edge sits in the room — phases the repeating x texture, so a plaster bay, a
   *     conduit clamp, an expansion joint and a hazard chevron belong to the wall and floor they
   *     are cast in rather than sliding under the blocks as the child pans.
   *   - The LIGHT belongs to the window. The gantry lamp, its beam, the pool, the vignette, the
   *     dust and the sheen are all computed over the VISIBLE floor rect, never the band — the floor
   *     band runs from the wall's foot to the room's own bottom edge and is thousands of px tall on
   *     a 60-line machine, so a beam or a concrete tile sized to THAT would be both wrong (one
   *     flat, unlit expanse per screen) and ruinous (a 1280x9000 offscreen canvas per plan). A
   *     window-sized hall costs exactly what it cost when it only ever covered one window.
   * At view 0,0 on a machine that fits the window, `vy`/`vh` collapse to `fy`/`fh` and `ox` is 0 —
   * every number here is then byte-identical to the pre-fix room.
   *
   * @param {number} w @param {number} h  the WINDOW, in css px
   * @param {{wall:{y,h}, floor:{y,h}, front:{y,h}, lane:(number|null)}} bands  seams in screen px
   * @param {number} t  the shared clock
   * @param {number} [ox]  the window's left edge, in ROOM px
   */
  // ---- THE ROOM CACHE (task 092) ----
  // WHY: the room — wall, seams, conduit, lamp wash, floor gradient, concrete, joints, hazard strip,
  // lane, front strip and the three beam cones — is a dozen gradient fills and a few hundred
  // strokes, and it was painted from scratch on EVERY frame. At an empty idle hall that alone was
  // ~16 ms of software raster per frame (measured 2026-09-13: 98% of the main thread doing nothing
  // visible). Everything in it depends only on the window size, the bands and the pan, so it is
  // rendered ONCE into an offscreen canvas at device pixels and blitted; only the four things that
  // move with time (the breathing pool, the vignette that must follow it, the motes, the sweep)
  // are painted live. A pan changes the key every frame and pays today's price only while the
  // finger moves; at rest an ambient frame is one blit and three gradient fills.
  let roomCache = null, roomCacheKey = '';
  // The lamp's pool at FULL breath, as its own layer (built with roomCache, same key). roomLive()
  // blits it with globalAlpha = breath: every stop of the pool is a multiple of breath, so the
  // picture is the same as re-creating the gradient — for the price of a blit instead of a
  // full-window radial fill on every paint (measured 2026-09-13: the two live radial fills were
  // 6.7 of a 10.7 ms paint at 1x).
  let poolCache = null;
  /** The room's shared geometry — one source for the static and the live half (never two copies). */
  function roomGeom(w, h, bands) {
    const wallY = bands.wall.y || 0, wallH = bands.wall.h, wallB = wallY + wallH;
    const fy = bands.floor.y, fh = bands.floor.h;
    // The VISIBLE floor: the part of the band inside the window. Everything lit is measured over
    // this rect, and it IS the whole band whenever the machine fits the window.
    const vy = Math.max(fy, 0), vh = Math.min(fy + fh, h) - vy;
    // THE GANTRY LAMP hangs over the WINDOW (a hall lit from one fixed point 4500 px away would
    // leave every other screen of a big machine in the dark); the work line its pool lands on is
    // the belt lane when it is in the window, else the middle of the visible floor — clamped, so a
    // machine panned eight screens below its belts is still lit.
    const lampX = w * 0.34, lampY = vy - Math.max(wallH * 0.35, 24);
    const workY = Math.max(vy, Math.min(vy + vh, bands.lane != null ? bands.lane : (vy + vh * 0.55)));
    return { wallY, wallH, wallB, fy, fh, vy, vh, lampX, lampY, workY };
  }
  /** Everything the static half depends on. `ox` is kept exact: a pan re-renders, rest hits. */
  function roomKey(w, h, bands, ox, dpr) {
    const f = bands.front || {};
    return [w, h, dpr, bands.wall.y || 0, bands.wall.h, bands.floor.y, bands.floor.h, f.y, f.h, f.overhang || 0,
      bands.lane == null ? '' : bands.lane, Math.round(ox || 0)].join('|');
  }
  /**
   * The room, in screen space, before the pan: the cached static half blitted, then the live half.
   * @param {CanvasRenderingContext2D} ctx the floor's context, DPR transform already applied
   * @param {number} w window width (CSS px) · @param {number} h window height
   * @param {object} bands floor.js roomBands(): {wall:{y,h}, floor:{y,h}, front:{y,h,overhang}, lane}
   * @param {number} t animation clock (ms; 0 = reduced motion's still frame)
   * @param {number} ox the pan's x, so room textures stay put while the window moves over them
   */
  function room(ctx, w, h, bands, t, ox) {
    const dpr = (ctx.getTransform ? ctx.getTransform().a : 0) || 1;
    const key = roomKey(w, h, bands, ox, dpr);
    if (!roomCache || key !== roomCacheKey) {
      const c = roomCache || document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr)); // also clears
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      roomStatic(g, w, h, bands, ox);
      const pc = poolCache || document.createElement('canvas');
      pc.width = c.width; pc.height = c.height; // also clears
      const pg = pc.getContext('2d');
      pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      roomPool(pg, w, h, bands);
      roomCache = c; poolCache = pc; roomCacheKey = key;
    }
    ctx.drawImage(roomCache, 0, 0, w, h);
    roomLive(ctx, w, h, bands, t);
  }
  /** The static half: everything in the room that does not move with time. Drawn into the cache. */
  function roomStatic(ctx, w, h, bands, ox) {
    // Where a texture with period `p` starts, so that it stays put in the ROOM while the window
    // moves over it. (JS % keeps the sign of the dividend, hence the double modulo.)
    const phase = (p) => -((((ox || 0) % p) + p) % p);
    const { wallY, wallH, wallB, fy, fh, vy, vh, lampX, lampY, workY } = roomGeom(w, h, bands);
    // Wall.
    ctx.fillStyle = P.wall; ctx.fillRect(0, wallY, w, Math.max(wallH, 0));
    if (wallH > 0) {
      const g = ctx.createLinearGradient(0, wallY, 0, wallB);
      g.addColorStop(0, 'rgba(182,255,248,0.17)');   // cool key light from above
      g.addColorStop(0.55, 'rgba(11,13,18,0.30)');
      g.addColorStop(1, 'rgba(95,227,220,0.09)');    // cool cyan fill from below
      ctx.fillStyle = g; ctx.fillRect(0, wallY, w, wallH);
      // Plaster bays: the wall is cast in panels, and the seams catch the lamp.
      ctx.lineWidth = 1;
      for (let x = phase(180) + 180; x < w; x += 180) {
        ctx.strokeStyle = 'rgba(5,7,11,0.55)';
        ctx.beginPath(); ctx.moveTo(x, wallY); ctx.lineTo(x, wallB - 6); ctx.stroke();
        ctx.strokeStyle = 'rgba(150,176,208,0.22)';
        ctx.beginPath(); ctx.moveTo(x + 1, wallY); ctx.lineTo(x + 1, wallB - 6); ctx.stroke();
      }
      // A conduit run along the wall with its clamps — the room is wired, and it shows.
      const cy0 = wallY + Math.max(10, wallH * 0.17);
      ctx.strokeStyle = 'rgba(5,7,11,0.5)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(0, cy0 + 1); ctx.lineTo(w, cy0 + 1); ctx.stroke();
      ctx.strokeStyle = '#39465c'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, cy0); ctx.lineTo(w, cy0); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,212,238,0.42)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, cy0 - 1.6); ctx.lineTo(w, cy0 - 1.6); ctx.stroke();
      ctx.lineWidth = 1;
      for (let x = phase(180) + 90; x < w; x += 180) {
        ctx.fillStyle = 'rgba(95,227,220,0.5)';
        rr(ctx, x - 5, cy0 - 6, 10, 12, 3); ctx.fill();
      }
      // The gantry beam's own glow washes the wall under the lamp.
      const wg = ctx.createRadialGradient(w * 0.34, wallB, 8, w * 0.34, wallB, w * 0.34);
      wg.addColorStop(0, 'rgba(182,255,248,0.17)'); wg.addColorStop(1, 'rgba(182,255,248,0)');
      ctx.fillStyle = wg; ctx.fillRect(0, wallY, w, wallH);
      // The hall darkens away from the lamp — the wall's far ends fall into shadow.
      const wsh = ctx.createLinearGradient(0, 0, w, 0);
      wsh.addColorStop(0, 'rgba(11,13,18,0.55)');
      wsh.addColorStop(0.34, 'rgba(11,13,18,0)');
      wsh.addColorStop(1, 'rgba(11,13,18,0.62)');
      ctx.fillStyle = wsh; ctx.fillRect(0, wallY, w, wallH);
      // A shelf rail the devices hang from.
      ctx.fillStyle = P.rail; ctx.fillRect(0, wallB - 6, w, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(0, wallB, w, 10);
    }
    // Floor with a soft perspective grid (static — the belts move, the floor does not).
    const fg = ctx.createLinearGradient(0, fy, 0, fy + fh);
    fg.addColorStop(0, '#161c27'); fg.addColorStop(0.55, '#11151e'); fg.addColorStop(1, '#0b0d12');
    ctx.fillStyle = fg; ctx.fillRect(0, fy, w, fh);
    // The concrete GRAIN stays with the window on purpose. It is amorphous — 0.07/0.22-alpha
    // specks and a dozen faint drag scuffs — so pinning it is invisible, while tiling it across a
    // 4519 px room would repeat those scuffs three and a half times, which is not. Its tile is
    // capped at the window's height so a tall machine cannot ask for a 1280x9000 offscreen canvas.
    const ch = Math.max(1, Math.min(fh, h));
    ctx.drawImage(concrete(w, ch), 0, vy);
    // Expansion joints: a poured floor is cast in bays, and the joints run to the vanishing side.
    // The horizontal ones step off `fy` (so they travel with the room for free); the loop is
    // wound forward to the first one inside the window, because on a 60-line machine the band is
    // ~9000 px tall and 100 of its 103 rows are off screen.
    const rowTop = fy + 60, rowBot = Math.min(fy + fh, vy + vh);
    const row0 = rowTop + Math.max(0, Math.ceil((vy - rowTop) / 90)) * 90;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = phase(120); x <= w; x += 120) { ctx.moveTo(x, fy); ctx.lineTo(x, fy + fh); }
    for (let y = row0; y < rowBot; y += 90) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,176,208,0.13)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = phase(120); x <= w; x += 120) { ctx.moveTo(x + 2, fy); ctx.lineTo(x + 2, fy + fh); }
    for (let y = row0; y < rowBot; y += 90) { ctx.moveTo(0, y + 2); ctx.lineTo(w, y + 2); }
    ctx.stroke();
    ctx.lineWidth = 1;
    // A painted safety lane along the belt line and a hazard strip at the wall's foot — the
    // floor reads as a WORKSHOP, not a grid.
    if (wallH > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, fy + 10, w, 8); ctx.clip();
      for (let x = phase(32) - 16; x < w + 16; x += 16) { ctx.fillStyle = Math.round((x - phase(32)) / 16) % 2 ? '#0b0d12' : '#3f8fa3'; ctx.beginPath(); ctx.moveTo(x, fy + 10); ctx.lineTo(x + 8, fy + 10); ctx.lineTo(x, fy + 18); ctx.lineTo(x - 8, fy + 18); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // `!= null`, not truthiness: the lane is a real y that the pan can carry to exactly 0.
    if (bands.lane != null) {
      ctx.fillStyle = 'rgba(95,227,220,0.08)'; ctx.fillRect(0, bands.lane - 46, w, 92);
      ctx.strokeStyle = 'rgba(95,227,220,0.38)'; ctx.lineWidth = 3; ctx.setLineDash([26, 14]);
      ctx.beginPath(); ctx.moveTo(0, bands.lane - 46); ctx.lineTo(w, bands.lane - 46); ctx.moveTo(0, bands.lane + 46); ctx.lineTo(w, bands.lane + 46); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    // Front strip (the actors' edge). Painted BEFORE the light rather than after it, and it costs
    // nothing: every lit rect below is bounded by the floor band, which ends exactly where this
    // strip begins. Up here it still exists on the one view the old order would have skipped it
    // on — a machine panned so far down that the window holds no floor at all.
    if (bands.front.h > 0) {
      const ffg = ctx.createLinearGradient(0, bands.front.y, 0, bands.front.y + bands.front.h);
      ffg.addColorStop(0, P.front); ffg.addColorStop(1, '#06080c');
      ctx.fillStyle = ffg; ctx.fillRect(0, bands.front.y, w, bands.front.h);
      // The gradient runs over the strip's OWN height, never over the room's bottom margin below
      // it: stretching it there washed the strip ~40 % paler on machines that never pan (review
      // fix round 3, finding 1 — see floor.js roomBands). The margin is simply the colour the
      // gradient ends on, so the strip reads the same and the pannable overhang stays void-free.
      const over = bands.front.overhang || 0;
      if (over > 0) { ctx.fillStyle = '#06080c'; ctx.fillRect(0, bands.front.y + bands.front.h, w, over); }
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, bands.front.y, w, 6);
    }
    if (vh <= 0) return;   // the window is entirely inside the wall or the front strip — no floor to light
    // ---- THE GANTRY LAMP: the hall's one light source, and this design's signature ----
    // Everything below hangs off it: the beam falls from the top-left, pools on the work line,
    // and the corners go cool and dark — so the machine is the lit thing in a real room.
    // It hangs over the WINDOW (see the two-frames note above): a hall lit from one fixed point
    // 4500 px away would leave every other screen of a big machine in the dark (roomGeom).
    // The work line the pool lands on — the belt lane when it is in the window, else the middle of
    // the visible floor. Clamped for the same reason the lamp is: a machine panned eight screens
    // below its belts must still be lit (roomGeom).
    // The beam: a soft cone from the lamp down across the work line (drawn UNDER the objects).
    ctx.save();
    ctx.beginPath(); ctx.rect(0, vy, w, vh); ctx.clip();
    // Three nested cones — wide+faint to narrow+bright — so the beam has soft edges and a core,
    // the way light through dusty air actually falls. One hard-edged triangle read as a sticker.
    for (const [spread, top, alpha] of [[0.52, 44, 0.06], [0.36, 30, 0.09], [0.20, 16, 0.13]]) {
      ctx.beginPath();
      ctx.moveTo(lampX - top, lampY); ctx.lineTo(lampX + top, lampY);
      ctx.lineTo(lampX + w * spread, vy + vh + 40); ctx.lineTo(lampX - w * spread * 0.92, vy + vh + 40);
      ctx.closePath();
      const beam = ctx.createLinearGradient(0, lampY, 0, vy + vh);
      beam.addColorStop(0, 'rgba(190,247,255,' + alpha.toFixed(3) + ')');
      beam.addColorStop(0.5, 'rgba(190,247,255,' + (alpha * 0.5).toFixed(3) + ')');
      beam.addColorStop(1, 'rgba(190,247,255,0)');
      ctx.fillStyle = beam; ctx.fill();
    }
    ctx.restore();
    // Cool, deep corners — the hall recedes into shadow instead of ending at a grey edge.
    // task 092: drawn HERE, under the pool, rather than over it as before. Both are low-alpha
    // washes (pool ≤ 0.24, vignette ≤ 0.72, overlapping only in a mid-radius ring where each is
    // ~0.1), so swapping their order moves nothing the eye can see — and it makes the vignette
    // static: one radial fill per resize instead of one per paint.
    const vg = ctx.createRadialGradient(lampX, workY, Math.min(w, vh) * 0.30, lampX, workY, Math.max(w, vh) * 0.86);
    vg.addColorStop(0, 'rgba(11,13,18,0)'); vg.addColorStop(0.62, 'rgba(11,13,18,0.24)'); vg.addColorStop(1, 'rgba(11,13,18,0.72)');
    ctx.fillStyle = vg; ctx.fillRect(0, vy, w, vh);
  }
  /** The pool where the beam lands, at FULL breath — the layer roomLive() blits (see poolCache). */
  function roomPool(ctx, w, h, bands) {
    const { vy, vh, lampX, workY } = roomGeom(w, h, bands);
    if (vh <= 0) return;
    const pool = ctx.createRadialGradient(lampX, workY, 10, lampX, workY, Math.max(w, vh) * 0.52);
    pool.addColorStop(0, 'rgba(160,235,255,0.240)');
    pool.addColorStop(0.5, 'rgba(160,235,255,0.090)');
    pool.addColorStop(1, 'rgba(160,235,255,0)');
    ctx.fillStyle = pool; ctx.fillRect(0, vy, w, vh);
  }
  /**
   * The live half: the three things in the room that move with time, painted over the cached
   * static half on every paint — the breathing pool (a blit of its layer at the breath's alpha),
   * the dust motes, the skylight sweep.
   */
  function roomLive(ctx, w, h, bands, t) {
    const { vy, vh, lampX } = roomGeom(w, h, bands);
    if (vh <= 0) return;   // the window is entirely inside the wall or the front strip — no floor to light
    // The pool BREATHES on a 7.4 s period (0.13 cycles/s, flash-safe; at t=0 the breath sits at
    // its rest value, so reduced motion gets the correct still frame).
    const breath = 0.9 + 0.1 * Math.sin(t / BREATH_MS);
    if (poolCache) { ctx.save(); ctx.globalAlpha = breath; ctx.drawImage(poolCache, 0, 0, w, h); ctx.restore(); }
    // Dust in the beam: 90 motes drifting UP through the light (they wrap; period ~22 s).
    ctx.save();
    ctx.beginPath(); ctx.rect(0, vy, w, vh); ctx.clip();
    for (const m of MOTES) {
      const mx = (m.x + Math.sin(t / 7000 + m.ph) * 0.012) * w;
      const my = vy + ((m.y - (t / 22000) * m.sp) % 1 + 1) % 1 * vh;
      const inBeam = 1 - Math.min(1, Math.abs(mx - lampX) / (w * 0.42));
      if (inBeam <= 0.02) continue;
      ctx.fillStyle = 'rgba(200,247,255,' + (0.05 + inBeam * 0.16).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(mx, my, m.r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    // Skylight sheen: one slow sweep across the floor (period 16 s — flash-safe; frozen at t=0).
    const sx = ((t / 16000) % 1) * (w + 400) - 200;
    // Only the band the sheen actually lights is filled (task 092): the gradient is transparent
    // outside ±160 px of `sx`, and filling the whole floor evaluated it over every pixel anyway.
    const x0 = Math.max(0, sx - 160), x1 = Math.min(w, sx + 160);
    if (x1 > x0) {
      const sg = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
      sg.addColorStop(0, 'rgba(182,255,248,0)'); sg.addColorStop(0.5, 'rgba(182,255,248,0.035)'); sg.addColorStop(1, 'rgba(182,255,248,0)');
      ctx.fillStyle = sg; ctx.fillRect(x0, vy, x1 - x0, vh);
    }
  }

  // ---------------- item plane ----------------
  function hopper(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    // Funnel body.
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05, y + h * 0.28); ctx.lineTo(x + w * 0.95, y + h * 0.28);
    ctx.lineTo(x + w * 0.68, y + h * 0.78); ctx.lineTo(x + w * 0.32, y + h * 0.78); ctx.closePath();
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, P.steelDark); g.addColorStop(0.5, P.steelLight); g.addColorStop(1, P.steel);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    // Chute to the belt (right).
    steelBox(ctx, x + w * 0.62, y + h * 0.66, w * 0.36, h * 0.16, 3);
    // Crate heap on top.
    const items = live.items || [];
    const n = Math.min(4, Math.max(1, items.length));
    for (let i = 0; i < n; i++) {
      const cw = w * 0.26, ch = h * 0.16;
      const cx = x + w * (0.22 + (i % 3) * 0.2), cy = y + h * 0.1 + (i >= 3 ? -ch * 0.7 : 0);
      crateBox(ctx, cx, cy, cw, ch, items[i]);
    }
    // Rate dial (brass).
    ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = P.brass; ctx.fill(); ctx.strokeStyle = P.brassDark; ctx.stroke();
    const ang = -Math.PI * 0.75 + (Math.min(120, live.rate || 20) / 120) * Math.PI * 1.5;
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.5); ctx.lineTo(x + w * 0.5 + Math.cos(ang) * w * 0.09, y + h * 0.5 + Math.sin(ang) * w * 0.09);
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    plate(ctx, o.name || live.label || '', x + w / 2, y + h * 0.84, w * 0.9, 18);
  }
  function pallet(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    // Wooden pallet.
    ctx.fillStyle = P.kraftDark; rr(ctx, x, y + h * 0.7, w, h * 0.12, 3); ctx.fill();
    ctx.fillStyle = P.kraft; for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * (w - 8) / 4, y + h * 0.7, (w - 8) / 4 - 4, h * 0.05);
    // ONE honest heap of plain crates (M8 fix-wave, final-review-arc2.md): the pre-split "studied
    // here (open, stamped) / sealed there (closed, locked)" pair this used to draw died with the
    // Split gate — v2 decides study vs exam PER CRATE, downstream at the Pen, never at the table
    // itself (no compile-time stamp survives here; datasetInfo, game.js, hands this painter only
    // {label} now — live.studied/live.sealed could never be defined again). A stack of plain,
    // unstamped, unsealed crates is the one honest picture left: a table of data sits here,
    // waiting to be dealt.
    const pw = w * 0.5, ph = h * 0.16;
    for (let i = 0; i < 3; i++) crateBox(ctx, x + w * 0.25, y + h * 0.66 - (i + 1) * ph * 0.92, pw, ph, null);
    // Dataset names read like headlines ("Ice-cream stand - how many cups?"). The pallet is a
    // label on a crate, not a headline: take the part before the dash and let the picker keep
    // the question. Splitting beats a second string per dataset that could drift out of sync.
    const title = String(live.label || o.name || '').split(' \u2014 ')[0];
    plate(ctx, title, x + w / 2, y + h * 0.84, w * 0.96, 18);
  }
  function belt(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const by = y + h * 0.35, bh = h * 0.34;
    // Legs.
    ctx.fillStyle = P.steelDark;
    ctx.fillRect(x + 8, by + bh, 5, h - (by - y) - bh); ctx.fillRect(x + w - 13, by + bh, 5, h - (by - y) - bh);
    // Rubber belt with a crawling tread (period 1 s linear translation — not luminance).
    rr(ctx, x, by, w, bh, bh / 2);
    ctx.fillStyle = P.rubber; ctx.fill();
    ctx.save(); ctx.clip();
    const phase = ((live.running ? t : 0) / 1000 * 22) % 22;
    ctx.strokeStyle = P.rubberLight; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sx = x - 22 + phase; sx < x + w + 22; sx += 22) { ctx.moveTo(sx, by + 2); ctx.lineTo(sx - 6, by + bh - 2); }
    ctx.stroke();
    ctx.restore();
    // Rails + rollers.
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, by + 1); ctx.lineTo(x + w, by + 1); ctx.moveTo(x, by + bh - 1); ctx.lineTo(x + w, by + bh - 1); ctx.stroke();
    ctx.lineWidth = 1;
    for (let rx = x + 12; rx < x + w - 6; rx += 24) bolt(ctx, rx, by + bh / 2);
    // At the belt's HEAD, not its centre: a reader stands mid-track, and its dial tags hang
    // under it (census 2026-08-19 — every reader's "sure line" landed on this "3 /s").
    if (live.speed) label(ctx, live.speed + ' /s', x + 26, y + h - 6, 48, { size: 9, colour: P.inkSoft, weight: '600' });
  }
  function gate(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const exits = Math.max(1, o.exits || 1);
    // Chute arms fanning right (drawn first, behind the tower).
    for (let k = 0; k < exits; k++) {
      const ay = y + h * ((k + 0.5) / exits);
      const lit = live.armed === k;
      ctx.strokeStyle = lit ? P.brass : P.steelDark; ctx.lineWidth = lit ? 6 : 4;
      ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + h * 0.5); ctx.quadraticCurveTo(x + w * 0.85, y + h * 0.5, x + w, ay); ctx.stroke();
      label(ctx, String(k + 1), x + w - 6, ay - 8, 14, { size: 9, colour: lit ? P.brassDark : P.inkSoft });
    }
    ctx.lineWidth = 1;
    // Tower.
    steelBox(ctx, x + w * 0.15, y + h * 0.12, w * 0.5, h * 0.76, 8);
    // Lever.
    const lx = x + w * 0.4, ly = y + h * 0.5;
    ctx.beginPath(); ctx.arc(lx, ly, w * 0.08, 0, Math.PI * 2); ctx.fillStyle = P.steelDark; ctx.fill();
    const la = live.armed !== null && live.armed !== undefined ? -Math.PI / 4 + (live.armed / Math.max(1, exits - 1)) * Math.PI / 2 : -Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + Math.cos(la - Math.PI / 2) * w * 0.28, ly + Math.sin(la - Math.PI / 2) * w * 0.28);
    ctx.strokeStyle = P.brass; ctx.lineWidth = 4; ctx.stroke(); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(lx + Math.cos(la - Math.PI / 2) * w * 0.28, ly + Math.sin(la - Math.PI / 2) * w * 0.28, 4, 0, Math.PI * 2); ctx.fillStyle = P.bad; ctx.fill();
    plate(ctx, o.name || live.label || '', x + w * 0.4, y + h * 0.9, w * 0.62, 16);
  }
  function bin(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const bx = x + w * 0.1, by = y + h * 0.28, bw = w * 0.8, bh = h * 0.6;
    rr(ctx, bx, by, bw, bh, 6);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#1c2431'); g.addColorStop(0.5, '#41506a'); g.addColorStop(1, '#171d29');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    // Fill level (crates inside).
    const fill = Math.min(1, (live.count || 0) / 8);
    if (fill > 0) {
      ctx.save(); rr(ctx, bx + 3, by + 3, bw - 6, bh - 6, 4); ctx.clip();
      const fh = (bh - 6) * fill;
      ctx.fillStyle = P.kraft; ctx.fillRect(bx + 3, by + bh - 3 - fh, bw - 6, fh);
      ctx.strokeStyle = P.kraftDark; for (let ly = by + bh - 3 - fh + 8; ly < by + bh - 3; ly += 9) { ctx.beginPath(); ctx.moveTo(bx + 3, ly); ctx.lineTo(bx + bw - 3, ly); ctx.stroke(); }
      ctx.restore();
    }
    // Rim.
    ctx.fillStyle = P.steelDark; rr(ctx, bx - 3, by - 4, bw + 6, 8, 3); ctx.fill();
    // Count badge + name.
    label(ctx, live.count === undefined ? '' : live.count, x + w / 2, by + bh / 2, bw, { size: 18, colour: '#fff', weight: '800' });
    plate(ctx, o.name || '', x + w / 2, y + 2, w * 0.96, 18);
    // One-shot landing burst (settles in 600 ms).
    if (live.burstAge !== undefined && live.burstAge < 600) {
      const k = live.burstAge / 600;
      ctx.strokeStyle = 'rgba(255,200,90,' + (1 - k) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + w / 2, by, 10 + 40 * k, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  /**
   * THE PEN (task B): a waiting room, modelled on the BIN's own idiom above — the same
   * receptacle-with-a-fill-level a child already reads as "a pile of crates in here" — but with
   * a barred gate across its mouth instead of a rim, since a Pen (unlike a bin) lets its pile
   * back OUT again. Shut (steel bars) while closed; swung open (green, unbarred) once release
   * has fired — the same fact the plate's own lever/switch reports in words.
   */
  function pen(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const bx = x + w * 0.1, by = y + h * 0.32, bw = w * 0.8, bh = h * 0.56;
    rr(ctx, bx, by, bw, bh, 6);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#1c2431'); g.addColorStop(0.5, '#41506a'); g.addColorStop(1, '#171d29');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    // The held pile — fills exactly like a bin's, same 8-crate-reads-full scale.
    const held = live.held || 0;
    const fill = Math.min(1, held / 8);
    if (fill > 0) {
      ctx.save(); rr(ctx, bx + 3, by + 3, bw - 6, bh - 6, 4); ctx.clip();
      const fh = (bh - 6) * fill;
      ctx.fillStyle = P.kraft; ctx.fillRect(bx + 3, by + bh - 3 - fh, bw - 6, fh);
      ctx.strokeStyle = P.kraftDark; for (let ly = by + bh - 3 - fh + 8; ly < by + bh - 3; ly += 9) { ctx.beginPath(); ctx.moveTo(bx + 3, ly); ctx.lineTo(bx + bw - 3, ly); ctx.stroke(); }
      ctx.restore();
    }
    label(ctx, held || '', x + w / 2, by + bh / 2, bw, { size: 16, colour: '#fff', weight: '800' });
    // The gate: closed = steel bars across the mouth (a locked pen); open = a plain green bar,
    // no bars at all — the SAME "swung open" reading a real gate gives at a glance.
    const gy = by - 5;
    ctx.fillStyle = live.open ? P.ok : P.steelDark;
    rr(ctx, bx - 3, gy - 4, bw + 6, 9, 3); ctx.fill();
    if (!live.open) {
      ctx.strokeStyle = P.steelLight; ctx.lineWidth = 2;
      for (let bx2 = bx + 5; bx2 < bx + bw - 3; bx2 += 11) { ctx.beginPath(); ctx.moveTo(bx2, gy - 8); ctx.lineTo(bx2, gy + 7); ctx.stroke(); }
      ctx.lineWidth = 1;
    }
    plate(ctx, o.name || '', x + w / 2, y + 2, w * 0.96, 18);
  }
  /**
   * THE EVALUATOR'S FACE.
   *
   * The mean absolute error is the LESSON of a number machine, and until now it was the one thing
   * this block could not show (vision-breaker 2026-09-02, the blocker). The bars that carry it
   * were written as the `else` of the scatter branch, and checkerView() returns non-null from the
   * first graded crate onward — so they were visible exactly when they were EMPTY and hidden
   * exactly when they held the number. A child who performed all three acts perfectly was shown
   * "Training 29 [93%] / Held-out 10 [90%]": two green bars three points apart, and those
   * percentages are not the error at all — they are "within the allowance" (tolerance 6 on every
   * ice-cream crate), which flattens the very gap the Investigation Lab exists to teach.
   *
   * So for a NUMBER machine the error band is RESERVED, always, at the top of the scoreboard, and
   * every lane LEADS WITH THE ERROR. The percentage each bar carries is a reading of that error
   * against the ALLOWANCE the block is actually grading by (its own tolerance dial) — 45 % of the
   * allowance on studied days, 60 % on new ones — so the number, the bar and the lesson are one
   * answer. The tolerance-band accuracy stays, demoted to the footnote it always was. The
   * populations are told apart by COLOUR — signal-teal = studied, amber = held-out, chalk = the
   * sealed exam, the same three the Splitter paints on its own bar — in the LANES and, since the
   * whole-branch review's I5, in the SCATTER too: until then the scatter had two colours and this
   * note claimed three, because checkerView answered a boolean and folded every exam row into
   * "new". And the scatter draws the residual sticks chart.js was already computing and nobody
   * drew.
   */

  /** The lane bar's four inks, keyed by the verdict each segment stands for. Chalk for the crates
   *  that carried no answer key: NOT a failure, so never the wrong-red (task 108 fix round). It is
   *  the same chalk the unscorable verdict word, the exam lane and the exam scatter dot wear. */
  const SEG_INK = { right: P.ok, wrong: P.bad, unsure: '#9aa3ab', unscorable: P.chalk };

  /**
   * ONE LANE'S BAR, decided apart from the painting — the segments and what they are a share OF.
   *
   * Extracted because the rule was wrong while it was buried in the draw call (task 108 review,
   * Important 1). The bar was segmented `right · wrong · unsure` over `col.n`, and task 108 made
   * `n` also count the crates that carried NO ANSWER KEY — so a column of 2 right / 1 wrong /
   * 2 unscorable painted 40 % green, 20 % red and 40 % of the BACKGROUND showing through, with
   * nothing naming the gap. The fourth segment closes it: every crate the lane counts now wears a
   * colour, so the bar's denominator is exactly the number printed in the lane word beside it.
   *
   * A segment with no crates is omitted rather than emitted at zero width, so the returned list
   * IS the legend a reader has to explain.
   *
   * @param {{n:number,right:number,wrong:number,unsure:number,unscorable:number}|null|undefined} col
   *   one checkerSummary column (Engine.checkerSummary → studied | fresh | exam).
   * @returns {{segs:Array<{key:string,n:number,frac:number}>, judged:number}|null}
   *   null for an empty column (nothing to draw); `frac` is the share of `col.n`, so the fracs of
   *   a whole column sum to 1; `judged` is the accuracy denominator (right + wrong), which is NOT
   *   the bar's denominator — the caption says so in words whenever the two differ.
   */
  function laneBar(col) {
    if (!col || !col.n) return null;
    const segs = [];
    for (const key of ['right', 'wrong', 'unsure', 'unscorable']) {
      const n = col[key] || 0;
      if (n > 0) segs.push({ key, n, frac: n / col.n });
    }
    return { segs, judged: (col.right || 0) + (col.wrong || 0) };
  }

  function checker(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    // Station body (left third): a hood that opens crates.
    const sw = w * 0.34;
    steelBox(ctx, x, y + h * 0.18, sw, h * 0.7, 8);
    screen(ctx, x + 6, y + h * 0.24, sw - 12, h * 0.22);
    // WHILE A TEACH ACT RUNS the screen counts what is being FILED, not what has been graded
    // (finding 5). engine.js keeps a filed crate out of `count`, `log` and every tally — correct,
    // teaching is not a test — so for 15.6 s and 29 crates this block used to be byte-identical
    // to idle while its own `filed` climbed 0 -> 29. It has the fact; here it says it.
    const filing = !!live.learning && live.filed > 0;
    // NOTHING COULD ANSWER (review I3). An answer act over an untaught Model deals a whole pile
    // past a reader that returns null; engine.js counts those crates `unread` and keeps them out
    // of the log so a lane's count can never disagree with its percentage — which left this
    // face saying `opened 0` for the whole pass, identical to a machine that was never run.
    // floor.js only sets the note while it is the WHOLE story, so it can never outstay its truth.
    const unread = !filing && !!live.unreadNote;
    label(ctx, filing ? live.words.filed : unread ? live.words.unread : live.words.opened, x + sw / 2, y + h * 0.285, sw - 16, { size: 8, colour: P.inkSoft, weight: '700' });
    label(ctx, filing ? live.filed : unread ? live.unread : (live.count === undefined ? '' : live.count), x + sw / 2, y + h * 0.385, sw - 16, { size: 15, colour: P.screenText, weight: '800' });
    // The LAST crate's verdict, captioned as such — bare under the count it read as one phrase,
    // "39 right", about 39 crates three of which were wrong (finding 11).
    label(ctx, (filing || unread) ? '' : (live.verdictWord || ''), x + sw / 2, y + h * 0.56, sw - 10, { size: 9, colour: live.verdict === 'right' ? P.ok : live.verdict === 'wrong' ? P.bad : P.chalk, weight: '800' });
    plate(ctx, o.name || '', x + sw / 2, y + h * 0.78, sw - 8, 16);

    // ---- the scoreboard (right two thirds) -------------------------------------------------
    const bx = x + sw + 8, bw = w - sw - 8;
    rr(ctx, bx, y, bw, h, 8); ctx.fillStyle = P.paper; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    const s = live.tally;
    const num = live.kind === 'number';
    // In a 112x72 shelf icon there is no honest way to draw "Training": it becomes "T…", which
    // teaches nothing. An icon shows the SHAPE of the block; the block itself shows the words.
    // THE SEALED EXAM earns a third column the moment a teacher opens it, and never before —
    // checkerSummary has computed it since task 5 and nothing drew it (finding 10).
    const cols = live.compact ? [] : [
      { key: 'studied', word: live.words.studied, col: s && s.studied, ink: P.signal },
      { key: 'fresh', word: live.words.fresh, col: s && s.fresh, ink: P.warn },
    ];
    if (!live.compact && s && s.exam && s.exam.n > 0) cols.push({ key: 'exam', word: live.words.exam, col: s.exam, ink: P.chalk });

    let top = y + 6;
    if (num && cols.length) top = errorBand(ctx, live, cols, bx, top, bw, h);
    // THE LANES: how many crates, and how often it landed inside the allowance. On a number
    // machine this is the FOOTNOTE under the error — it is a tolerance band, not a distance, and
    // leading with it is what made a 31 %-worse showing read as "the same answer".
    const laneH = num ? 15 : h * 0.16;
    cols.forEach((c, i) => {
      const ly = top + i * laneH;
      // Measure what was actually drawn and start the bar after it. The lane word is translated
      // and carries a count, so its width is not knowable in advance — a fixed 42 % split put the
      // bar on top of "Training 29" the moment the count reached two digits.
      const drew = label(ctx, c.word + (c.col && c.col.n ? ' ' + c.col.n : ''), bx + 6, ly + laneH * 0.5, bw * 0.46, { size: num ? 9 : 11, align: 'left', colour: c.ink });
      // A bar: green right · red wrong · grey not sure · chalk no answer key, proportional — one
      // segment per crate the lane counts, so the picture and the lane's own number are one fact
      // (laneBar, above, owns which segments exist).
      const barX = bx + 6 + Math.max(bw * 0.40, drew + 8), barW = bx + bw - 6 - barX, barH = num ? 8 : 10;
      const by2 = ly + (laneH - barH) / 2;
      rr(ctx, barX, by2, barW, barH, 3); ctx.fillStyle = '#0c1119'; ctx.fill();
      const bar = laneBar(c.col);
      if (bar) {
        let off = 0;
        for (const sg of bar.segs) {
          const ww = barW * sg.frac;
          ctx.fillStyle = SEG_INK[sg.key]; rr(ctx, barX + off, by2, ww, barH, 2); ctx.fill();
          off += ww;
        }
        // The percentage arrives ALREADY WORDED from the bridge (floor.js live.laneWords): when
        // the bar holds crates the accuracy does not count it has to name its own denominator —
        // "67 % of 3" over a bar two fifths green, never a bare "67 %". floor-art.js calls no t().
        label(ctx, (live.laneWords && live.laneWords[c.key]) || '', barX + barW / 2, by2 + barH / 2, barW, { size: num ? 8 : 9, colour: '#fff', weight: '800' });
      }
    });
    top += cols.length * laneH + 2;
    // THE CHALK SEGMENT'S KEY, drawn only when a lane actually holds one and something else WAS
    // scored — the case the picture-band note below cannot speak for, because there is a score.
    // A swatch in the segment's own ink, then the count and the words, so the new colour on the
    // bar is named where it is seen rather than in a panel two taps away.
    if (live.noKeyKey) {
      const sy = top + 5;
      ctx.fillStyle = SEG_INK.unscorable; rr(ctx, bx + 6, sy - 3, 6, 6, 1); ctx.fill();
      label(ctx, live.noKeyKey, bx + 16, sy, bw - 24, { size: 8, align: 'left', colour: P.inkSoft });
      top += 12;
    }
    if (live.unsureKey) {
      const sy = top + 5;
      ctx.fillStyle = SEG_INK.unsure; rr(ctx, bx + 6, sy - 3, 6, 6, 1); ctx.fill();
      label(ctx, live.unsureKey, bx + 16, sy, bw - 24, { size: 8, align: 'left', colour: P.inkSoft });
      top += 12;
    }
    // A LEARN act has no lanes to move, so it says what it IS doing where they sit (finding 5).
    if (filing && live.filedNote) top += wrapLabel(ctx, live.filedNote, bx + bw / 2, top + 6, bw - 10, { size: 9, lines: 2, lineHeight: 11, colour: P.inkSoft, weight: '700' }) + 4;
    // …and an act nothing could answer says THAT, in the same place, for the same reason (I3).
    else if (unread) top += wrapLabel(ctx, live.unreadNote, bx + bw / 2, top + 6, bw - 10, { size: 9, lines: 2, lineHeight: 11, colour: P.warn, weight: '700' }) + 4;

    // ---- THE PICTURE, in whatever band is left ---------------------------------------------
    // `live.plan` is a FUNCTION (floor.js: `live.plan = bridge.checkerView`) so this card supplies
    // the exact box it already laid out; it returns null for an empty log (or a compact shelf
    // icon, too small for it). It is no longer an ALTERNATIVE to the numbers — the numbers are
    // drawn above, always, and the picture takes the remainder. If the remainder cannot hold a
    // picture worth reading, the numbers keep the block: an on-block scatter squeezed under 44 px
    // teaches nothing, and the evidence sheet draws the full version anyway.
    const py = top, ph = y + h - 6 - top;
    if (live.compact) return;
    if (ph < 44 || bw < 84) {
      // Too short for a picture worth reading — so the band carries the LESSON IN WORDS instead
      // (the owner's ruling: "keep the numbers and drop the scatter"; the breaker's own note that
      // the evidence sheet's gap sentence is the best thing in the lesson and two taps deep). At
      // 1024x768 this scoreboard is ~107 px across and ~37 px of band is left under the numbers:
      // three lines of prose fit there, a scatter does not.
      if (ph >= 22 && live.gapLine) wrapLabel(ctx, live.gapLine, bx + bw / 2, py + 6, bw - 10, { size: 8, lines: Math.max(1, Math.floor(ph / 10)), lineHeight: 10, colour: P.inkSoft, weight: '700' });
      return;
    }
    const plan = live.plan ? live.plan(o.id, bw, ph) : null;
    if (plan && live.kind === 'yesno') {
      ctx.save(); ctx.beginPath(); ctx.rect(bx, py, bw, ph); ctx.clip(); ctx.translate(bx, py);
      for (const c of plan.cells) {
        ctx.globalAlpha = 0.2 + 0.7 * c.share;
        ctx.fillStyle = c.good ? 'rgba(47,191,113,0.85)' : 'rgba(224,85,77,0.8)';
        ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.chalk;
        ctx.font = '700 ' + Math.round(Math.min(c.w, c.h) * 0.3) + 'px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(c.n), c.x + c.w / 2, c.y + c.h / 2);
      }
      ctx.restore();
      return;
    }
    if (plan) {
      // A number machine: the dashed diagonal is being exactly right, a RED STICK per new row is
      // how far off it was (chart.js has always computed `sticks`, and this file never drew one),
      // and the two populations are told apart by COLOUR — a 2.6 px ring beside a 3 px dot was
      // one indistinguishable cyan blob at 4x zoom.
      ctx.save(); ctx.beginPath(); ctx.rect(bx, py, bw, ph); ctx.clip(); ctx.translate(bx, py);
      if (plan.path.length > 1) {
        ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(255,194,75,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(plan.path[0].px, plan.path[0].py);
        for (let i = 1; i < plan.path.length; i++) ctx.lineTo(plan.path[i].px, plan.path[i].py);
        ctx.stroke(); ctx.setLineDash([]);
      }
      // ONE ink for the sticks on purpose, though they now carry a `pop` of their own: a stick is
      // the ERROR, and error means the same thing on a held-out row as on a sealed-exam one. The
      // POPULATION is said by the dot's colour, immediately below.
      ctx.strokeStyle = 'rgba(216,64,92,0.75)'; ctx.lineWidth = 1;
      for (const st of plan.sticks || []) { ctx.beginPath(); ctx.moveTo(st.px, st.py); ctx.lineTo(st.px, st.gy); ctx.stroke(); }
      for (const pt of plan.pts) {
        ctx.beginPath(); ctx.arc(pt.px, pt.py, 2.8, 0, 6.2832);
        // Three populations, three colours — the same three the lanes above and the Splitter's
        // own bar use (review I5: an exam row was painted the held-out amber, so the pile a
        // teacher deliberately unseals was indistinguishable the moment it landed).
        ctx.fillStyle = pt.pop === 'exam' ? P.chalk : pt.studied ? P.signal : P.warn; ctx.fill();
      }
      ctx.restore();
      return;
    }
    // Nothing to picture. WHY there is nothing decides the words: a run that opened crates with no
    // answer key has already happened, so "Run to fill the score" would be a lie about it (task
    // 108, the same finding-I3 rule the unread note follows).
    if (!num && live.noKeyNote) wrapLabel(ctx, live.noKeyNote, bx + bw / 2, py + Math.max(0, ph / 2 - 12), bw - 10, { size: 9, lines: 3, lineHeight: 11, colour: P.warn, weight: '700' });
    else if (!num) label(ctx, live.words.tallyIdle || '', bx + bw / 2, py + ph / 2, bw - 8, { size: 10, colour: P.inkSoft });
  }
  /**
   * THE MEAN ABSOLUTE ERROR, always drawn for a number machine — the block's headline number.
   * Each lane leads with the error itself; the bar behind it is that error measured against the
   * ALLOWANCE the Evaluator grades by (its tolerance dial), so a bar at full says "on average it
   * misses by the whole allowance" — a reading a child can act on, unlike a percentage of the
   * other bar. With no usable allowance the bars fall back to sharing the longest error, which is
   * still a true reading of the picture drawn.
   * @param {object} live  the floor bridge's live state for this block (tally, tolerance, words)
   * @param {Array<{word:string, col:object, ink:string}>} cols  the lanes, in paint order
   * @returns {number} the y the rest of the scoreboard may start at
   */
  function errorBand(ctx, live, cols, bx, y, bw, h) {
    const tol = Number.isFinite(live.tolerance) && live.tolerance > 0 ? live.tolerance : null;
    const errs = cols.map((c) => (c.col && c.col.meanError !== null && c.col.meanError !== undefined ? c.col.meanError : null));
    const worst = errs.reduce((m, e) => Math.max(m, e === null ? 0 : e), 0);
    const scale = tol || Math.max(1, worst);
    // One line per lane when the block is wide enough to hold word + number + bar side by side;
    // two when it is not. At 1024x768 this scoreboard is ~107 px across and at 2800 it is ~237 —
    // one layout cannot be legible at both, and shrinking the type is how "Test what it studied"
    // ended up painted at 7.5 px (finding 8).
    const wide = bw >= 150;
    const rowH = wide ? Math.max(15, Math.min(20, h * 0.12)) : Math.max(21, Math.min(28, h * 0.17));
    label(ctx, live.words.error, bx + 6, y + 6, bw * (tol ? 0.66 : 0.96), { size: 9, align: 'left', colour: P.inkSoft });
    if (tol) label(ctx, '±' + tol, bx + bw - 6, y + 6, bw * 0.3, { size: 9, align: 'right', colour: P.inkSoft });
    let ry = y + 13;
    cols.forEach((c, i) => {
      const e = errs[i];
      const shown = e === null ? '—' : String(e);
      const barH = 9;
      let barX, barW, barY;
      if (wide) {
        label(ctx, c.word, bx + 6, ry + rowH / 2, bw * 0.30, { size: 10, align: 'left', colour: c.ink });
        label(ctx, shown, bx + bw * 0.34, ry + rowH / 2, bw * 0.16, { size: 14, align: 'left', colour: c.ink, weight: '800' });
        barX = bx + bw * 0.52; barW = bw - 6 - (barX - bx); barY = ry + (rowH - barH) / 2;
      } else {
        label(ctx, c.word, bx + 6, ry + 6, bw * 0.56, { size: 9, align: 'left', colour: c.ink });
        label(ctx, shown, bx + bw - 6, ry + 6, bw * 0.40, { size: 13, align: 'right', colour: c.ink, weight: '800' });
        barX = bx + 6; barW = bw - 12; barY = ry + 13;
      }
      rr(ctx, barX, barY, barW, barH, 3); ctx.fillStyle = '#0c1119'; ctx.fill();
      if (e !== null) {
        const frac = Math.max(0, Math.min(1, e / scale));
        rr(ctx, barX, barY, Math.max(2, barW * frac), barH, 3); ctx.fillStyle = c.ink; ctx.fill();
        // The percentage is the bar's OWN reading — how much of the allowance this lane spends on
        // average. It is the number that SEPARATES: 45 % against 60 % where the tolerance-band
        // accuracy said 93 % against 90 % and read as the same answer.
        // Right-aligned inside the track, not centred: a centred label straddles the fill's own
        // edge, so half of "45%" sat on teal in chalk and washed out. The right end of the track
        // is dark until the bar is nearly full, which is exactly when the ink flips to oil.
        // Reads off `frac`, the SAME already-clamped 0..1 number the bar's own fill width used —
        // never a second, unclamped `e / scale` (fix round, .superpowers/sdd/2026-09-03-
        // investigation-lab-3-board/: a badly underfit lane's error can exceed `scale` outright —
        // e.g. degree 1 on the now-curved icecream table — and the old unclamped label painted
        // "286%" while the bar beside it sat visually maxed at 100%, disagreeing with itself).
        label(ctx, Math.round(100 * frac) + '%', barX + barW - 4, barY + barH / 2, barW - 8, { size: 8, align: 'right', colour: frac > 0.88 ? P.oil : P.chalk, weight: '800' });
      }
      ry += rowH;
    });
    return ry + 3;
  }
  function crateBox(ctx, x, y, w, h, face, opts) {
    const o = opts || {};
    rr(ctx, x, y, w, h, 3);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, o.sealed ? '#c9a262' : P.kraft); g.addColorStop(1, P.kraftDark);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    ctx.fillStyle = P.tape; ctx.fillRect(x + w * 0.42, y, w * 0.16, h);
    if (o.open) { ctx.fillStyle = P.kraftDark; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.5, y - h * 0.5); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill(); }
    if (o.stamp) { ctx.strokeStyle = P.ok; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.5, Math.min(w, h) * 0.22, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    if (o.sealed) { ctx.fillStyle = P.steelDark; rr(ctx, x + w * 0.42, y + h * 0.3, w * 0.16, h * 0.4, 1); ctx.fill(); }
    if (face) label(ctx, face, x + w / 2, y + h / 2, w - 4, { size: Math.max(8, Math.min(11, h * 0.5)), colour: P.ink });
  }
  /**
   * Does this crate carry a photo that resolves RIGHT NOW? Pure — `item` and the bridge's
   * `thumbOf` reader (carried on `live`) go in, a drawable frame (or null) comes out. No `data`,
   * no `image` handle, or a handle the run no longer remembers (run ended, frame evicted —
   * `Cam.shots` is reset every run start) all answer null, so `crate()` falls back to the kraft
   * box instead of a crash or a blank hole (spec 2026-08-19 §4.5 — this repo's "degrade quietly"
   * I/O-failure law).
   */
  function cratePhoto(item, live) {
    if (!item || !item.data || item.data.image === undefined || !live || !live.thumbOf) return null;
    return live.thumbOf(item.data.image) || null;
  }
  // ---- THE CRATE FACE CACHE (task 092) ----
  // WHY: a photo crate used to `drawImage` its FULL source picture (a 224 px camera frame, or a
  // library photograph) scaled down to 46x32 on every frame it rode the belt. In the recycling
  // investigation 85% of a run's samples sat inside drawImage (measured 2026-09-13, software
  // raster). The face a crate shows never changes for a given photo handle, so it is rendered once
  // at device pixels and blitted at the same size from then on. Bounded: the oldest face goes when
  // the map is full, and a source that cannot be drawn yet (an image still decoding) is drawn live
  // this once and cached the next time it can be.
  const FACE_MAX = 256;
  const faces = new Map();
  function crateFace(src, handle, w, h, ctx) {
    if (typeof document === 'undefined' || handle === undefined || handle === null) return src;
    const dpr = (ctx.getTransform ? ctx.getTransform().a : 0) || 1;
    const key = String(handle) + '@' + w + 'x' + h + '@' + dpr;
    const hit = faces.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { g.drawImage(src, 0, 0, w, h); } catch (e) { return src; }
    faces.set(key, c);
    if (faces.size > FACE_MAX) faces.delete(faces.keys().next().value);
    return c;
  }
  /**
   * A crate in flight (on a belt / entering a gate). `live` is the floor bridge (floorBridge() in
   * game.js) — its `thumbOf` reader turns a camera crate's handle into the frame the child just
   * photographed (spec 2026-08-19 §4.5, "the cheapest big win": the thing on the belt is a THING,
   * not a word). `live` is optional so a caller with no bridge (tests, the icon shelf) still gets
   * today's kraft box — additive only.
   */
  function crate(ctx, x, y, item, t, live) {
    // 30x20 was too small to read the photograph a child had just taken, which is the whole point
    // of a crate carrying one (owner, 2026-08-20). Everything below measures off w/h, so the
    // guess sticker and the photo clip scale with it instead of being pinned to the old numbers.
    const w = 46, h = 32;
    const isData = item.data && item.data.dataset !== undefined;
    shadow(ctx, x - w / 2, y - h, w, h);
    const bx = x - w / 2, by = y - h - 4;
    const th = cratePhoto(item, live);
    if (th) {
      // A crate carrying a PICTURE shows it — the child watches their own photograph ride the
      // belt. Clipped to the crate's own rounded rect so it never spills past the box.
      ctx.save(); rr(ctx, bx, by, w, h, 3); ctx.clip(); ctx.drawImage(crateFace(th, item.data.image, w, h, ctx), bx, by, w, h); ctx.restore();
    } else {
      crateBox(ctx, bx, by, w, h, isData ? '#' + (item.data.i + 1) : String(item.label || '').slice(0, 5), isData ? { sealed: !item.data.studied, stamp: !!item.data.studied } : {});
    }
    // NO guess sticker on a PHOTOGRAPHED crate (owner, 2026-08-27: "it is exactly pre-labelled").
    // The eye fires the instant a crate lands on a one-piece belt, so a sticker here rides the
    // WHOLE belt and reads as "the photos come in already tagged" — the very look the 2026-08-20
    // no-tag ruling exists to prevent. The guess keeps its two honest homes: the Sign wired to
    // the eye, and the bin's Evidence log. Crates WITHOUT a photo keep the sticker — a data row's
    // guess riding to the Checker (guess vs sealed truth) is the data-lab lesson itself.
    const photographed = item.data && item.data.image !== undefined;
    if (item.lastReading && item.lastReading.label && !photographed) {
      // The guess STICKER the reader put on it — stays ON TOP of the kraft box.
      const sh = Math.max(10, h * 0.34), sy = by - sh - 3;
      rr(ctx, x - w / 2 + 2, sy, w - 4, sh, 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = P.brass; ctx.stroke();
      label(ctx, item.lastReading.label, x, sy + sh / 2, w - 6, { size: Math.max(8, sh * 0.62), colour: P.brassDark });
    }
  }

  // ---------------- readers ----------------
  function reader(ctx, o, live, t) {
    const { x, y, w, h } = o;
    // Gantry arch: a beam ABOVE the picture, two legs to the belt line, a lit panel under the beam.
    // The frame is no longer drawn at fractions of its own — readerFace owns beam/legs/panel too,
    // because the old decorative 0.28/0.40 constants were exactly what the picture kept spilling
    // over (owner, 2026-08-20: "still overflow"): the content band knew nothing about the steel.
    const FloorLayout = (typeof window !== 'undefined') ? window.WorkshopFloorLayout : null;
    const face = FloorLayout ? FloorLayout.readerFace(w, h) : null;
    if (!face) return; // script-order guard: floor-layout.js not loaded yet — nothing legible to draw
    ctx.fillStyle = P.steelDark;
    ctx.fillRect(x + 6, y + face.legs.y, 6, face.legs.h);
    ctx.fillRect(x + w - 12, y + face.legs.y, 6, face.legs.h);
    steelBox(ctx, x + face.beam.x, y + face.beam.y, face.beam.w, face.beam.h, 4);
    // Scanner light band (breathes, period 3.2 s), filling the panel the beam hangs over.
    const k = 0.5 + 0.5 * Math.sin(t / 510);
    ctx.fillStyle = 'rgba(126,240,194,' + (live.running ? 0.15 + 0.2 * k : 0.12) + ')';
    ctx.fillRect(x + face.panel.x, y + face.panel.y, face.panel.w, face.panel.h);

    // THE FACE'S BANDS (spec §5.2). The READING WORD BAND IS GONE — the Display block exists to
    // say what a model read, and an arch repeating it spent 14% of its height doing a wired
    // block's job (owner, 2026-08-20: "it is doing sign block jobs"). That height is the
    // picture's now. readerFace(w, h) is the ONE place every box is computed; a node test asserts
    // the drawn CIRCLE fits the panel, not merely the arch — which is the check that was missing.

    // NAME band text, measured BEFORE the orbit draws (clip-browser 2026-09-02: "Pose reader ·
    // k-Nearest Neighbours" / "Data reader · k-Nearest Neighbours" do not fit readerFace()'s
    // one-line name band at tablet scale, even after plate()'s own shrink — past its 7px floor it
    // has to cut the words off). `wouldEllipsize` replays plate()'s OWN size formula (`h - 6`
    // clamped to 10..13) AND its shrink math to ask the exact question plate() is about to answer —
    // NOT merely "does the natural size fit" (a name that only needs plate()'s ordinary shrink, no
    // ellipsis — "Cups reader · Linear Regression" at 1280 wide — must stay on the one-line path
    // unchanged, or the wrap it does not need can overlap a neighbour; overlap-browser caught this
    // once already). Every SHORT name (the common case — every gallery clip-browser does not flag)
    // draws exactly as before, at full size or shrunk, in the one-line plate — orbit is untouched.
    // Only a name long enough to truly need wrapping borrows a little of the orbit's height below,
    // and only as much as the wrap needs, so "the algorithm is the lesson, so it gets the room"
    // (owner, 2026-08-20) stays true whenever a name allows it.
    const nameText = [o.name || live.senseName || '', live.brain || ''].filter(Boolean).join(' · ');
    const plateSize = Math.max(10, Math.min(13, face.name.h - 6));
    const nameFitsOneLine = !wouldEllipsize(ctx, nameText, face.name.w - 8, plateSize);
    // WRAP_SIZE=10: matches plateSize's own 10..13 floor (so a wrap never looks smaller than a
    // shrunk one-line plate would), and measured (headless canvas, both known offenders — "Pose
    // reader · k-Nearest Neighbours" at 126px, "Data reader · k-Nearest Neighbours" at 132px) to
    // wrap clean at two lines with width to spare, well short of needing its own ellipsis.
    const WRAP_SIZE = 10;
    const namePh = 2 * (WRAP_SIZE + 2) + 8;
    const orbitExtra = nameFitsOneLine ? 0 : Math.max(0, namePh - face.name.h);
    const orbit = orbitExtra
      ? { x: face.orbit.x, y: face.orbit.y, w: face.orbit.w, h: Math.max(10, face.orbit.h - orbitExtra) }
      : face.orbit;

    // ORBIT band: the model wears its own algorithm, always live, nothing to tap (a tap-to-open
    // panel was rejected — "almost the same as now except tapping the model" — because anything
    // optional gets skipped, and skipped is exactly the problem). ~65% of the arch's height —
    // the algorithm is the lesson, so it gets the room (less `orbitExtra` above, on the rare wrap).
    const ViewArt = (typeof window !== 'undefined') ? window.WorkshopBrainViewArt : null;
    const plan = live.viewPlan ? live.viewPlan(o.id) : null;
    if (plan && ViewArt && ViewArt.draw) {
      ViewArt.draw(ctx, plan, { x: x + orbit.x, y: y + orbit.y, w: orbit.w, h: orbit.h }, { budget: 'face' });
    } else if (live.evidence && live.evidence.length) {
      // No plan: a brain with no view() (two of six brains, after task 5 — grouper, neural —
      // optional by contract, spec §6.1), or nothing read yet. The old evidence chips, redrawn
      // inside the orbit band's own space — still the honest fallback, just living where the
      // picture would have.
      const ob = orbit, cw = ob.w / 3;
      live.evidence.slice(0, 3).forEach((e, i) => {
        rr(ctx, x + ob.x + i * cw + 2, y + ob.y + ob.h * 0.5 - 6, cw - 4, 12, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
        label(ctx, e, x + ob.x + i * cw + cw / 2, y + ob.y + ob.h * 0.5, cw - 6, { size: 8 });
      });
    }

    // NAME band: ONE merged line — object name + mounted brain ("Sorter · Memory brain") — no
    // more separate plate + tag fighting for the same 15px. namePlate() WRAPS instead of shrinking
    // (finding 8, 2026-09-02) — used here only when the one line genuinely does not fit.
    if (nameFitsOneLine) {
      plate(ctx, nameText, x + face.name.x + face.name.w / 2, y + face.name.y, face.name.w, face.name.h);
    } else {
      // The plate's BOTTOM is the NAME BAND's bottom — which readerFace pins to the block's own
      // bottom edge (`name.y = h - nameH`). It then grows UPWARD by its two-line height into the
      // space `orbitExtra` just took off the orbit above it; that borrowing is the whole reason
      // orbitExtra exists.
      //
      // IT USED TO ADD orbitExtra HERE (vision-breaker F5, 2026-09-05, measured): that pushed the
      // whole pill DOWN by the very amount the orbit had made room for above, so at 1280x800 the
      // gallery's "Picture reader · k-Nearest Neighbours" hung 12 px of pill past the block onto
      // bare floor and painted "Neighbours" 2 px BELOW the block's bottom edge, across its own
      // teal socket dots. The wrap was right; only its anchor was.
      namePlate(ctx, nameText, x + face.name.x + face.name.w / 2, y + face.name.y + face.name.h, face.name.w, WRAP_SIZE);
    }
  }
  // (The old `roomeye` draw — a wall camera watching the room — left with room mode, owner
  // 2026-08-27: an off-track sense now draws as the SAME reader arch it will be once mounted,
  // so the picture never promises a room-reading the app no longer does.)
  /**
   * The `camera` BLOCK (spec 2026-08-19 §4 — decomposed from the old room-watching sense): a
   * boxy body on a wall bracket, with a lens. This block only CAPTURES; it never reads or
   * decides — the viewfinder below shows what it sees, never what anything thinks about it
   * (owner ruling, man.camera.what: "A camera that only LOOKS").
   */
  /**
   * The drawable frame behind a live feed, or null. A webcam is a <video> (ready only at
   * readyState >= 2); the demo reel is a <canvas>, which has no readyState at all — an earlier
   * guard tested only the former, so a reel would have silently drawn nothing.
   */
  function feedFrame(src) {
    if (!src) return null;
    if (typeof src.readyState === 'number') return src.readyState >= 2 ? src : null;
    return (src.width > 0 && src.height > 0) ? src : null;
  }

  function camera(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const cx = x + w / 2;
    // The bracket: three thin struts gathering to the body's underside, reading as a wall mount
    // (this block hangs in the wall band, not the floor) rather than a free-standing tripod leg.
    const neckY = y + h * 0.80;
    ctx.strokeStyle = P.steelDark; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const lx of [x + w * 0.18, cx, x + w * 0.82]) {
      ctx.beginPath(); ctx.moveTo(cx, y + h * 0.94); ctx.lineTo(lx, neckY); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.lineCap = 'butt';
    // The boxy body.
    const bw = w * 0.94, bh = h * 0.76, bx = x + (w - bw) / 2, by = y + h * 0.03;
    steelBox(ctx, bx, by, bw, bh, 6);
    // A viewfinder bump on top — reads as a camera silhouette even at shelf-icon size.
    steelBox(ctx, bx + bw * 0.6, by - h * 0.07, bw * 0.24, h * 0.09, 3);
    // A LIVE VIEWFINDER on the body: the camera shows what it is looking at (owner, 2026-08-20).
    // One source for both modes — bridge.camVideo hands back the webcam element, or the demo
    // reel's canvas under ?demo=1.
    const feed = feedFrame(live && live.video);
    // THE SCREEN TAKES ITS SHAPE FROM THE CAMERA ITSELF (owner, 2026-08-20: "can't you get the
    // ratio to the camera as well?"). A fixed 16:9 box is wrong for the device most children sit
    // in front of — a 4:3 webcam either gets letterboxed or, with the cover-scaling below, has
    // its top and bottom cropped away, which is exactly the part a child holding something up is
    // in. So the viewfinder is the largest rect OF THE SOURCE'S OWN RATIO that fits beside the
    // lens. 16:9 is only the fallback, for the moment before the first frame arrives.
    const srcW = feed ? (feed.videoWidth || feed.width || 0) : 0;
    const srcH = feed ? (feed.videoHeight || feed.height || 0) : 0;
    const ratio = (srcW > 0 && srcH > 0) ? srcW / srcH : 16 / 9;
    const availW = bw * 0.74, availH = bh * 0.88;
    const vh = Math.min(availH, availW / ratio);
    const vw = vh * ratio;
    const vx = bx + bw - vw - bw * 0.04;      // right-aligned; the lens sits to its left
    const vy = by + (bh - vh) / 2;
    ctx.save(); rr(ctx, vx, vy, vw, vh, 3); ctx.clip();
    if (feed) {
      // The box already matches the source's ratio, so cover and contain agree and nothing is
      // cropped. Math.max still guards the fallback case (no frame metrics yet).
      const sc = Math.max(vw / (srcW || 4), vh / (srcH || 3));
      // Mirrored, like every viewfinder a child has met — translate to the right edge, scale -x.
      ctx.translate(vx + vw, vy); ctx.scale(-sc, sc); ctx.drawImage(feed, 0, 0);
    } else {
      ctx.fillStyle = P.screen; ctx.fillRect(vx, vy, vw, vh);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(126,240,194,0.45)'; ctx.lineWidth = 1;
    rr(ctx, vx, vy, vw, vh, 3); ctx.stroke();

    // The lens: a barrel ring around a dark glass.
    const lx = bx + (vx - bx) / 2, ly = by + bh * 0.50, lr = Math.min(bh * 0.30, (vx - bx) * 0.38);
    ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fillStyle = P.steelDark; ctx.fill();
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1.4; ctx.stroke(); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(lx, ly, lr * 0.64, 0, Math.PI * 2); ctx.fillStyle = P.screen; ctx.fill();
    ctx.strokeStyle = 'rgba(126,240,194,0.35)'; ctx.stroke();
    // A glint that breathes gently (same period as the reader's scanner band, t/510) so an idle
    // camera on the wall never reads as a dead prop.
    const k = 0.5 + 0.5 * Math.sin(t / 510);
    ctx.beginPath(); ctx.arc(lx - lr * 0.22, ly - lr * 0.22, lr * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226,238,252,' + (0.45 + 0.3 * k) + ')'; ctx.fill();
    // A status LED beside the lens: dark idle, signal-teal while the machine runs — the only
    // hint of life this block ever shows, since it has no reading of its own to display.
    ctx.beginPath(); ctx.arc(bx + bw * 0.86, by + bh * 0.22, Math.max(2, bh * 0.07), 0, Math.PI * 2);
    ctx.fillStyle = live.running ? P.signal : P.steelDark; ctx.fill();
    if (o.name) plate(ctx, o.name, cx, y + h * 0.72, w - 6, 15);
  }
  /**
   * THE MICROPHONE (Composing Arc Plan A, task 3) — the Camera's own sibling, drawn the same
   * industrial way: a capsule-and-grille mic on a stand at the left, an LED that lights only
   * while it is actually listening, and the HONEST-STATE CASCADE filling the rest of the card —
   * the Board's own "never a blank box" law (floor-art.js's boardBox), reduced to one sentence
   * instead of a chart. Priority order (task-3-brief, exact, WIDENED by final-review finding 6):
   * listening (live) → blocked (the DEVICE's own live consent answer, R6 — every Microphone on
   * the table shows this the instant ANY one of them gets declined, not only the one that asked)
   * → the heard word itself → NO DEVICE AT ALL (breaker fix round, charter 5, RULED IN — a
   * browser with zero speech recognition gets this ONE honest sentence whether it has already
   * taken a doomed listen or never listened at all — checked BEFORE either heard branch below, so
   * it always wins over "nothing heard yet" once the device itself is the reason) → heard-nothing
   * (a completed listen that simply came back empty, R4) → never listened at all.
   */
  function microphoneBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const words = live.words || {};
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y, w, h, 6);
    // The shelf icon: the capsule alone, centred — the cascade sentence has no run to read at
    // shelf scale (the splitter icon's own reasoning, applied here instead of a chart).
    if (live.compact) {
      const cw = w * 0.34, ch = h * 0.62, ix = x + w / 2, iy = y + h * 0.16;
      rr(ctx, ix - cw / 2, iy, cw, ch, cw / 2); ctx.fillStyle = P.steel; ctx.fill();
      ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(203,214,226,0.4)';
      for (let i = 1; i < 4; i++) { const gy = iy + (ch * i) / 4; ctx.beginPath(); ctx.moveTo(ix - cw / 2 + 2, gy); ctx.lineTo(ix + cw / 2 - 2, gy); ctx.stroke(); }
      ctx.strokeStyle = P.steelDark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ix, iy + ch); ctx.lineTo(ix, iy + ch + h * 0.10); ctx.stroke();
      ctx.lineWidth = 1;
      return;
    }
    // The capsule: a rounded pill on a short stand, grille lines across it.
    const capW = w * 0.15, capH = h * 0.44, capX = x + w * 0.15, capY = y + h * 0.10;
    rr(ctx, capX - capW / 2, capY, capW, capH, capW / 2);
    ctx.fillStyle = P.steel; ctx.fill();
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(203,214,226,0.4)';
    for (let i = 1; i < 4; i++) {
      const gy = capY + (capH * i) / 4;
      ctx.beginPath(); ctx.moveTo(capX - capW / 2 + 2, gy); ctx.lineTo(capX + capW / 2 - 2, gy); ctx.stroke();
    }
    ctx.strokeStyle = P.steelDark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(capX, capY + capH); ctx.lineTo(capX, capY + capH + h * 0.09); ctx.stroke();
    ctx.lineWidth = 1;
    // The LED: dark idle, signal-teal (with a breathing glow) only while genuinely listening —
    // the same "one hint of life" idiom the camera's own status LED above already keeps.
    const ledY = capY + capH + h * 0.16;
    const lit = !!live.listening;
    ctx.beginPath(); ctx.arc(capX, ledY, Math.max(2, h * 0.045), 0, Math.PI * 2);
    ctx.fillStyle = lit ? P.signal : P.steelDark; ctx.fill();
    if (lit) {
      const k = 0.5 + 0.5 * Math.sin(t / 220);
      ctx.save(); ctx.shadowColor = P.signal; ctx.shadowBlur = 6 + k * 6;
      ctx.beginPath(); ctx.arc(capX, ledY, Math.max(2, h * 0.045), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // THE CASCADE. Right of the capsule, above the name plate.
    const textX = x + w * 0.32, textW = x + w - 10 - textX;
    const midY = y + h * 0.44;
    if (live.privateBlocked) {
      // task P3b (plan §3) — FIRST in the cascade, above `listening` itself: while private
      // examples are in this session performListen refuses before it ever sets `listening` or
      // reads consent, so nothing below this line can be true, and a face that said anything
      // else would be describing a listen the workshop will not perform.
      wrapLabel(ctx, words.micPrivate || '', textX + textW / 2, y + h * 0.22, textW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
    } else if (live.listening) {
      wrapLabel(ctx, words.micListening || '', textX + textW / 2, y + h * 0.28, textW, { size: 12, lines: 3, lineHeight: 15, colour: P.screenText, weight: '800' });
    } else if (live.consent === 'no') {
      wrapLabel(ctx, words.micBlocked || '', textX + textW / 2, y + h * 0.22, textW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
    } else if (typeof live.heard === 'string') {
      // R4: the RAW transcript, no opinion added — the biggest, brightest text on this card, the
      // same treatment the Sign gives a live value.
      wrapLabel(ctx, live.heard, textX + textW / 2, midY, textW, { size: 15, lines: 2, lineHeight: 18, colour: P.screenText, weight: '800' });
    } else if (live.canListen === false) {
      // Breaker fix round, charter 5 (RULED IN), WIDENED by the final review's finding 6: a
      // device with ZERO speech recognition tells the SAME honest sentence whether it has already
      // taken one doomed listen (heard===null) OR never listened at all — the ORIGINAL fix only
      // consulted canListen inside the heard===null branch, so a never-listened deviceless mic
      // still invited "Poke me, or wire a Button to listen", a promise the device can never keep.
      // This branch now sits BEFORE both heard checks below, so it wins over either shape of
      // "nothing heard yet" the instant the device itself is the reason.
      wrapLabel(ctx, words.micNoDevice || '', textX + textW / 2, y + h * 0.26, textW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
    } else if (live.heard === null) {
      wrapLabel(ctx, words.micHeardNothing || '', textX + textW / 2, y + h * 0.26, textW, { size: 10, lines: 3, lineHeight: 12, colour: P.inkSoft, weight: '700' });
    } else {
      wrapLabel(ctx, words.micNeverListened || '', textX + textW / 2, y + h * 0.22, textW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
    }
    if (o.name) plate(ctx, o.name, x + w / 2, y + h - 16, w - 12, 14);
  }
  function stamper(ctx, o, live, t) {
    const { x, y, w, h } = o;
    ctx.fillStyle = P.steelDark; ctx.fillRect(x + w / 2 - 3, y + h * 0.3, 6, h * 0.7);
    steelBox(ctx, x, y, w, h * 0.3, 4);
    ctx.fillStyle = P.brass; rr(ctx, x + w * 0.25, y + h * 0.7, w * 0.5, h * 0.18, 3); ctx.fill();
    plate(ctx, live.shelf || o.name || '', x + w / 2, y + h * 0.36, w, 14, P.readout, P.screenText);
  }

  /**
   * THE CAR BEING BUILT (car-galleries task 11) — a side-view silhouette, drawn from paths only
   * (zero emoji), so a P5 child reads a CAR at a glance even at shelf-icon size. A small target
   * badge riding above it carries the one number the car must reach; everything scales off `w`/`h`
   * so the shelf icon and a placed block are the same picture.
   */
  function carmakerCar(ctx, x, y, w, h, live) {
    const by = y + h * 0.44, bh = h * 0.40;
    // Cabin first, behind the body, so the body's rounded shoulder overlaps it cleanly.
    ctx.beginPath();
    ctx.moveTo(x + w * 0.26, by);
    ctx.lineTo(x + w * 0.40, y + h * 0.14);
    ctx.lineTo(x + w * 0.66, y + h * 0.14);
    ctx.lineTo(x + w * 0.80, by);
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, y, 0, by);
    cg.addColorStop(0, P.steelLight); cg.addColorStop(1, P.steel);
    ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(95,227,220,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.30, by - 1);
    ctx.lineTo(x + w * 0.42, y + h * 0.18);
    ctx.lineTo(x + w * 0.52, y + h * 0.18);
    ctx.lineTo(x + w * 0.52, by - 1);
    ctx.closePath(); ctx.fill();
    rr(ctx, x + w * 0.06, by, w * 0.88, bh, Math.max(3, bh * 0.42));
    const g = ctx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, P.steelLight); g.addColorStop(1, P.steelDark);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    // Two honest dots, so the car reads as facing right.
    ctx.beginPath(); ctx.arc(x + w * 0.90, by + bh * 0.42, Math.max(1.5, h * 0.05), 0, Math.PI * 2); ctx.fillStyle = P.lamp; ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.10, by + bh * 0.42, Math.max(1.2, h * 0.04), 0, Math.PI * 2); ctx.fillStyle = P.bad; ctx.fill();
    const wr = Math.max(3, h * 0.16), wy = by + bh;
    for (const wx of [x + w * 0.27, x + w * 0.73]) {
      ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fillStyle = P.oil; ctx.fill();
      ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(wx, wy, wr * 0.42, 0, Math.PI * 2); ctx.fillStyle = P.steelLight; ctx.fill();
    }
    ctx.lineWidth = 1;
    // The TARGET badge: drawn only when the dial reports a real value, so an absent spec leaves no
    // ghost of a setting on the car.
    if (!live.compact && Number.isFinite(live.target)) {
      const tw = Math.max(30, w * 0.34), th = Math.max(12, h * 0.24);
      const tx = x + w - tw, ty = y + h * 0.02;
      rr(ctx, tx, ty, tw, th, 3); ctx.fillStyle = P.readout; ctx.fill();
      ctx.strokeStyle = 'rgba(95,227,220,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      const cx = tx + th * 0.5, cy = ty + th / 2, rr2 = th * 0.26;
      ctx.beginPath(); ctx.arc(cx, cy, rr2, 0, Math.PI * 2); ctx.strokeStyle = P.signal; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - rr2 * 1.5, cy); ctx.lineTo(cx + rr2 * 1.5, cy); ctx.moveTo(cx, cy - rr2 * 1.5); ctx.lineTo(cx, cy + rr2 * 1.5); ctx.stroke();
      ctx.lineWidth = 1;
      label(ctx, String(Math.round(live.target)), cx + th * 0.9, cy, tw - th * 1.5, { size: Math.max(9, th * 0.6), colour: P.screenText, weight: '800', align: 'left' });
    }
  }

  /**
   * ONE dial knob: a ring, a tick scale, a progress arc and the live VALUE printed in the middle —
   * so the number a tap turns is the most legible thing on the knob. The arc and its faint glow
   * breathe on a SLOW period (t/BREATH_MS ~ 7.4 s, the room's own lamp breath); reduced motion
   * passes t = 0, where sin(0) = 0 collapses the glow to its rest value — the correct calm frame,
   * and no second animation loop anywhere (one shared clock).
   */
  function carmakerKnob(ctx, cx, cy, r, d, t) {
    const min = Number(d.min), max = Number(d.max);
    const frac = max > min ? Math.max(0, Math.min(1, (Number(d.value) - min) / (max - min))) : 0;
    const a0 = -Math.PI * 0.75, sweep = Math.PI * 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = P.oil; ctx.fill();
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(185,203,219,0.55)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const a = a0 + sweep * (i / 4);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.80, cy + Math.sin(a) * r * 0.80);
      ctx.lineTo(cx + Math.cos(a) * r * 0.96, cy + Math.sin(a) * r * 0.96);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, a0, a0 + sweep * frac);
    const breath = 0.5 + 0.5 * Math.sin((t || 0) / BREATH_MS);
    ctx.strokeStyle = 'rgba(95,227,220,' + (0.55 + 0.25 * breath).toFixed(3) + ')';
    ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
    const big = Number.isFinite(Number(d.value)) ? String(Math.round(Number(d.value))) : '';
    label(ctx, big, cx, cy - r * 0.06, r * 1.7, { size: Math.max(10, r * 0.72), colour: P.ink, weight: '800' });
    // The label is the schema's own feature name, unit included ("Power (hp)"); at a small floor
    // scale label()'s TAIL ellipsis ate the parenthetical and left "Power …" (NIT 2). Split it and
    // draw the unit as its own short suffix — a 2–3 glyph unit always fits where the full
    // parenthetical does not, so the knob's face keeps its unit at every scale.
    const name = String(d.label || d.prop);
    const unitMatch = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
    const nameY = cy + r * 0.58, nameSize = Math.max(7, r * 0.30);
    if (!unitMatch) {
      label(ctx, name, cx, nameY, r * 2.3, { size: nameSize, colour: P.inkSoft, weight: '700' });
    } else {
      const base = unitMatch[1].trim(), unit = unitMatch[2].trim(), unitSize = Math.max(minPx(unit), nameSize * 0.9);
      const gap = Math.max(2, r * 0.10);
      ctx.save();
      ctx.font = '700 ' + nameSize + 'px' + FAMILY;
      const baseW = ctx.measureText(base).width;
      ctx.font = '700 ' + unitSize + 'px' + FAMILY;
      const unitW = ctx.measureText(unit).width;
      ctx.restore();
      label(ctx, base, cx - gap / 2, nameY, baseW + 2, { size: nameSize, colour: P.inkSoft, weight: '700', align: 'right', min: minPx(base) });
      label(ctx, unit, cx + gap / 2, nameY, unitW + 2, { size: unitSize, colour: P.inkSoft, weight: '700', align: 'left', min: minPx(unit) });
    }
  }

  /**
   * THE CAR MAKER (car-galleries task 11): the block a P5 child meets as "a thing that makes a car
   * with two dials". Its whole face is those three facts, top to bottom: the car it builds, the TWO
   * knobs that set it (power, weight), and its name. Geometry comes from Layout.carmakerFace — the
   * SAME function floor.js hit-tests a dial tap with, so the knob a child sees and the knob a
   * finger turns cannot disagree (the barHandles/readerFace precedent's own law).
   */
  function carmakerBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const L = layout();
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y, w, h, 6);
    const F = L && L.carmakerFace ? L.carmakerFace(w, h) : null;
    if (!F) {
      // Degrade, never dead-end (crash-proof-I/O law): without the geometry module the block still
      // draws as itself — its name on a plate — rather than throwing inside the RAF loop.
      if (o.name) plate(ctx, o.name, x + w / 2, y + h * 0.44, w - 12, 16);
      return;
    }
    const byProp = {};
    for (const d of live.dials || []) byProp[d.prop] = d;
    carmakerCar(ctx, x + F.car.x, y + F.car.y, F.car.w, F.car.h, live);
    for (const knob of F.dials) {
      const d = byProp[knob.prop];
      if (!d) continue;
      carmakerKnob(ctx, x + knob.cx, y + knob.cy, knob.r, d, t);
    }
    plate(ctx, o.name || live.label || '', x + F.name.x + F.name.w / 2, y + F.name.y, F.name.w, F.name.h);
  }

  /**
   * THE FILES BLOCK (task E): an in-tray machine — a child's own file, eaten and dealt. Modelled
   * on the Pen/bin receptacle idiom (a pile you can SEE): the open tray on top holds the eaten
   * file as a stack of paper sheets that visibly shrinks as rows deal down the wire; the body
   * below carries the feed slot it ate through and a readout counting the deal ("7 / 48").
   * Unfed, the tray is honestly empty and the readout shows nothing. Paper is chalk-pale on
   * purpose — the one un-machined thing here, the same way kraft crates read as cargo. All
   * offsets are index-derived (no Math.random — the pile must repaint identically every frame).
   */
  function filesBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    // Body: a squat steel cabinet. The tray stands on its top face.
    const by = y + h * 0.42, bh = h * 0.42;
    steelBox(ctx, x, by, w, bh, 6);
    // The SLOT MOUTH it ate the file through — a dark slit with the room's rim light.
    ctx.fillStyle = P.oil; rr(ctx, x + w * 0.12, by + bh * 0.16, w * 0.76, Math.max(4, bh * 0.14), 3); ctx.fill();
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1; rr(ctx, x + w * 0.12, by + bh * 0.16, w * 0.76, Math.max(4, bh * 0.14), 3); ctx.stroke();
    // Readout: the deal, counted out loud. Fed + running → "dealt / total"; fed → total; else blank.
    const total = Number.isFinite(live.rows) ? live.rows : null;
    const dealt = Number.isFinite(live.dealt) ? live.dealt : null;
    const word = total === null ? '' : (live.running && dealt !== null ? dealt + ' / ' + total : String(total));
    screen(ctx, x + w * 0.2, by + bh * 0.44, w * 0.6, bh * 0.42);
    label(ctx, word, x + w / 2, by + bh * 0.66, w * 0.56, { size: 12, colour: P.screenText, weight: '800' });
    // The IN-TRAY: back wall, base, low front lip — an open box the sheets stand proud of.
    const tx = x + w * 0.1, tw = w * 0.8, tBase = by + 2, tTop = y + h * 0.08;
    ctx.fillStyle = P.steelDark; ctx.fillRect(tx - 3, tTop, 3, tBase - tTop); ctx.fillRect(tx + tw, tTop, 3, tBase - tTop);
    // The PILE of eaten files: what remains to deal, one sheet per ~10 rows (cap 5). It shrinks
    // as the machine deals — the child watches the tray empty. Icons show a demo pile of 3.
    const remaining = total === null ? 0 : Math.max(0, total - (dealt || 0));
    const sheets = live.compact ? 3 : Math.min(5, Math.ceil(remaining / 10));
    const sh = Math.max(5, h * 0.075);
    for (let i = 0; i < sheets; i++) {
      const sy = tBase - (i + 1) * (sh * 0.82);
      const jog = ((i * 7) % 3 - 1) * w * 0.015; // deterministic, index-derived — never rng
      ctx.fillStyle = i % 2 ? '#dbe4ee' : P.chalk;
      rr(ctx, tx + w * 0.05 + jog, sy, tw - w * 0.1, sh, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      rr(ctx, tx + w * 0.05 + jog, sy, tw - w * 0.1, sh, 2); ctx.stroke();
      // Two faint rule lines: the sheet reads as a written page, never a blank slab.
      ctx.strokeStyle = 'rgba(43,127,140,0.55)';
      ctx.beginPath();
      ctx.moveTo(tx + w * 0.12 + jog, sy + sh * 0.38); ctx.lineTo(tx + tw - w * 0.16 + jog, sy + sh * 0.38);
      ctx.moveTo(tx + w * 0.12 + jog, sy + sh * 0.7); ctx.lineTo(tx + tw - w * 0.28 + jog, sy + sh * 0.7);
      ctx.stroke();
    }
    // Front lip AFTER the sheets, so the pile sits IN the tray, not on it.
    ctx.fillStyle = P.steel; rr(ctx, tx - 3, tBase - 4, tw + 6, 6, 2); ctx.fill();
    ctx.strokeStyle = P.steelLight; ctx.beginPath(); ctx.moveTo(tx - 3, tBase - 4); ctx.lineTo(tx + tw + 3, tBase - 4); ctx.stroke();
    // One sheet mid-swallow while the deal runs: slides from the tray lip into the slot (pure
    // translation on the decorative clock — reduced motion's t=0 holds it at rest, flash-safe).
    if (live.running && remaining > 0 && !live.compact) {
      const k = ((t || 0) % 900) / 900;
      const gy = tBase - 2 + (by + bh * 0.16 - tBase) * k;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fillStyle = P.chalk; rr(ctx, x + w * 0.24, gy, w * 0.52, Math.max(3, sh * 0.6), 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // A dataset's headline ("Ice-cream stand — how many cups?") is a SENTENCE, not a word — plate()
    // only ever shrinks-then-ellipsises, and past its 7px floor it has to cut the words off
    // (clip-browser 2026-09-02). namePlate() wraps to two lines instead of cutting; its box top is
    // pinned to the SAME y the old one-line plate used (the steel cabinet body ends at ~0.84h, so
    // 0.88h already cleared it) and grows DOWN from there into the empty wall-band floor below this
    // corner block — nothing else is placed there at any resolution (verified: screenshots at all
    // three failing sizes). No neighbour moves; this is pure paint, not a layout change.
    const nameTop = y + h * 0.88, nameSize = 11;
    namePlate(ctx, o.name || live.fileName || '', x + w / 2, nameTop + 2 * (nameSize + 2) + 8, w * 0.96, nameSize);
  }

  /**
   * THE SPLITTER: a sorting table whose whole state is one bar. The three shares are drawn at
   * their TRUE WIDTHS, so 60/20/20 is a PICTURE — the thing a Counter that happens to fire at 29
   * could never be (spec §14). Above the rail, one hopper mouth fans into three chutes, so the
   * block says what it does before a word is read: one stream arrives, three piles leave.
   *
   * Geometry comes from Layout.barHandles — the SAME function floor.js hit-tests the drag with,
   * so the bar a child sees and the bar a child grabs cannot disagree.
   *
   * Colour carries the meaning: Training is the room's own signal teal (the pile the machine
   * thinks with), Validation the amber a Sign warns in (the pile you keep checking yourself
   * against), Test the oil dark — the sealed pile reads as SHUT, because it is. A LEGEND row
   * over the rail names all three in those colours, and while a run is up each slice carries the
   * pile's live count plus a level gauge, so the block MOVES while the machine runs and a child
   * can see the exam piles sitting in there untouched. See the two long WHY notes below.
   */
  function splitterBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const words = live.words || {};
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y + h * 0.06, w, h * 0.88, 6);

    const L = layout();
    // DEGRADE, never dead-end: this runs inside floor.js's RAF loop, where a throw kills the
    // repaint chain for the life of the page (crash-proof-I/O law). Without the geometry module
    // the block still draws as itself, minus the rail; the reason is said ONCE, not 60x a second.
    if (!L || !L.barHandles) {
      if (!splitterBox.warned) { splitterBox.warned = true; if (typeof console !== 'undefined') console.error('floor-art: the Splitter cannot draw its bar — window.WorkshopFloorLayout is missing (load logic/floor-layout.js before floor-art.js)'); }
      if (o.name) plate(ctx, o.name, x + w / 2, y + h * 0.09, w * 0.8, 14);
      return;
    }

    // The shares it is CARRYING, capped exactly as the bar is DRAWN and as the engine apportions
    // (logic/engine.js splitter:in): Validation can never claim what Training already took. The
    // three numbers printed below are these capped ones, rounded — the picture, the number on the
    // picture and the machine's own behaviour have to be one answer (review finding 5), and a
    // dial driven by a wire can arrive as 33.333333.
    let tr = Math.max(0, Math.min(100, Number.isFinite(live.training) ? live.training : 60));
    let va = Math.max(0, Math.min(100 - tr, Number.isFinite(live.validation) ? live.validation : 20));
    // ONCE THE TABLE IS DEALT the bar stops being a setting and becomes a REPORT (vision-breaker
    // 2026-09-02, finding 9). Rows are apportioned on ARRIVAL, so from the moment the source is
    // spent nothing a drag does can move a single row this run — and the block went on drawing
    // the dials over piles that no longer matched them. Dragged to 30/50 after the feed
    // finished, its face printed "30% 50% 2…" above the counts 29/10/9 (= 60/21/19 %): the
    // picture, the printed number and the pile it would deal, three different answers at once,
    // on the one block whose whole claim is that the proportion IS a picture rather than a sum.
    // From here the widths and the printed shares are BOTH the real division, and floor.js
    // refuses the grab with a line saying the table is already cut (splitter.dealt).
    // ONE definition of "the shares a dealt table holds" (review M9): L.dealtShares, the same
    // call floor.js's barShares grabs from — the paint and the hit test cannot drift apart.
    const g = live.spent && L.dealtShares ? L.dealtShares(live.dealtBy) : null;
    if (g) { tr = g.training; va = g.validation; }
    const te = Math.max(0, 100 - tr - va);
    const bar = L.barHandles(o, { training: tr, validation: va });

    // The three parts, at their true widths, along the RAIL — which is inset from the block's rim
    // so a handle's grab band never swallows the sockets that live on that rim (finding 2).
    // `ink` is per part and NOT decoration: chalk on the pale teal and amber slices would be about
    // 1.3:1 and unreadable, so the light slices take the oil and only the dark sealed pile takes
    // chalk (ui-ux-common's contrast floor).
    const parts = [
      { key: 'training', x0: bar.x, x1: bar.x0, fill: P.signal, ink: P.oil, pct: Math.round(tr), name: words.splitTraining },
      { key: 'validation', x0: bar.x0, x1: bar.x1, fill: P.warn, ink: P.oil, pct: Math.round(va), name: words.splitValidation },
      { key: 'test', x0: bar.x1, x1: bar.x + bar.w, fill: P.oil, ink: P.chalk, pct: Math.round(te), name: words.splitTest },
    ];

    // WHAT EACH PILE IS HOLDING (floor.js liveFor's splitter branch). Present only while a run is
    // up: with no rig there is nothing held and nothing dealt, and drawing a "0" for a machine
    // that has not started would be a number about nothing. `held` is the deck sitting in the
    // block and `dealtBy` what that pile was ever given — the same number under Plan 2's
    // permanent decks; the pair is kept as the "a run is up" signal, `dealtBy` is what the counts
    // print, and the DRAIN comes from `live.passing` instead (see the gauge below).
    const held = live.held || null, given = live.dealtBy || null;
    const counting = !live.compact && !!held && !!given;

    // THE HOPPER MOUTH and its three chutes, drawn BEFORE the rail so the rail sits on top of the
    // chutes that pour into it. Each chute is tinted with the pile it feeds — the picture and the
    // bar teach the same three colours.
    // The stack above the rail, top to bottom: name plate (0.09h) · hopper mouth · chutes ·
    // LEGEND ROW (just over the rail). Every band is proportional so the shelf icon and a
    // splitter squeezed to FIT_MIN keep the same picture instead of stacking on top of itself.
    //
    // The mouth sits a little higher than it used to (0.255h, was 0.30h) and the chutes stop a
    // little sooner, because the band under them stopped being three per-slice words and became
    // one legend row that needs its own line — and at the shelf icon's scale the mouth was
    // landing 0.8 px above the cap of the one word that still drew (finding 7).
    const legendSize = Math.max(8, Math.min(13, h * 0.10));
    const legendY = bar.y - Math.max(9, h * 0.10);
    const mw = w * 0.2, mh = Math.max(4, h * 0.07), my = y + h * 0.255;
    const chuteEnd = legendY - Math.max(7, h * 0.075);
    for (const part of parts) {
      const pw = part.x1 - part.x0;
      if (pw <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = part.fill; ctx.lineWidth = 2; ctx.lineCap = 'round';
      // Stops short of the rail: the gap is where the LEGEND sits, so a chute never strikes
      // through the word it is pouring into (proportional, so the shelf icon keeps the gap too).
      ctx.beginPath(); ctx.moveTo(x + w / 2, my + mh); ctx.lineTo(part.x0 + pw / 2, chuteEnd); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = P.oil; rr(ctx, x + w / 2 - mw / 2, my, mw, mh, 3); ctx.fill();
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1;
    rr(ctx, x + w / 2 - mw / 2, my, mw, mh, 3); ctx.stroke();

    // THE LEGEND — a swatch and a word per pile, in one row, DECOUPLED from how wide that pile's
    // slice happens to be.
    //
    // WHY it is no longer drawn over each slice (vision-breaker 2026-09-01, finding 1): the old
    // rule dropped a name whose OWN slice could not hold it, and "Validation" — the longest word,
    // over the smallest pile — needed to be ≥37 % at 1024×768 and ≥21 % at 2800 wide before it
    // appeared. The shipped default is 20 %, so the one pile this lesson is ABOUT was nameless at
    // every viewport, and only ever surfaced when the split was wrong. No amount of tuning fixes
    // that: the design just never had room for the longest word over the smallest slice. A row
    // whose columns are sized by their own WORDS always fits all three, so the widths stay the
    // picture and the names stay constant.
    //
    // The columns are packed to their text (not equal thirds — equal thirds gave "Validation"
    // 30 px and ellipsised it) and the whole group is centred, with one uniform shrink if the
    // block is narrow: the same one-division fit `label` uses, so the three names always scale
    // together and no single name is ever cut while its neighbours sit at full size.
    // The shelf icon skips it entirely (finding 7) — three coloured bars there, and the shelf's
    // own caption carries the block's name.
    if (!live.compact) {
      const sw = Math.max(5, Math.min(9, legendSize * 0.72)), swGap = 3;
      const colGap = Math.max(4, legendSize * 0.5);
      const avail = w - 8;
      ctx.save();
      ctx.font = '700 ' + legendSize + 'px' + FAMILY;
      const names = parts.map((part) => String(part.name || ''));
      const textW = names.map((s) => ctx.measureText(s).width);
      const chrome = parts.length * (sw + swGap) + (parts.length - 1) * colGap;
      const textTotal = textW.reduce((a, b) => a + b, 0);
      const size = textTotal > 0 && chrome + textTotal > avail
        ? Math.max(7, legendSize * Math.max(0.1, (avail - chrome) / textTotal))
        : legendSize;
      const k = size / legendSize;
      const cols = textW.map((tw) => tw * k);
      const total = chrome + cols.reduce((a, b) => a + b, 0);
      let cx = x + (w - total) / 2;
      parts.forEach((part, i) => {
        ctx.fillStyle = part.fill;
        rr(ctx, cx, legendY - sw / 2, sw, sw, 2); ctx.fill();
        // A LIGHT hairline, not a black one: Test's swatch IS the oil dark, and a dark stroke on a
        // dark chip on dark steel leaves the sealed pile's swatch invisible — the one swatch that
        // most needs an edge to exist at all.
        ctx.strokeStyle = 'rgba(242,246,250,0.45)'; ctx.lineWidth = 1;
        rr(ctx, cx, legendY - sw / 2, sw, sw, 2); ctx.stroke();
        label(ctx, names[i], cx + sw + swGap + cols[i] / 2, legendY, cols[i] + 1, { size: size, colour: P.ink, min: 7 });
        cx += sw + swGap + cols[i] + colGap;
      });
      ctx.restore();
    }

    // The rail itself.
    // `gh` is the LEVEL GAUGE riding the rail's top edge (below); the share and the count are
    // flowed under it so nothing is ever painted over it. It is a fifth of the rail, not a
    // sixteenth as first shipped: the gauge is the ONLY moving strip on the block — the counts
    // only ever climb (see the count's WHY below) — so it has to carry the act on its own.
    const gh = counting ? Math.max(4, bar.h * 0.20) : 0;
    const textTop = bar.y + gh, textH = bar.h - gh;
    for (const part of parts) {
      const pw = Math.max(0, part.x1 - part.x0);
      if (pw <= 0) continue;
      ctx.fillStyle = part.fill;
      ctx.fillRect(part.x0, bar.y, pw, bar.h);
      // THE PILE LEVEL, drawn as a strip ON the rail's top edge and NOT as a dimmed slice body,
      // deliberately — dimming the slice would drag the share label's contrast under the a11y
      // floor, and the slice's WIDTH has to stay the proportion picture. Chalk on oil, so it
      // reads the same over teal, amber and the dark sealed pile alike. A pile that has been
      // given nothing draws no gauge at all rather than a full one, because "full" would be a lie
      // about an empty block.
      if (counting && given[part.key] > 0) {
        // The gauge is the ACT (Plan 2): while a pass deals this pile it drains from full to
        // empty, and the moment the act completes it snaps back — the deck never left the block;
        // what rode the belt were copies. A pile nothing is dealing sits full, which is now
        // simply TRUE (Plan 1's drained-forever Training was a fact about the old
        // consume-the-pile model, and died with it). One moving strip, on the pile the child
        // just pressed a button about — the same "the block must MOVE while the machine runs"
        // law the counts already keep.
        const pss = live.passing;
        const frac = pss && pss.pile === part.key ? Math.max(0, Math.min(1, 1 - pss.frac)) : 1;
        ctx.fillStyle = P.oil; ctx.fillRect(part.x0, bar.y, pw, gh);
        ctx.fillStyle = P.chalk; ctx.fillRect(part.x0, bar.y, pw * frac, gh);
      }
      // The share, and under it the COUNT — printed inside its own part when there is room for
      // both to be READ. `pw - 8`, not `pw - 4`: the grab handles are 6 px caps standing ON the
      // slice edges (3 px inside each), so a label given the full slice is painted under one and
      // clipped — measured at 0.81 px of overlap, three times over (finding 3).
      //
      // THE COUNT IS THE PILE'S SIZE — how many rows this pile has been GIVEN — not how many are
      // still inside it. It shipped as `held` for one round and that was a legibility failure of
      // the same family as the one this whole change exists to fix: released rows leave the
      // Splitter faster than the Files block feeds it, so the Training pile is genuinely empty
      // most of the time and its slice read "0" — a bare zero on the one pile the child is
      // actively watching work, which reads as "nothing here" rather than "flowing through".
      // Honest and still misleading. Size instead:
      //   · it never reads empty while the pile has anything to deal, and it only ever climbs;
      //   · the three numbers SUM to the rows the Files block has dealt (29 + 10 + 9 = 48), so
      //     they are checkable against a number already on the floor — `held` summed to 19, which
      //     checks against nothing;
      //   · it means ONE thing in all three slices. The rejected alternative (rows-gone-through
      //     on an open pile, rows-waiting on a sealed one) puts two different meanings in the
      //     same place with no label to tell them apart.
      // The draining moved to the gauge above, which is not width-constrained and can carry it.
      const inner = pw - 8;
      if (inner <= 12) continue;
      const ps = Math.max(10, Math.min(13, bar.h * 0.40));
      const mid = part.x0 + pw / 2;
      if (counting) {
        label(ctx, part.pct + '%', mid, textTop + textH * 0.30, inner, { size: ps, colour: part.ink, weight: '800' });
        label(ctx, String(given[part.key]), mid, textTop + textH * 0.76, inner, { size: Math.max(8, ps - 2), colour: part.ink, weight: '700' });
      } else {
        label(ctx, part.pct + '%', mid, textTop + textH * 0.55, inner, { size: ps, colour: part.ink, weight: '800' });
      }
    }
    ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1;
    ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);

    // The two HANDLES: grab bars standing proud of the rail, so it LOOKS draggable before anyone
    // is told it is. Their width matches nothing arbitrary — floor.js grabs within Layout.BAR_GRAB
    // of the same x, a forgiving target for a finger.
    for (const hx of [bar.x0, bar.x1]) {
      // A frozen bar wears STEEL handles, not chalk ones: the same shape, visibly not lit, so a
      // control that can no longer act stops advertising that it can (finding 9). The word comes
      // on the press (floor.js barGrab); the colour is what says it before anyone presses.
      ctx.fillStyle = live.spent ? P.steel : P.chalk;
      rr(ctx, hx - 3, bar.y - 3, 6, bar.h + 6, 3); ctx.fill();
      ctx.strokeStyle = P.steelDark; ctx.lineWidth = 1;
      rr(ctx, hx - 3, bar.y - 3, 6, bar.h + 6, 3); ctx.stroke();
    }

    if (o.name) plate(ctx, o.name, x + w / 2, y + h * 0.09, w * 0.8, 14);
  }

  /* The BOARD's own pure geometry (Plan 3 task 4): WorkshopBoard.plan turns points into pixels,
     the SAME module logic/board.js's own headless tests pin and Task 5's Stop-commit writes into.
     Resolved LAZILY, same reason `layout()` above is — a classic <script>, so a captured
     `undefined` at IIFE time would freeze for the life of the page if index.html's load order
     ever moved. */
  const boardMod = () => (typeof window !== 'undefined' ? window.WorkshopBoard : null);

  /**
   * THE BOARD'S FACE (Plan 3 task 4, spec 2026-08-31 §3/§4/§10/§11). Unlike every other block on
   * this floor its whole JOB is memory across runs, so its face has to stay honest at every stage
   * of being wired, not only once a chart exists — the brief's own cascade, each check running
   * only once the one before it has passed:
   *   1. nothing feeds `watch` AT ALL           → board.noWire   (the connection law: the Board
   *      hangs off ONE Evaluator BY A WIRE, spec §10 — a wire hint, not a chart hint)
   *   2. wired, but no dial picked yet           → board.noWatch
   *   3. wired to a checker that can never speak a NUMBER (its belt line is label/yes-no, so its
   *      `error` out-port never fires — engine.js only computes one for a numeric crate; see
   *      game.js's boardFeed) → board.noNumbers
   *   4. watching a real numeric line, zero points landed yet → board.empty
   *   5. points → the mini chart: WorkshopBoard.plan's dots + per-x-mean line, studied in
   *      P.signal / fresh in P.warn — the EVALUATOR'S OWN inks (checker() above, ~line 741) —
   *      same meaning, same colour, everywhere. Each dot also carries its OWN crate count: a
   *      still-scoring act's point moves and its count climbs until its crates stop landing
   *      (board.js's own `commit` doc), so the LIVE picture visibly grows while an act runs —
   *      the defect class the Splitter shipped once (splitterBox's own long WHY, above) is the
   *      one this block is built not to repeat.
   * NO DEAD SURFACE: every branch below paints a real sentence or a real picture, never a blank.
   */
  function boardBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const words = live.words || {};
    // The header/chart split (fix round 1, Escalation B): read from logic/floor-layout.js's
    // boardFace(w, h), the SAME function floor.js's own isBoardFaceTap tests against — a tap can
    // never disagree with what is drawn here (the readerFace precedent's own law).
    const FloorLayout = (typeof window !== 'undefined') ? window.WorkshopFloorLayout : null;
    const face = FloorLayout ? FloorLayout.boardFace(w, h) : null;
    if (!face) return; // script-order guard: floor-layout.js not loaded yet — nothing legible to draw
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y + h * 0.06, w, h * 0.88, 6);

    // The shelf icon: a recognisable MINIATURE of the chart this block draws once it has
    // something to say, not a run through the honest-state cascade below (which has no table to
    // read from at shelf scale and would just show the wire hint forever). Two short synthetic
    // series in the SAME inks the real face uses, so a child can tell "that's the chart block"
    // before ever placing one — the splitter icon's own reasoning, applied to a line instead of
    // a bar.
    if (live.compact) {
      const bx = x + w * 0.16, by = y + h * 0.20, bw = w * 0.68, bh = h * 0.48;
      ctx.strokeStyle = 'rgba(185,203,219,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.stroke();
      const seriesPts = [[[0.06, 0.78], [0.42, 0.28]], [[0.58, 0.40], [0.94, 0.72]]];
      const inks = [P.signal, P.warn];
      seriesPts.forEach((pts, i) => {
        ctx.strokeStyle = inks[i]; ctx.lineWidth = 1.6;
        ctx.beginPath();
        pts.forEach(([fx, fy], j) => { const px = bx + fx * bw, py = by + fy * bh; if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.stroke();
        pts.forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(bx + fx * bw, by + fy * bh, 2, 0, 6.2832); ctx.fillStyle = inks[i]; ctx.fill(); });
      });
      if (o.name) plate(ctx, o.name, x + w / 2, y + h * 0.09, w * 0.8, 14);
      return;
    }

    if (o.name) plate(ctx, o.name, x + w / 2, y + h * 0.09, w * 0.8, 14);
    const innerX = x + face.chart.x, innerY = y + face.chart.y, innerW = face.chart.w, innerBottom = y + face.chart.y + face.chart.h;
    const innerH = innerBottom - innerY;
    if (innerH < 10 || innerW < 10) return; // squeezed past legibility — nothing honest fits here

    if (!live.wired) {
      wrapLabel(ctx, words.boardNoWire || '', x + w / 2, innerY + 6, innerW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
      return;
    }
    if (!live.watching) {
      wrapLabel(ctx, words.boardNoWatch || '', x + w / 2, innerY + 6, innerW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
      return;
    }
    if (live.feedKind && live.feedKind !== 'number') {
      wrapLabel(ctx, words.boardNoNumbers || '', x + w / 2, innerY + 6, innerW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
      return;
    }
    // The x-axis caption: which dial is being watched, shown the moment one is picked — a child
    // waiting for the first point still needs to know what they are about to see appear.
    label(ctx, live.watchWord || '', x + w / 2, innerY + 6, innerW, { size: 9, colour: P.inkSoft, weight: '700' });
    const chartY = innerY + 14, chartH = Math.max(0, innerBottom - chartY);

    const points = live.points || [];
    if (!points.length) {
      // FIX ROUND 2 (vision-breaker MAJOR — the relay-watch lie): a Board fed THROUGH a relay
      // (window/counter/timer) hears real traffic (engine.js's own `heard`, fix round 2) but can
      // NEVER open an act from it — the relay re-emits its OWN value, never the original crate's
      // pass. Without this branch the face sat on board.empty's "test something" invitation
      // forever, even after the Evaluator genuinely scored dozens of rows one panel over — an
      // active lie, not merely a quiet not-yet-true state. Checked BEFORE boardEmpty: `heard`
      // only ever climbs once real signals arrive, so a Board that has heard NOTHING still reads
      // the ordinary invitation.
      if (live.heard > 0) {
        wrapLabel(ctx, words.boardNoAct || '', x + w / 2, chartY + 6, innerW, { size: 10, lines: 4, lineHeight: 12, colour: P.inkSoft, weight: '700' });
        return;
      }
      wrapLabel(ctx, words.boardEmpty || '', x + w / 2, chartY + 6, innerW, { size: 10, lines: 3, lineHeight: 12, colour: P.inkSoft, weight: '700' });
      return;
    }

    const B = boardMod();
    if (!B || !B.plan) {
      if (!boardBox.warned) { boardBox.warned = true; if (typeof console !== 'undefined') console.error('floor-art: the Board cannot draw its chart — window.WorkshopBoard is missing (load logic/board.js before floor-art.js)'); }
      return;
    }
    // Deliberately NOT a ctx.translate: `plan`'s px/py are relative to the {w,h} box handed to
    // B.plan, so every one is offset by (innerX, chartY) BY HAND below, at the point it is
    // painted — every OTHER block on this floor paints fillText in absolute room coordinates (the
    // checker's own scatter above translates too, but only ever strokes/fills arcs inside it,
    // never fillText), and overlap-browser.test.js reads a label's overlap by the raw x/y its own
    // fillText call was given. A translated fillText here would paint at the right PIXEL while
    // lying about WHERE — invisible to every gate, same shape as the css-token-collision lesson.
    const plan = B.plan(points, { w: innerW, h: chartH, pad: { l: 4, r: 4, t: 4, b: 4 } });
    const px = (v) => innerX + v, py = (v) => chartY + v;
    ctx.strokeStyle = 'rgba(185,203,219,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(plan.box.x), py(plan.box.y)); ctx.lineTo(px(plan.box.x), py(plan.box.y + plan.box.h)); ctx.lineTo(px(plan.box.x + plan.box.w), py(plan.box.y + plan.box.h));
    ctx.stroke();
    const series = [{ s: plan.series.studied, ink: P.signal }, { s: plan.series.fresh, ink: P.warn }];
    for (const { s, ink } of series) {
      if (s.line.length > 1) {
        ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(px(s.line[0].px), py(s.line[0].py));
        for (let i = 1; i < s.line.length; i++) ctx.lineTo(px(s.line[i].px), py(s.line[i].py));
        ctx.stroke();
      }
      for (const d of s.dots) {
        ctx.beginPath(); ctx.arc(px(d.px), py(d.py), 2.6, 0, 6.2832); ctx.fillStyle = ink; ctx.fill();
        // Each dot's OWN crate count (board.js's own `n`) — small, and the one thing on this
        // face that keeps climbing while an act is still scoring (vision-breaker's law: a block
        // whose job is holding state must visibly hold it, splitterBox's own finding, above).
        if (chartH > 26) label(ctx, String(d.n), px(d.px), py(d.py) - 6, 22, { size: 6.5, colour: ink, weight: '700' });
      }
    }
    // The log's own headline count (the log itself is the plate's job — spec's "still genuinely
    // open #2", closed R2): honest confirmation of how many points this picture holds. Counts the
    // PLOTTABLE dots plan() actually drew (final fix round, finding 6), not raw `points.length` —
    // a hand-edited save naming a dial the watched block never carries stamps a point with
    // x:null (R6), which plan() correctly drops before it becomes a dot; the old raw count still
    // included it, so the face could paint bare axes with zero dots beside a count saying
    // otherwise. Reachable only through a hand-edited save (the picker offers live dials only,
    // deletePiece clears watches), but the count must never say more than the picture shows.
    const plottedCount = plan.series.studied.dots.length + plan.series.fresh.dots.length;
    label(ctx, String(plottedCount), x + w - 12, y + h * 0.14, 18, { size: 9, colour: P.inkSoft, align: 'right', weight: '800' });
  }

  // ---------------- wall + front ----------------
  function sign(ctx, o, live, t) {
    const { x, y, w, h } = o;
    rr(ctx, x, y, w, h, 8); ctx.fillStyle = '#1b2431'; ctx.fill(); ctx.strokeStyle = P.brass; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    const k = 0.5 + 0.5 * Math.sin(t / 510);
    ctx.save(); ctx.shadowColor = 'rgba(126,240,194,' + (0.4 + 0.3 * k) + ')'; ctx.shadowBlur = 12;
    label(ctx, live.shown !== undefined && live.shown !== null ? live.shown : (o.name || '—'), x + w / 2, y + h / 2, w - 20, { size: Math.min(22, h * 0.5), colour: live.shown !== undefined && live.shown !== null ? P.screenText : '#6f8896', weight: '800' });
    ctx.restore();
    if (live.shown !== undefined && live.shown !== null && o.name) label(ctx, o.name, x + w / 2, y + h - 8, w - 20, { size: 9, colour: '#6f8896' });
  }
  /**
   * THE FRAME (Composing Arc Plan C, task 3) — the Display's own sibling one step deeper: a
   * picture frame bolted to the wall, holding the EXAMPLE a Model answered from. A machined steel
   * surround, a bevelled mat, and a dark mount inside it; the name plate is screwed to the bottom
   * rail, the way a real one is.
   *
   * THREE HONEST STATES, and there is deliberately no fourth blank one (the readerFace / boardBox
   * dead-surface law — an empty panel reads as broken, so every state SAYS something true):
   *   1. holding + a thumbnail resolved  — THE PICTURE, drawn inside the mat and clipped to it,
   *      with the example's own name small underneath. This is the point of the whole block.
   *   2. holding, no thumbnail           — the example's NAME, large in the mount, plus
   *      words.frameNoPicture underneath: it says the Frame is showing a name BECAUSE no picture
   *      is kept, which is the privacy law's known cost, stated plainly and not apologised for.
   *      (A text or number example never had a photo either — same face, same true sentence.)
   *   3. holding nothing                 — words.frameEmpty, the invitation to wire one.
   *
   * THE POKE (toy law, R3-shaped): `live.pokedAge` is ms since the child touched it, and the whole
   * response is ONE ramp — instantly bright, then a straight linear decay to nothing over
   * POKE_GLOW_MS. FLASH SAFETY: a single monotonic fade is one transition, not a flicker; there is
   * no oscillator here at all (unlike the Sign's own breathing glow above), so however fast a child
   * taps, each tap only restarts the SAME decay — it can never produce a light/dark/light cycle,
   * which is what the 3-flashes-per-second law is about.
   */
  const POKE_GLOW_MS = 700;
  function frameBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const words = live.words || {};
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y, w, h, 6);
    // THE MAT — the recessed opening the picture (or the word) sits in. Inset from the block's own
    // rim so the surround reads as a FRAME rather than a screen, and sized off w/h so it scales
    // with the room like every other face here.
    const plateH = live.compact ? 0 : 15;
    const mx = x + w * 0.10, my = y + h * 0.09;
    const mw = w - (mx - x) * 2, mh = h - (my - y) - plateH - (live.compact ? h * 0.09 : 8);
    rr(ctx, mx, my, mw, mh, 3);
    ctx.fillStyle = P.screen; ctx.fill();
    ctx.strokeStyle = P.steelDark; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    // A bevel highlight along the mat's top-left, which is what makes the opening read as DEPTH.
    ctx.save();
    rr(ctx, mx, my, mw, mh, 3); ctx.clip();
    const bev = ctx.createLinearGradient(mx, my, mx + mw * 0.5, my + mh * 0.5);
    bev.addColorStop(0, 'rgba(226,238,252,0.20)'); bev.addColorStop(1, 'rgba(226,238,252,0)');
    ctx.fillStyle = bev; ctx.fillRect(mx, my, mw, mh);
    ctx.restore();
    // The shelf icon stops here: at icon scale there is no run to hold anything, and an empty
    // sentence squeezed into 40 px is not a sentence (the microphone/speaker icon branches' own
    // reasoning). A bolted, bevelled, EMPTY frame is exactly what the block is.
    if (live.compact) {
      bolt(ctx, x + w * 0.5, y + h * 0.045);
      return;
    }
    // The four corner bolts — this thing is fixed to the wall, not propped against it.
    for (const bx of [x + w * 0.05, x + w * 0.95]) for (const by of [y + h * 0.05, y + h - plateH - 6]) bolt(ctx, bx, by);

    // THE POKE HALO (see the doc above): one linear fade, no oscillation.
    const glow = Number.isFinite(live.pokedAge) && live.pokedAge < POKE_GLOW_MS
      ? 1 - live.pokedAge / POKE_GLOW_MS : 0;
    if (glow > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(95,227,220,' + (0.75 * glow).toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      rr(ctx, mx - 1.5, my - 1.5, mw + 3, mh + 3, 4); ctx.stroke();
      ctx.restore();
    }

    const caption = live.caption || '';
    const pad = 4;
    if (live.thumb) {
      // STATE 1 — THE PICTURE. Drawn CONTAIN (never cover): a taught thumbnail is square (56x56,
      // game.js's own snap/import path) and the mat is not, so cover-scaling would crop the very
      // photograph the child is being shown. Clipped to the mat regardless, so a source of any
      // ratio — a future non-square thumb included — can never spill onto the steel surround.
      const capH = caption ? 13 : 0;
      const boxW = mw - pad * 2, boxH = mh - pad * 2 - capH;
      const sw = live.thumb.width || 56, sh = live.thumb.height || 56;
      const sc = Math.min(boxW / sw, boxH / sh);
      const dw = Math.max(1, sw * sc), dh = Math.max(1, sh * sc);
      ctx.save();
      rr(ctx, mx + pad, my + pad, boxW, boxH, 2); ctx.clip();
      try { ctx.drawImage(live.thumb, mx + pad + (boxW - dw) / 2, my + pad + (boxH - dh) / 2, dw, dh); }
      catch (err) { /* a source the browser will not draw costs the picture, never the frame */ }
      ctx.restore();
      // The example's own name, small, UNDER the photograph — a caption, exactly as a real frame
      // carries one. The picture is the answer; the name only confirms which example it is.
      if (caption) label(ctx, caption, x + w / 2, my + mh - pad - capH / 2, mw - pad * 2, { size: 9, colour: P.inkSoft, weight: '700' });
    } else if (live.shown) {
      // STATE 2 — HOLDING SOMETHING, WITH NO PICTURE TO SHOW. The name takes the space the photo
      // would have had (large, lit, the same treatment the Sign gives a live value), and the
      // honest sentence sits under it saying WHY there is no photograph.
      //
      // THE BANDS ARE COMPUTED, NOT FRACTIONED (fix round 1). Fractions of the mat were measured
      // wrong on the real canvas: a placed Frame is 118.8x97.2 (fit 0.90, mat ~65 px tall) and the
      // first draft's 3 name rows at 15 px needed 49 px above a 2-row sentence that started at
      // 0.75 of the mat — so the name's last row printed THROUGH the sentence's first, at the
      // commonest size on the floor, and at FIT_MIN (92.4x75.6, mat ~46 px) the sentence also ran
      // past the mat's own floor. Both bands are now derived from the heights they actually need:
      //   · the sentence is pinned just inside the mat's bottom edge, and takes a SECOND row only
      //     where one genuinely fits;
      //   · the name owns everything above it, and picks its row count from what the caption
      //     really measures — so the common short name ("Photo 3") still gets ONE big 15 px line,
      //     and only a verbose one spends rows — then sizes its type to fill that band exactly.
      // Nothing here can overlap or overrun by construction, at any fit.
      const sentSize = 8.5, sentLH = 10;
      const inner = mw - pad * 2;
      const sentRows = (mh - 6) >= (10 + 2 * sentLH + sentSize) ? 2 : 1;
      const sentY = my + mh - 3 - ((sentRows - 1) * sentLH + sentSize) + sentSize / 2;
      const bandTop = my + 2;
      const bandH = Math.max(sentSize, (sentY - sentSize / 2 - 2) - bandTop);
      // How many rows the caption ACTUALLY needs at the biggest type this band allows.
      ctx.save();
      ctx.font = '800 15px' + FAMILY;
      const need = Math.max(1, Math.ceil(ctx.measureText(caption).width / Math.max(1, inner)));
      ctx.restore();
      // …then the largest row count (never more than it needs, never more than three) whose type
      // still clears the 7.5 px floor `label` itself will not draw below.
      let nameRows = 1, nameSize = 7.5;
      for (let r = Math.min(3, need); r >= 1; r--) {
        const s = Math.min(15, bandH / r - 2);
        if (s >= 7.5 || r === 1) { nameRows = r; nameSize = Math.max(7.5, s); break; }
      }
      wrapCut(ctx, caption, x + w / 2, bandTop + nameSize / 2, inner,
        { size: nameSize, lines: nameRows, lineHeight: nameSize + 2, colour: P.screenText, weight: '800' });
      wrapCut(ctx, words.frameNoPicture || '', x + w / 2, sentY, inner,
        { size: sentSize, lines: sentRows, lineHeight: sentLH, colour: P.inkSoft, weight: '700' });
    } else {
      // STATE 3 — NOTHING HANDED TO IT YET. Never a blank mat. The row budget is what the mat can
      // hold (10 px a row inside 6 px of air), and `wrapCut` marks the cut if even that is not
      // enough — measured, this sentence paints WHOLE at every fit down to FIT_MIN.
      const rows = Math.max(1, Math.min(5, Math.floor((mh - 6) / 10)));
      wrapCut(ctx, words.frameEmpty || '', x + w / 2, my + 3 + 4.5, mw - pad * 2,
        { size: 9, lines: rows, lineHeight: 10, colour: P.inkSoft, weight: '700' });
    }
    if (o.name) plate(ctx, o.name, x + w / 2, y + h - plateH - 3, w - 14, plateH - 1);
  }
  /**
   * THE BRICK (composing-arc "make your own part", task 5): several blocks the child built,
   * wired and sealed behind one name. It must read as CLOSED, never as a container — a bin or a
   * Pen shows a fill level because holding a visible pile IS their whole job; a brick holds a
   * MACHINE, and nothing about a sealed machine's insides belongs on its face. The plate's own
   * port list and Unpack (rowsOf/renderRow, game.js) are the ONLY way back in, so this face draws
   * ONE plated steel slab, bolted at all four corners — the Frame's own "fixed to the wall" tell,
   * borrowed here for fixed SHUT instead of fixed up — with the child's OWN name as the one word
   * on it (namePlate, the hero): a made part has no generic word worth printing large: only the
   * name the child chose is honest here.
   *
   * A seam just inside the bolts brightens steadily while a run is up — the one cue the face
   * gives that the sealed machine inside is alive (the reader's own orbit gives a Model the same
   * signal; a brick has no window to show a picture through, so the whole face breathes instead).
   * `Math.cos(0) === 1` keeps a reduced-motion frame (t=0) a correct, calm, LIT still frame rather
   * than a blank one — never an oscillator a flash-safety pass would have to cap.
   *
   * Its port SOCKETS are never drawn here: they are the ordinary diamond/nub sockets every block
   * already carries (floor.js's own socket pass, fed by this piece's PER-PIECE port list —
   * logic/floor-layout.js's `ports.insFor`/`outsFor`, game.js's floorBridge). A second, hand-drawn
   * set here would be exactly the two-sources class of bug this codebase keeps a written law
   * against (run-state-vs-piece); one source, the socket pass, is the only one.
   */
  /**
   * The peek porthole (composing-arc task 6) — the ONE spot on a sealed part's own face that
   * opens its panel ("its own small floor, live while it runs"). Reads `Layout.brickFace(w,h)`'s
   * `porthole` circle — the SAME geometry floor.js's `isBrickFaceTap` tests a tap against, so the
   * ring drawn here and the region that actually opens the panel can never disagree (the
   * readerFace/boardFace precedent's own law). A steel rim (every socket ring's own colour) around
   * dark glass; the glass carries a soft teal pulse ONLY while the part is actually running — the
   * seam's own "alive in there" glow, one octave quieter, since this is a window, not a second seam.
   */
  function brickPorthole(ctx, o, face, live, t) {
    const p = face.porthole;
    if (!p || !(p.r > 0)) return;
    const cx = o.x + p.cx, cy = o.y + p.cy, r = p.r;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = P.steelDark; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = P.steelLight; ctx.stroke();
    const glass = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    // task 106: reads live.busy, not live.running — this window is the seam's OWN "alive in
    // there" tell (its doc above), so it must not overclaim any more than the seam itself does.
    // With no run live.busy is unset (falsy), same steady glass as before this feature existed.
    if (live.busy) {
      const k = 0.5 + 0.5 * Math.cos(t / 460);
      glass.addColorStop(0, 'rgba(95,227,220,' + (0.22 + 0.18 * k).toFixed(3) + ')');
      glass.addColorStop(1, 'rgba(11,13,18,0.92)');
    } else {
      glass.addColorStop(0, 'rgba(70,86,111,0.22)');
      glass.addColorStop(1, 'rgba(11,13,18,0.95)');
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = glass; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(185,203,219,0.35)'; ctx.stroke();
  }
  function brickBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y, w, h, 8);
    const inset = Math.min(11, w * 0.06, h * 0.08);
    // The shelf icon: one bolt, centred — a name too small to letter at icon scale (icon() always
    // passes name:''), the same minimal treatment frameBox keeps for its own compact branch.
    if (live.compact) { bolt(ctx, x + w / 2, y + inset); return; }
    for (const bx of [x + inset, x + w - inset]) for (const by of [y + inset, y + h - inset]) bolt(ctx, bx, by);
    // The seam: the closed edge of the case, not a window into it. Read off logic/floor-layout.js's
    // brickFace(w,h) (task 6) — the SAME rect floor.js's own hit-testing reads, single-source law.
    const L = layout();
    const face = L && L.brickFace ? L.brickFace(w, h) : null;
    const seamX = x + inset * 1.7, seamY = y + inset * 1.7, seamW = w - inset * 3.4, seamH = h - inset * 3.4;
    if (face) brickPorthole(ctx, o, face, live, t);
    // task 106: the seam breathes on live.busy, not live.running — a run being up is not the same
    // as THIS part doing anything (liveFor's brick case, floor.js, computes busy from the part's
    // OWN face ports + what it is carrying). With no run live.busy is unset, so this reads exactly
    // as before the feature existed: steady.
    if (live.busy) {
      const k = 0.5 + 0.5 * Math.cos(t / 460);
      ctx.save();
      ctx.strokeStyle = 'rgba(95,227,220,' + (0.28 + 0.34 * k).toFixed(3) + ')'; ctx.lineWidth = 2.2;
      rr(ctx, seamX, seamY, seamW, seamH, 5); ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(95,227,220,0.18)'; ctx.lineWidth = 1.2;
      rr(ctx, seamX, seamY, seamW, seamH, 5); ctx.stroke();
      ctx.restore();
    }
    // THE POKE HALO (frameBox's own idiom, above): a poke re-states the part's name — there is
    // nothing else honest for a sealed slab to invent (no note, no roll, no speech of its own).
    const glow = Number.isFinite(live.pokedAge) && live.pokedAge < POKE_GLOW_MS ? 1 - live.pokedAge / POKE_GLOW_MS : 0;
    if (glow > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(95,227,220,' + (0.8 * glow).toFixed(3) + ')'; ctx.lineWidth = 3;
      rr(ctx, x + 2, y + 2, w - 4, h - 4, 8); ctx.stroke();
      ctx.restore();
    }
    // THE NAME — the hero, and the only word on a sealed face.
    //
    // FIX ROUND 1 (reviewer MAJOR 2): a plate sized off `w` alone (`w*0.86`) ignored the seam it is
    // drawn OVER — at FOOT.brick scale the seam is 140.1px wide and the plate was 151.4px, so the
    // plate overhung the seam by ~5.7px each side, printed on TOP of it, at every practical width
    // (the overhang only ever shrinks as w grows, so w<267 always loses). That broke the exact claim
    // this face's own doc makes two comments up — "the closed edge of the case, not a window into
    // it" — reading instead as a two-drawer cabinet, three stacked bands. Clamped to the seam's own
    // width, less a hair of visible steel on each side, so the plate can never again print past the
    // rim it is supposed to sit inside.
    const nameSize = 15;
    const namePlateW = Math.min(w * 0.86, seamW - 6);
    // Vertically CENTRED inside the seam, not just anchored low: `ph` mirrors namePlate()'s own
    // height formula (2*(round(size)+2)+8) exactly — namePlate never returns it up front, so this
    // has to compute the same number to centre it before the call. If namePlate's own formula ever
    // moves, this must move with it (the same "two copies of one geometry drift" law barRail/
    // barHandles already carry a comment about, one function up in this same file's history).
    const namePlateH = 2 * (Math.round(nameSize) + 2) + 8;
    const namePlateBottomY = seamY + (seamH + namePlateH) / 2;
    namePlate(ctx, o.name || '', x + w / 2, namePlateBottomY, namePlateW, nameSize);
  }
  /**
   * The LAMP - a caged bulkhead light on a bracket, not a coloured disc. Lit, it throws a POOL
   * on the wall behind it: a lamp that lights nothing around itself reads as a sticker of a lamp.
   * The cage ribs stay dark across the glass, which is what makes the glass read as glass.
   */
  function lamp(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const c = COLOURS[live.colour] || COLOURS.red;
    const cx = x + w / 2, gy = y + h * 0.32, gr = w * 0.27;
    // The pool it casts, first and furthest back.
    if (live.lit) {
      const pool = ctx.createRadialGradient(cx, gy, gr * 0.4, cx, gy, gr * 3.4);
      pool.addColorStop(0, c + '5c'); pool.addColorStop(0.45, c + '22'); pool.addColorStop(1, c + '00');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.arc(cx, gy, gr * 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // Bracket, stem and the cast collar the glass screws into.
    steelBox(ctx, cx - w * 0.30, y + h * 0.60, w * 0.60, h * 0.13, 3);
    bolt(ctx, cx - w * 0.22, y + h * 0.665); bolt(ctx, cx + w * 0.22, y + h * 0.665);
    ctx.fillStyle = P.steelDark; ctx.fillRect(cx - 4, y + h * 0.46, 8, h * 0.16);
    steelBox(ctx, cx - gr * 1.2, y + h * 0.43, gr * 2.4, h * 0.07, 3);
    // Glass: a bright core when lit, a dead grey lens when not.
    if (live.lit) { ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 26; }
    const g = ctx.createRadialGradient(cx - gr * 0.35, gy - gr * 0.4, gr * 0.08, cx, gy, gr);
    if (live.lit) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c); g.addColorStop(1, c + 'cc'); }
    // task 064 R2a: the chosen colour shows on the DEAD lens too — dim glass, no pool, no
    // shadow, unmistakably unlit; a child's colour choice must own the piece before it runs.
    else { g.addColorStop(0, 'rgba(226,232,238,0.45)'); g.addColorStop(0.5, c + '2e'); g.addColorStop(1, 'rgba(60,70,80,0.6)'); }
    ctx.beginPath(); ctx.arc(cx, gy, gr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    if (live.lit) ctx.restore();
    ctx.strokeStyle = P.steelDark; ctx.lineWidth = 2.5; ctx.stroke(); ctx.lineWidth = 1;
    // The cage: two ribs and a belly band, always dark - this is what reads as INDUSTRIAL.
    ctx.save();
    ctx.strokeStyle = 'rgba(38,46,55,0.85)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.ellipse(cx, gy, Math.abs(gr * k) + 0.6, gr, 0, -Math.PI / 2, Math.PI / 2, k < 0);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - gr, gy); ctx.lineTo(cx + gr, gy); ctx.stroke();
    ctx.restore();
    if (o.name) plate(ctx, o.name, cx, y + h * 0.78, w + 10, 14);
  }
  /**
   * The SOUND block - a brass KLAXON on a bracket. It was a flat trapezoid beside a grey square.
   * What makes brass read as brass is that the flare is LIT along its top lip and dark in its
   * throat, and that the mouth is a rolled rim with real darkness behind it. When a note lands,
   * arcs leave the mouth and fade ONCE over 600 ms - a one-shot, so nothing here can strobe.
   */
  function horn(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const cy = y + h * 0.44;
    const throatX = x + w * 0.34, mouthX = x + w * 0.82;
    const throatR = h * 0.11, mouthR = h * 0.29;
    // Driver can + bracket: the machine half that actually makes the noise.
    steelBox(ctx, x + w * 0.04, cy - h * 0.17, w * 0.32, h * 0.34, 5);
    bolt(ctx, x + w * 0.11, cy - h * 0.09); bolt(ctx, x + w * 0.11, cy + h * 0.09);
    // The flare.
    const bg = ctx.createLinearGradient(0, cy - mouthR, 0, cy + mouthR);
    bg.addColorStop(0, '#d8fffb'); bg.addColorStop(0.42, P.brass); bg.addColorStop(1, P.brassDark);
    ctx.beginPath();
    ctx.moveTo(throatX, cy - throatR);
    ctx.bezierCurveTo(x + w * 0.58, cy - throatR * 1.15, x + w * 0.70, cy - mouthR * 0.82, mouthX, cy - mouthR);
    ctx.lineTo(mouthX, cy + mouthR);
    ctx.bezierCurveTo(x + w * 0.70, cy + mouthR * 0.82, x + w * 0.58, cy + throatR * 1.15, throatX, cy + throatR);
    ctx.closePath();
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = P.brassDark; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
    // A single highlight down the top of the flare - one stroke, and the brass stops being flat.
    ctx.beginPath();
    ctx.moveTo(throatX + 2, cy - throatR * 0.7);
    ctx.bezierCurveTo(x + w * 0.58, cy - throatR * 0.95, x + w * 0.70, cy - mouthR * 0.60, mouthX - 3, cy - mouthR * 0.70);
    ctx.strokeStyle = 'rgba(255,242,206,0.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    // The mouth: darkness inside, a lit rolled rim around it.
    ctx.beginPath(); ctx.ellipse(mouthX, cy, w * 0.055, mouthR, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1c0b'; ctx.fill();
    ctx.strokeStyle = '#d8fffb'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    // The note leaving the bell.
    const age = live.rang === undefined ? Infinity : live.rang;
    if (age < 600) {
      const k = age / 600;
      ctx.save(); ctx.lineCap = 'round';
      for (let r = 0; r < 3; r++) {
        const a = 1 - Math.min(1, k + r * 0.2);
        if (a <= 0) continue;
        ctx.strokeStyle = 'rgba(150,240,247,' + (a * 0.85).toFixed(3) + ')';
        ctx.lineWidth = 3 - r * 0.6;
        ctx.beginPath();
        ctx.arc(mouthX + 2, cy, mouthR * (0.55 + k * 1.4) + r * 8, -0.75, 0.75);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (o.name) plate(ctx, o.name, x + w / 2, y + h * 0.86, w, 14);
  }
  /**
   * THE SPEAKER (Composing Arc Plan A, task 3) — the Sound block's own sibling: a driver cone on
   * a steel plate at the left (its rings pulse only while a speak() promise is actually in
   * flight — a still cone means silence, matching the Camera's own "the LED is the only hint of
   * life" idiom), and the WORD on the right. R1/dead-surface law: idle shows the last thing said,
   * small (an honest "—" before the first say, never a blank box); speaking shows the same word
   * LARGE and lit — a muted room, or a deaf child, still knows what the machine just said.
   *
   * task 064 R2c: `live.canSpeak === false` (a device with NO voice service at all, floor.js's
   * own bridge read) adds one more honest sentence below the word — this device can never make
   * a sound, so the picture is the whole story, not a fallback for a bad moment.
   */
  function speakerBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    const words = live.words || {};
    shadow(ctx, x, y, w, h);
    steelBox(ctx, x, y, w, h, 6);
    // The shelf icon: the cone alone, centred — no run to read a word from at shelf scale (the
    // microphone's own icon branch just above, applied here).
    const compact = !!live.compact;
    const cx = compact ? x + w / 2 : x + w * 0.18, cy = y + h * 0.5, r = compact ? Math.min(w * 0.30, h * 0.34) : Math.min(w * 0.16, h * 0.34);
    const speaking = !!live.speaking;
    const pulse = speaking ? 0.5 + 0.5 * Math.sin(t / 170) : 0;
    for (let i = 0; i < 3; i++) {
      const ring = r * (0.36 + i * 0.32) * (1 + pulse * 0.05 * i);
      ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.strokeStyle = i === 2 ? P.steelLight : 'rgba(203,214,226,0.5)';
      ctx.lineWidth = i === 0 ? 1.6 : 1;
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = speaking ? P.signal : P.steelDark; ctx.fill();
    if (speaking) {
      ctx.save(); ctx.shadowColor = P.signal; ctx.shadowBlur = 8 + pulse * 6;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (compact) return;
    // THE WORD. Right of the cone, above the name plate.
    const textX = x + w * 0.36, textW = x + w - 10 - textX;
    if (speaking) {
      const k = 0.5 + 0.5 * Math.sin(t / 300);
      ctx.save(); ctx.shadowColor = 'rgba(95,227,220,' + (0.45 + 0.3 * k) + ')'; ctx.shadowBlur = 12;
      wrapLabel(ctx, live.lastSaid || '', textX + textW / 2, y + h * 0.32, textW, { size: Math.min(19, h * 0.20), lines: 2, lineHeight: Math.min(19, h * 0.20) + 3, colour: P.screenText, weight: '800' });
      ctx.restore();
    } else {
      // The idle placeholder is the SAME literal "—" the Sign's own signface starts on
      // (renderRow, game.js) — one honest symbol for "nothing said yet" across the whole app.
      label(ctx, live.lastSaid || '—', textX + textW / 2, y + h * 0.44, textW, { size: 12, colour: live.lastSaid ? P.inkSoft : '#6f8896', weight: '700' });
    }
    // THE NO-VOICE CAPTION (task 064 R2c): a device fact, not a per-say one — shown whether idle
    // or "speaking" (held), the same small-caption idiom the Microphone's own cascade uses, so a
    // muted or serviceless machine never reads as one that simply chose to stay quiet.
    // task P3b (plan §3): the private-session caption wins over the no-voice one — both describe
    // "no sound leaves this block", and the private reason is the one the person can act on.
    if (live.privateQuiet) {
      wrapLabel(ctx, words.speakerPrivate || '', textX + textW / 2, y + h * 0.70, textW, { size: 9, lines: 2, lineHeight: 10, colour: P.inkSoft, weight: '700' });
    } else if (live.canSpeak === false) {
      wrapLabel(ctx, words.speakerNoVoice || '', textX + textW / 2, y + h * 0.70, textW, { size: 9, lines: 2, lineHeight: 10, colour: P.inkSoft, weight: '700' });
    }
    if (o.name) plate(ctx, o.name, x + w / 2, y + h - 16, w - 12, 14);
  }
  /**
   * The TIMER - an interval clock in a steel bezel. It was a white disc with a red line across it,
   * which showed the time but never the WAIT. The wait is the point of this block, so the arc
   * FILLS from twelve as the interval runs down and the whole face flashes once when it fires.
   * The sweep is driven by live.frac (the run's own clock), not by t, so a paused machine's timer
   * stands still instead of miming.
   */
  function clock(ctx, o, live, t) {
    const { x, y, w, h } = o;
    // Reserve from the BOTTOM up — name plate, then the interval line — and give the dial what is
    // left. Sizing the dial first (0.34 of the card) put the bezel through both of them.
    const cx = x + w / 2;
    const plateTop = o.name ? y + h - 15 : y + h;
    const iy = plateTop - 8;                                    // the interval's own line
    const r = Math.max(9, Math.min(w * 0.34, (iy - 8 - (y + 3)) / 2.4));
    const cy = y + 3 + r * 1.2;
    shadow(ctx, x, y, w, h);
    // Bezel: a machined ring, lit along the top.
    const bez = ctx.createLinearGradient(0, cy - r * 1.2, 0, cy + r * 1.2);
    bez.addColorStop(0, P.steelLight); bez.addColorStop(0.55, P.steel); bez.addColorStop(1, P.steelDark);
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2); ctx.fillStyle = bez; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    // Dial face.
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#111a22'; ctx.fill();
    // Ticks: twelve, with the quarters longer — a dial you can read at a glance.
    ctx.save(); ctx.strokeStyle = 'rgba(203,214,226,0.55)'; ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const long = i % 3 === 0;
      ctx.lineWidth = long ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * (long ? 0.74 : 0.82), cy + Math.sin(a) * r * (long ? 0.74 : 0.82));
      ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
      ctx.stroke();
    }
    ctx.restore();
    // The wait, filling from twelve.
    const frac = Math.max(0, Math.min(1, live.frac || 0));
    if (frac > 0) {
      ctx.save();
      ctx.strokeStyle = P.signal; ctx.lineWidth = Math.max(3, r * 0.2); ctx.lineCap = 'butt';
      ctx.shadowColor = 'rgba(79,209,197,0.55)'; ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.62, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // The hand and its counterweight.
    const a = -Math.PI / 2 + frac * Math.PI * 2;
    ctx.save(); ctx.strokeStyle = P.lamp; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 0.18, cy - Math.sin(a) * r * 0.18);
    ctx.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
    ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fillStyle = P.steelLight; ctx.fill();
    ctx.strokeStyle = P.steelDark; ctx.stroke();
    // It went off: one ring, no loop.
    if (live.fired) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,194,75,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // The interval, engraved on its own reserved line — never on the plate below it.
    label(ctx, (live.seconds || '') + (live.seconds ? 's' : ''), cx, iy, w, { size: 10, colour: P.chalk, weight: '800' });
    if (o.name) plate(ctx, o.name, cx, plateTop, w, 13);
  }
  function counterBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    steelBox(ctx, x, y, w, h * 0.7, 6);
    screen(ctx, x + 6, y + 6, w - 12, h * 0.7 - 12);
    label(ctx, live.count === undefined ? '0' : live.count, x + w / 2, y + h * 0.35, w - 16, { size: 20, colour: P.screenText, weight: '800' });
    plate(ctx, o.name || '', x + w / 2, y + h * 0.76, w, 14);
  }
  /** The WINDOW: a wall recorder whose face is the last few numbers as bars — the block that
   *  remembers, drawn as the only thing on the wall with a past. */
  function memoryBox(ctx, o, live, t) {
    const { x, y, w, h } = o;
    steelBox(ctx, x, y, w, h * 0.7, 5);
    var bx = x + 7, by = y + 6, bw = w - 14, bh = h * 0.7 - 20;
    screen(ctx, bx, by, bw, bh);
    var vals = (live.win && live.win.length) ? live.win : [];
    var n = Math.max(1, vals.length);
    var lo = vals.length ? Math.min.apply(null, vals) : 0;
    var hi = vals.length ? Math.max.apply(null, vals) : 1;
    if (!(hi > lo)) { hi = lo + 1; }
    var gap = 2, cw = Math.max(2, (bw - 8 - gap * (n - 1)) / n);
    for (var i = 0; i < vals.length; i++) {
      var frac = (vals[i] - lo) / (hi - lo);
      var bhh = Math.max(2, frac * (bh - 8));
      ctx.fillStyle = i === vals.length - 1 ? P.signal : 'rgba(79,209,197,0.45)';
      ctx.fillRect(bx + 4 + i * (cw + gap), by + bh - 4 - bhh, cw, bhh);
    }
    if (!vals.length) label(ctx, live.says || '', bx + bw / 2, by + bh / 2, bw - 8, { size: 10, colour: P.screenText });
    plate(ctx, o.name || live.label || '', x + w / 2, y + h * 0.76, w, 14);
  }

  /**
   * ONLY IF - a real RELAY: a bakelite body on a rail, terminal screws top and bottom where the
   * cables land, and a window you can see the mechanism through. Inside, an armature bar CLOSES
   * across two contacts while a signal is getting past it, with the coil lamp lit beside it. It
   * was a grey box with words on it, which is a label, not a machine.
   *
   * Also the fallback for Cloud and Send (neither is on the shelf today), so it must read
   * sensibly with nothing but a name.
   */
  function relay(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const bh = h * 0.72;
    // Terminal strips: the relay is bolted between its wires, top rail and bottom rail.
    ctx.fillStyle = P.steelDark;
    rr(ctx, x + w * 0.06, y - 3, w * 0.88, 7, 2); ctx.fill();
    rr(ctx, x + w * 0.06, y + bh - 4, w * 0.88, 7, 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const sx = x + w * (0.20 + i * 0.30);
      bolt(ctx, sx, y + 0.5); bolt(ctx, sx, y + bh - 0.5);
    }
    // The body.
    const bg = ctx.createLinearGradient(0, y, 0, y + bh);
    bg.addColorStop(0, '#2c343d'); bg.addColorStop(0.5, '#1e252d'); bg.addColorStop(1, '#141a20');
    rr(ctx, x, y, w, bh, 5); ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    // The window: smoked glass over the contacts.
    const wx = x + 6, wy = y + 7, ww = w * 0.26, wh = bh - 14;
    rr(ctx, wx, wy, ww, wh, 3); ctx.fillStyle = 'rgba(140,170,190,0.16)'; ctx.fill();
    ctx.strokeStyle = 'rgba(190,215,230,0.35)'; ctx.stroke();
    // Two fixed contacts, and the armature that bridges them when the signal is passing.
    const c1 = wx + ww * 0.28, c2 = wx + ww * 0.72, cy = wy + wh * 0.62;
    ctx.fillStyle = P.brassDark;
    ctx.fillRect(c1 - 2, cy, 4, wh * 0.28); ctx.fillRect(c2 - 2, cy, 4, wh * 0.28);
    const closed = !!live.passed;
    ctx.save();
    ctx.strokeStyle = closed ? P.brass : P.steelLight;
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (closed) { ctx.shadowColor = 'rgba(150,240,247,0.8)'; ctx.shadowBlur = 8; }
    ctx.beginPath();
    // Open, the bar is hinged UP off the right contact; closed, it lies flat across both.
    ctx.moveTo(c1 - 3, cy - 1);
    ctx.lineTo(c2 + 3, closed ? cy - 1 : cy - wh * 0.34);
    ctx.stroke();
    ctx.restore();
    // The coil lamp beside the mechanism.
    ctx.beginPath(); ctx.arc(wx + ww * 0.5, wy + wh * 0.2, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = closed ? P.ok : 'rgba(120,135,150,0.5)'; ctx.fill();
    // The rule, engraved on a brass plate. It gets the WIDE half of the card: this is the only
    // text on the block that says what it does, and "is not paper" clipping to "is no…" makes the
    // machine unreadable. The mechanism window is decoration by comparison, so it yields.
    const px = x + w * 0.36, pw = w * 0.60;
    rr(ctx, px, y + bh * 0.20, pw, bh * 0.36, 3);
    ctx.fillStyle = P.brass; ctx.fill();
    ctx.strokeStyle = P.brassDark; ctx.stroke();
    label(ctx, live.rule || '', px + pw / 2, y + bh * 0.38, pw - 8, { size: 10, colour: '#2a1c0b', weight: '800' });
    // Its NAME on a cream plate at the foot of the card, like every other block on the wall.
    // It was the one block writing its name as grey text inside itself, which is what made the
    // wall row read as four different design languages (owner: "the panel design should be
    // consistent").
    plate(ctx, o.name || live.label || '', x + w / 2, y + bh + 2, w * 0.9, 15);
  }
  /**
   * The BIG RED BUTTON - a machined arcade switch. It was an ellipse sitting on a rectangle; a
   * dome only reads as a dome once it has a specular from the room's lamp, a bezel it sits INSIDE,
   * and a shadow in the well that TIGHTENS as it sinks. A press travels for 90 ms and eases back
   * over 330 ms - slow enough to feel - plus one expanding strike ring that settles. Every bit of
   * it is a one-shot, so a child leaning on the button cannot make anything flash.
   */
  function button(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const cx = x + w / 2;
    const age = live.pressedAge === undefined ? Infinity : live.pressedAge;
    const travel = age < 90 ? 1 : age < 420 ? 1 - (age - 90) / 330 : 0;
    // THE NAME COMES FIRST, and the dome takes what is left (finding 8). Three act Buttons whose
    // only difference is the word on them cannot afford that word to be a 7.5 px smear, so the
    // plate is measured before any geometry and the machinery is laid out above it. `avail` is
    // what remains; every constant below is a fraction of it rather than of `h`, so the button
    // stays a button at a shelf icon's scale and at 2800 wide alike.
    const plateSize = Math.max(10, Math.min(14, h * 0.15));
    const plateH = live.compact ? 15 : 2 * (Math.round(plateSize) + 2) + 8;
    const avail = Math.max(24, h - plateH - 4);
    const rx = w * 0.33, ry = avail * 0.19;
    const bezY = y + avail * 0.62;
    const capY = bezY - avail * 0.13 + travel * avail * 0.10;
    // Cast housing, bolted to the floor.
    steelBox(ctx, x + w * 0.17, bezY, w * 0.66, avail * 0.34, 7);
    bolt(ctx, x + w * 0.24, bezY + avail * 0.25); bolt(ctx, x + w * 0.76, bezY + avail * 0.25);
    // Chromed bezel, lighter along the top where the gantry lamp catches it.
    const bg = ctx.createLinearGradient(0, bezY - ry * 1.2, 0, bezY + ry * 1.2);
    bg.addColorStop(0, P.steelLight); bg.addColorStop(0.55, P.steel); bg.addColorStop(1, P.steelDark);
    ctx.beginPath(); ctx.ellipse(cx, bezY, rx * 1.2, ry * 1.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    // The well: the cap has to sit inside SOMETHING or it floats.
    ctx.beginPath(); ctx.ellipse(cx, bezY, rx * 1.03, ry * 1.03, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,16,21,0.78)'; ctx.fill();
    // The cap's shadow in the well - it tightens under the cap as the cap sinks.
    ctx.beginPath();
    ctx.ellipse(cx, capY + ry * (0.5 + 0.45 * (1 - travel)), rx * 0.96, ry * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    // The dome.
    const dg = ctx.createRadialGradient(cx - rx * 0.34, capY - ry * 0.7, ry * 0.12, cx, capY, rx * 1.2);
    dg.addColorStop(0, '#ff9a83'); dg.addColorStop(0.45, '#e2452c'); dg.addColorStop(1, '#8f2c1c');
    ctx.beginPath(); ctx.ellipse(cx, capY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = 'rgba(70,16,10,0.9)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.27, capY - ry * 0.42, rx * 0.34, ry * 0.30, -0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    // The strike ring.
    if (age < 620) {
      const k = age / 620;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,190,120,' + (0.75 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.ellipse(cx, bezY, rx * (1.25 + k * 1.5), ry * (1.25 + k * 1.5), 0, 0, Math.PI * 2);
      ctx.stroke(); ctx.restore();
    }
    if (live.compact) plate(ctx, o.name || live.label || '', cx, y + h - 17, w * 0.92, 15);
    else namePlate(ctx, o.name || live.label || '', cx, y + h - 2, w * 0.94, plateSize);
  }
  /** The pips of one face, laid out the way a real die lays them out. */
  function pips(ctx, cx, cy, s, n) {
    const d = s * 0.30;
    const spots = {
      1: [[0, 0]],
      2: [[-1, -1], [1, 1]],
      3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    }[n];
    if (!spots) { label(ctx, String(n), cx, cy, s * 1.6, { size: s * 0.9, colour: '#2a2118', weight: '800' }); return; }
    for (const [px, py] of spots) {
      ctx.beginPath(); ctx.arc(cx + px * d, cy + py * d, s * 0.115, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2118'; ctx.fill();
    }
  }

  /**
   * CHANCE - a cast DIE in a shaker cradle. It used to be drawn as a purple creature with two dot
   * eyes, which matched neither the block's name nor its manual (faces, rolls, and a reward that
   * makes a face heavier). A die states the function AND carries the lesson better: the weight
   * bars under it are how LOADED each face is, so a child watches the die stop being fair.
   *
   * Rolling is a 450 ms one-shot: it hops, the face cycles five times, and it settles on the face
   * that was actually drawn. Nothing loops, so it cannot flash.
   */
  function die(ctx, o, live, t) {
    const { x, y, w, h } = o;
    shadow(ctx, x, y, w, h);
    const faces = Math.max(1, live.faces || 2);
    const age = live.rollAge === undefined ? Infinity : live.rollAge;
    const rolling = age < 450;
    const settled = (live.lastFace === null || live.lastFace === undefined) ? 0 : live.lastFace;
    // Mid-tumble the face cycles on a fixed 90 ms step - deterministic, and slow enough to read.
    const shown = live.dieFace !== undefined ? live.dieFace
      : rolling ? (settled + Math.floor(age / 90) + 1) % faces : settled;
    const hop = rolling ? -Math.sin((age / 450) * Math.PI) * h * 0.10 : 0;
    const tilt = rolling ? Math.sin(age / 52) * 0.16 : 0;

    // The cradle it sits in: a steel tray with a lip, so the die has somewhere to land.
    const trayY = y + h * 0.58;
    steelBox(ctx, x + w * 0.10, trayY, w * 0.80, h * 0.10, 4);
    ctx.fillStyle = 'rgba(12,16,21,0.35)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, trayY + h * 0.02, w * 0.24 * (1 - hop / (h * 0.3)), h * 0.03, 0, 0, Math.PI * 2); ctx.fill();

    // The die: a cube in three-quarter view - top face, front face, right face.
    const s = Math.min(w, h) * 0.30;               // half-width of the front face
    const cx = x + w / 2, cy = trayY - s * 0.85 + hop;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt); ctx.translate(-cx, -cy);
    const dep = s * 0.42;                          // how far back the top/right faces run
    // Top face.
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + dep, cy - s - dep);
    ctx.lineTo(cx + s + dep, cy - s - dep); ctx.lineTo(cx + s, cy - s); ctx.closePath();
    ctx.fillStyle = '#fbf3e2'; ctx.fill(); ctx.strokeStyle = '#b9a888'; ctx.stroke();
    // Right face.
    ctx.beginPath();
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s + dep, cy - s - dep);
    ctx.lineTo(cx + s + dep, cy + s - dep); ctx.lineTo(cx + s, cy + s); ctx.closePath();
    ctx.fillStyle = '#cfc2a8'; ctx.fill(); ctx.strokeStyle = '#b9a888'; ctx.stroke();
    // Front face, with a soft corner light so the ivory is not flat.
    const fg = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
    fg.addColorStop(0, '#fffaf0'); fg.addColorStop(1, '#e4d9c2');
    rr(ctx, cx - s, cy - s, s * 2, s * 2, s * 0.22);
    ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = '#9c8c6e'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
    pips(ctx, cx, cy, s, shown + 1);
    ctx.restore();

    // How loaded each face is - the bandit's learning, in the open.
    if (live.weights && live.weights.length) {
      const total = live.weights.reduce((a, b) => a + b, 0) || 1;
      const top = Math.max.apply(null, live.weights);
      live.weights.forEach((wt, i) => {
        const bw = (w - 16) / live.weights.length - 4, bx = x + 8 + i * (bw + 4);
        const bh = Math.max(3, (h * 0.20) * wt / top);
        rr(ctx, bx, y + h * 0.96 - bh, bw, bh, 2);
        ctx.fillStyle = i === live.lastFace ? P.brass : P.steel; ctx.fill();
        label(ctx, Math.round(100 * wt / total) + '%', bx + bw / 2, y + h * 0.96 - bh - 7, bw + 6, { size: 8, colour: P.chalk });
      });
    } else if (live.face) {
      label(ctx, live.face, x + w / 2, y + h * 0.90, w * 0.8, { size: 11, colour: P.chalk, weight: '700' });
    }
    if (o.name) label(ctx, o.name, x + w / 2, y + 9, w, { size: 10, colour: P.chalk });
  }

  /** A conveyor LINK between two item-plane objects (hopper→belt, belt→tower, chute→bin): a
   *  short rail with an S-bend when the ends differ in height. Drawn under the objects. */
  function link(ctx, a, b) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) / 2;
    if (Math.abs(a.y - b.y) < 2) ctx.lineTo(b.x, b.y);
    else ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
    ctx.strokeStyle = P.steelDark; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = P.rubberLight; ctx.lineWidth = 5; ctx.stroke();
    ctx.setLineDash([3, 6]); ctx.strokeStyle = P.steelLight; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  /** A signal CABLE routed like a real one: down/up to a tray line, along it, then to the socket
   *  (orthogonal, rounded corners) — never a bezier across the room. `tray` = the y of its lane.
   *  A lit one wears a layered glow rather than a blur — see the WHY on the stroke itself; it is
   *  the single most expensive thing this file used to draw. */
  /* A cable carries a SIGNAL, so it is teal; a link carries ITEMS, so it is brass. The two
     families never share a colour — the palette states the shape law before any label does. */
  function cable(ctx, from, to, lit, tray, pts) {
    const r = 10;
    const ty = tray === undefined ? Math.min(from.y, to.y) - 30 : tray;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const dir = to.x >= from.x ? 1 : -1;
    if (pts && pts.length >= 2) {
      // The plan's OWN route (task 105: floor-layout's routeCable) — the same points hit-testing
      // and the selection glow read, so what is drawn is exactly what a tap can find. Corners are
      // rounded, never wider than half the shorter leg (a short stub keeps its turn).
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length - 1; k++) {
        const a = pts[k - 1], m = pts[k], c = pts[k + 1];
        const rr2 = Math.min(r, Math.hypot(m.x - a.x, m.y - a.y) / 2, Math.hypot(c.x - m.x, c.y - m.y) / 2);
        ctx.arcTo(m.x, m.y, c.x, c.y, rr2);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    } else if (Math.abs(from.x - to.x) < 2 * r) { ctx.lineTo(to.x, to.y); }
    else {
      ctx.lineTo(from.x, ty + (from.y > ty ? r : -r));
      ctx.arcTo(from.x, ty, from.x + dir * r, ty, r);
      ctx.lineTo(to.x - dir * r, ty);
      ctx.arcTo(to.x, ty, to.x, ty + (to.y > ty ? r : -r), r);
      ctx.lineTo(to.x, to.y);
    }
    // A LIT cable glows teal (a signal is passing); a resting one is dark rubber.
    //
    // THE HALO IS LAYERED STROKES, NOT A shadowBlur (task 5, fix round 2). It used to be
    // `shadowColor teal / shadowBlur = 12` on this one stroke — a Gaussian blur of the whole path.
    // Measured 2026-09-05 on the 360-piece rig: 5.6 ms PER LIT CABLE, 167 ms of a 217 ms frame with
    // the rig's 30-wire harness lit — 77 % of the frame, and the true ceiling behind the workshop's
    // 5 fps and 2.7-of-10 ticks/s at that size (blame ladder in the task-5 report; clipping the
    // draw to the window changed nothing, because the cost is the blur KERNEL, not the path's
    // extent — these paths are ~260 px long). Software raster is not a lab artefact here: a school
    // tablet and headless CI are precisely the machines that rasterise on the CPU.
    //
    // So: three passes of the SAME path — wide and faint, narrower and stronger, then the bright
    // core — which is what a blurred line looks like anyway, for the price of two extra strokes.
    // ONE path for every machine and every cable count: no threshold, no "glow off above N wires"
    // cliff, nothing to configure. The colour and the read are unchanged: a lit wire still
    // obviously carries a signal, which is the block-connection law's own voice.
    //
    // FLASH SAFETY is unchanged by construction: `lit` is the only input either version ever took,
    // every alpha here is a constant, and nothing in this function reads the clock — the halo
    // appears and disappears exactly when the wire does, at exactly the old rate.
    if (lit) {
      ctx.strokeStyle = 'rgba(79,209,197,0.10)'; ctx.lineWidth = 16; ctx.stroke();
      ctx.strokeStyle = 'rgba(79,209,197,0.20)'; ctx.lineWidth = 9; ctx.stroke();
    }
    ctx.strokeStyle = lit ? P.signal : 'rgba(126,148,180,0.62)'; ctx.lineWidth = lit ? 4 : 2.5; ctx.stroke();
    for (const p of [from, to]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = lit ? P.signal : P.steelDark; ctx.fill(); }
    ctx.restore();
  }
  /** A WATCHER'S SIGHTLINE (spec R1/R2): visibly NOT a cable (no tray routing, no glow — it
   *  carries no pulses) and NOT a link (no rubber, no rollers): a faint dashed line of sight,
   *  straight from watcher to watched, with an eye-ring at the watcher's end. A named coupling
   *  is a relationship, and every relationship is DRAWN — that is the whole law.
   *  @param {string} [word]  the Board's own tether (task 4): the watched DIAL's word, painted
   *    riding the line at its midpoint — every other caller (teach→its sense) omits it and gets
   *    the plain sightline unchanged. */
  function tether(ctx, a, b, word) {
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = 'rgba(196, 214, 240, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(a.x, a.y, 6, 0, Math.PI * 2); ctx.stroke();
    if (word) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.save();
      ctx.font = '700 9px' + FAMILY;
      const tw = Math.min(120, Math.max(24, ctx.measureText(word).width + 10));
      ctx.fillStyle = 'rgba(20,26,38,0.78)';
      rr(ctx, mx - tw / 2, my - 8, tw, 16, 4); ctx.fill();
      ctx.restore();
      label(ctx, word, mx, my, tw - 6, { size: 9, colour: P.inkSoft, weight: '700' });
    }
    ctx.restore();
  }

  /**
   * A socket. States, quietest first:
   *   'nub'    — the resting plug: a small brass stud ALWAYS on the object's edge, so the machine
   *              shows where a cable can go before anyone taps anything. This is the affordance;
   *              without it a child has no way to learn that blocks have plugs at all.
   *   'idle'   — the object is under the pointer / selected: the stud grows and names itself.
   *   'offer'  — a cable is half-made and this one FITS. It breathes (2.9 s — flash-safe).
   *   'picked' — the end the cable is coming from.
   *   'hot'    — the finger is close enough that releasing NOW plugs in here.
   * `t` is the shared clock; at t = 0 (reduced motion) the breath sits at its rest value.
   */
  function socket(ctx, s, state, t) {
    if (state === 'nub') {
      // Flush with the edge: machine detail, not UI. Out-plugs are brass pins, in-plugs are holes.
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = s.dir === 'in' ? 'rgba(18,24,31,0.85)' : P.brassDark;
      ctx.fill();
      ctx.strokeStyle = 'rgba(214,168,74,0.55)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
      return;
    }
    const breath = 0.5 + 0.5 * Math.sin((t || 0) / 462);        // 2.9 s period
    const r = state === 'hot' ? 12 : state === 'idle' ? 6 : 9 + (state === 'offer' ? breath * 1.5 : 0);
    if (state === 'offer' || state === 'hot') {
      ctx.save();
      ctx.shadowColor = state === 'hot' ? 'rgba(79,209,197,0.9)' : 'rgba(150,240,247,0.6)';
      ctx.shadowBlur = state === 'hot' ? 16 : 8 + breath * 6;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = state === 'hot' ? P.signal : 'rgba(150,240,247,0.95)'; ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = state === 'picked' ? P.brass : '#fff'; ctx.fill();
    }
    ctx.strokeStyle = state === 'hot' ? '#0b1016' : P.brassDark; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  }

  /**
   * Shade the edges the room continues past. Drawn in SCREEN space (after the pan translate is
   * restored), because it marks the window, not the room.
   *
   * @param {{w:number,h:number}} s     the window
   * @param {{x:number,y:number}} view  where the window sits over the room
   * @param {{w:number,h:number}} world the room
   */
  function edges(ctx, s, view, world) {
    const band = 26;
    const sides = [
      [view.x > 1, 0, 0, band, s.h, 'x', 1],
      [view.x + s.w < world.w - 1, s.w - band, 0, band, s.h, 'x', -1],
      [view.y > 1, 0, 0, s.w, band, 'y', 1],
      [view.y + s.h < world.h - 1, 0, s.h - band, s.w, band, 'y', -1],
    ];
    for (const [on, x, y, w, h, axis, dir] of sides) {
      if (!on) continue;
      const from = dir > 0 ? (axis === 'x' ? [x, y] : [x, y]) : (axis === 'x' ? [x + w, y] : [x, y + h]);
      const to = dir > 0 ? (axis === 'x' ? [x + w, y] : [x, y + h]) : (axis === 'x' ? [x, y] : [x, y]);
      const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
      g.addColorStop(0, 'rgba(12,17,23,0.30)');
      g.addColorStop(1, 'rgba(12,17,23,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  }

  const TAG_H = 16, TAG_GAP = 3, TAG_PAD = 12;
  /**
   * The port WORDS for one block, laid out as a set so no two tags touch.
   *
   * Drawn here rather than in socket() because a tag's place depends on its NEIGHBOURS: two dials
   * on the bottom edge are ~30 px apart and their words are 80–100 px wide, so pin-local placement
   * collides by construction (owner screenshot 2026-08-19: "sure line" over "keep it simple").
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{x:number,y:number,dir:string,word:string,state:string}>} items the VISIBLE words
   * @param {object} o      the placed object the pins belong to (plan.objects[id])
   * @param {{w:number,h:number}} [bounds] the canvas in CSS px, so no tag leaves the room
   */
  function socketTags(ctx, items, o, bounds) {
    ctx.save();
    ctx.font = '700 10px' + FAMILY;
    // Measured, never estimated: the pill is sized to its own text, which is also why the label
    // below can never be ellipsised — it is always given more room than it asked for.
    const tags = items.filter((it) => it.word).map((it) => ({ it: it, w: Math.ceil(ctx.measureText(it.word).width) + 12 }));
    ctx.restore();
    const cols = { in: [], out: [], dial: [] };
    for (const g of tags) cols[g.it.dir === 'in' || g.it.dir === 'item-in' ? 'in' : g.it.dir === 'dial' ? 'dial' : 'out'].push(g);

    // Left (ins) and right (outs): beside their own pin, then a push-DOWN pass — the crowded ones
    // move, the first one never does, so the order still reads top-to-bottom like the pins.
    //
    // A tag CAN land on the block next door — measured 2026-09-01 across all nine galleries at
    // 1280×800: 15 in/out tags overlay a neighbour, in every gallery, the Splitter's four in-tags
    // among them (vision-breaker finding 5). It is not a Splitter bug and it is not fixable by
    // placement: the wall row packs blocks ~12 px apart while these words are 20–120 px wide, so
    // there is nowhere for the pill to go that is not over one machine or the other. Flipping it
    // inward over its OWN face was tried and rejected — it puts "at count" straight through the
    // Counter's own reading (tests/overlap-browser.test.js goes red).
    //
    // The fix that actually holds (2026-09-01, F5): `items` no longer arrives as every non-nub
    // socket of a hovered/selected block — floor.js's paint loop now runs each block's lit sockets
    // through `Layout.tagPorts` first, which keeps at most ONE (the socket the finger is actually
    // on) outside a cable pull. This function never sees the crowd any more, so it never has to
    // dodge it: `items` is 0 or 1 tags almost always, and this whole layout pass degrades to "place
    // the one word" without changing shape. Re-measured after (f5-hover-tag-report.md): 15 → 0
    // neighbour overlaps across the same nine galleries.
    for (const key of ['in', 'out']) {
      const col = cols[key].sort((a, b) => a.it.y - b.it.y);
      let last = -Infinity;
      for (const g of col) {
        g.cy = Math.max(g.it.y, last + TAG_H + TAG_GAP);
        last = g.cy;
        g.x = key === 'in' ? g.it.x - TAG_PAD - g.w : g.it.x + TAG_PAD;
      }
    }
    // Dials sit shoulder to shoulder along the bottom edge, so their tags stack in ROWS clear of
    // the block: each stays centred on its own dial, and a row only takes a tag that clears the
    // one before it. Left to right, so the rows fill the way the pins read.
    //
    // WHICH SIDE: below normally, but ABOVE a block that stands on another one (`o.over` — a
    // reader straddling a belt). The strip under those feet is not empty room, it is the belt's
    // own face, and the belt prints its speed there ("3 /s" under every reader, census 2026-08-19).
    const rowEnd = [];
    const dials = cols.dial.sort((a, b) => a.it.x - b.it.x);
    for (const g of dials) {
      let x = Math.max(o.x - 6, Math.min(g.it.x - g.w / 2, o.x + o.w + 6 - g.w));
      let r = 0;
      while (rowEnd[r] !== undefined && x < rowEnd[r] + TAG_GAP) r++;
      rowEnd[r] = x + g.w;
      g.x = x;
      g.row = r;
    }
    const stack = (up) => (g) => (up
      ? o.y - 10 - g.row * (TAG_H + TAG_GAP)
      : o.y + o.h + 10 + g.row * (TAG_H + TAG_GAP));
    // BELOW, hugging the pins. Flipping a whole block's dials to the far side to dodge something
    // is how they ended up flying: the tag must stay near the pin it names, and the leader below
    // is what carries the rest of the meaning.
    let place = stack(false);
    if (bounds && dials.length) {
      const bot = Math.max.apply(null, dials.map((g) => place(g) + TAG_H / 2));
      if (bot > bounds.h - 2) place = stack(true);       // …unless there is no room at all
    }
    for (const g of dials) g.cy = place(g);
    for (const g of tags) {
      if (bounds) g.x = Math.max(2, Math.min(g.x, bounds.w - g.w - 2));
      // The LEADER first, so the pill covers where it lands: a hairline from the pin to the near
      // edge of its own tag. Without it a pushed-down or stacked tag reads as a word with no owner.
      const dir = g.it.dir === 'item-in' ? 'in' : g.it.dir === 'item-out' ? 'out' : g.it.dir;
      const ex = dir === 'in' ? g.x + g.w : dir === 'dial' ? g.x + g.w / 2 : g.x;
      const ey = dir === 'dial' ? g.cy - TAG_H / 2 : g.cy;
      ctx.save();
      ctx.strokeStyle = g.it.state === 'hot' ? 'rgba(79,209,197,0.9)' : 'rgba(31,41,51,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(g.it.x, g.it.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      rr(ctx, g.x, g.cy - TAG_H / 2, g.w, TAG_H, 4);
      ctx.fillStyle = g.it.state === 'hot' ? 'rgba(11,16,22,0.95)' : 'rgba(31,41,51,0.9)';
      ctx.fill();
      label(ctx, g.it.word, g.x + g.w / 2, g.cy, g.w - 4, { size: 10, colour: '#fff' });
    }
  }

  /**
   * The cable being PULLED: from the picked socket to wherever the finger is. It is deliberately
   * a loose hanging lead — dashed, teal, sagging toward the pointer — so it reads as "not plugged
   * in yet", unlike the laid cables (solid, routed through the tray) that ARE connected.
   */
  function rubber(ctx, from, to) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const dx = to.x - from.x;
    const sag = Math.min(46, Math.abs(dx) * 0.28 + 14);         // a real lead droops between hands
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(from.x + dx * 0.35, from.y + sag, to.x - dx * 0.35, to.y + sag, to.x, to.y);
    ctx.strokeStyle = 'rgba(11,16,22,0.55)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.setLineDash([9, 7]);
    ctx.shadowColor = 'rgba(79,209,197,0.7)'; ctx.shadowBlur = 10;
    ctx.strokeStyle = P.signal; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    // The loose end: a plug the child is holding.
    ctx.beginPath(); ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = P.signal; ctx.fill();
    ctx.strokeStyle = '#0b1016'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  /**
   * An item END — the mouth a belt plugs into. Deliberately NOT `socket()`: a socket is a signal
   * pin (teal plane) and a mouth carries crates (brass plane), and the two planes must never read
   * alike or a child cannot tell which kind of thing they are about to pull. So a mouth is a wide
   * brass ring with a dark throat, the shape of the rail it accepts, sized well above the 3.5 px
   * signal nub.
   * @param {{x:number,y:number,dir:'item-out'|'item-in'}} e the end, from plan.sockets (task 104)
   * @param {'nub'|'idle'|'offer'|'hot'|'picked'} state how loud it is right now
   */
  function itemEnd(ctx, e, state, t) {
    const breath = 0.5 + 0.5 * Math.sin((t || 0) / 462);        // 2.9 s period — flash-safe
    const r = state === 'hot' ? 13 : state === 'nub' ? 5.5 : state === 'idle' ? 7 : 9 + (state === 'offer' ? breath * 1.5 : 0);
    ctx.save();
    if (state === 'offer' || state === 'hot') {
      ctx.shadowColor = state === 'hot' ? 'rgba(255,196,74,0.95)' : 'rgba(214,168,74,0.6)';
      ctx.shadowBlur = state === 'hot' ? 16 : 8 + breath * 6;
    }
    // SQUARE (task 104): the manual's "square plug" — the one shape a belt end is, on both faces.
    rr(ctx, e.x - r, e.y - r, 2 * r, 2 * r, Math.max(1.5, r * 0.25));
    ctx.fillStyle = state === 'hot' ? P.brass : state === 'picked' ? P.brass : state === 'nub' ? P.brassDark : 'rgba(214,168,74,0.9)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#1c242d'; ctx.lineWidth = state === 'nub' ? 1.2 : 2; ctx.stroke();
    // The throat: a mouth is a hole, a plug is solid — the same read as the rail's dark core.
    if ((e.dir === 'in' || e.dir === 'item-in') && state !== 'nub') {
      const q = r * 0.45;
      ctx.fillStyle = '#12181f'; ctx.fillRect(e.x - q, e.y - q, 2 * q, 2 * q);
    }
    ctx.restore();
  }

  /** The BELT a child is holding mid-pull. A rail, not a lead: stiff, brass, treaded — it must
   *  look like the conveyor it is about to become, never like the teal signal cable. */
  function beltLead(ctx, from, to) {
    ctx.save();
    ctx.lineCap = 'round';
    const dx = to.x - from.x;
    const mx = from.x + dx * 0.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    if (Math.abs(from.y - to.y) < 2) ctx.lineTo(to.x, to.y);
    else ctx.bezierCurveTo(mx, from.y, mx, to.y, to.x, to.y);
    ctx.strokeStyle = P.steelDark; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = P.rubberLight; ctx.lineWidth = 5; ctx.stroke();
    ctx.setLineDash([3, 6]); ctx.strokeStyle = P.brass; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.setLineDash([]);
    // The loose end the child is holding.
    ctx.beginPath(); ctx.arc(to.x, to.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = P.brass; ctx.fill();
    ctx.strokeStyle = '#0b1016'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  /** The SELECTED conveyor link (task 104): a steady brass glow along the rail — one-shot, no
   *  flashing. KEEP IN STEP with link() and floor-layout's linkAt() — one curve, three readers. */
  function linkSelected(ctx, a, b) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) / 2;
    if (Math.abs(a.y - b.y) < 2) ctx.lineTo(b.x, b.y);
    else ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
    ctx.strokeStyle = 'rgba(255,196,74,0.55)'; ctx.lineWidth = 16; ctx.stroke();
    ctx.strokeStyle = P.brass; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  /** A conveyor link under the pointer, about to be CUT: the rail reddens and dashes apart.
   *  KEEP IN STEP with link() and floor-layout's linkNear() — one curve, three readers. */
  function linkHot(ctx, a, b) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) / 2;
    if (Math.abs(a.y - b.y) < 2) ctx.lineTo(b.x, b.y);
    else ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
    ctx.shadowColor = 'rgba(226,92,74,0.8)'; ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(226,92,74,0.95)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([5, 7]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }

  function halo(ctx, o, t) {
    const k = 0.5 + 0.5 * Math.sin(t / 510);
    ctx.save(); ctx.strokeStyle = 'rgba(255,190,60,' + (0.5 + 0.4 * k) + ')'; ctx.lineWidth = 4;
    rr(ctx, o.x - 6, o.y - 6, o.w + 12, o.h + 12, 10); ctx.stroke(); ctx.restore();
  }
  function selection(ctx, o) {
    ctx.save(); ctx.strokeStyle = 'rgba(59,130,246,0.9)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    rr(ctx, o.x - 4, o.y - 4, o.w + 8, o.h + 8, 8); ctx.stroke(); ctx.restore();
  }
  /**
   * The marquee a child drags across empty floor to pick more than one piece at once
   * (composing-arc "make your own part", task 4) — the SAME cool dashed blue `selection()` draws
   * around one chosen piece, spread over the box being dragged: a faint fill so an empty box still
   * reads as "something is happening" the instant a finger starts, the familiar dashed line once
   * it has grown enough to show one. `r` is a normalized {x,y,w,h} in ROOM px (floor.js's own
   * normMarquee) — never negative width/height, so this never has to guard a backwards rect.
   */
  function marquee(ctx, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(59,130,246,0.12)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(59,130,246,0.9)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2));
    ctx.restore();
  }

  const DRAW = { feeder: hopper, datafeed: pallet, track: belt, gate, pen, bin, checker, brick: brickBox, carmaker: carmakerBox, reader, camera, microphone: microphoneBox, files: filesBox, splitter: splitterBox, board: boardBox, teach: stamper, sign, frame: frameBox, lamp, noisemaker: horn, speaker: speakerBox, timer: clock, counter: counterBox, filter: relay, window: memoryBox, cloud: relay, send: relay, button, dice: die };

  /** Draw one object (sprite if registered for its kind, else the vector object). */
  /**
   * THE LIT PATH's own dim (task-9 brief, spec §5.3): a flat alpha, never animated — flash safety
   * (AGENTS.md: max 3 flashes/second) and Ruling 3 both say this is a STEADY STATE, not a blink.
   * Dim, not gone: a dimmed block still reads as a real part of the machine, just not the part
   * this crate's route ran through.
   */
  const LIT_PATH_DIM_ALPHA = 0.28;
  function draw(ctx, o, live, t) {
    const dim = !!(live && live.dim);
    if (dim) { ctx.save(); ctx.globalAlpha = LIT_PATH_DIM_ALPHA; }
    const sp = sprites.get(o.kind);
    if (sp && sp.complete) { ctx.drawImage(sp, o.x, o.y, o.w, o.h); }
    else if (['calculate','join','memory'].includes(o.kind)) window.WorkshopCompositionArt.draw(ctx,o,live||{});
    else { const fn = DRAW[o.kind] || relay; fn(ctx, o, live || {}, t || 0); }
    if (dim) ctx.restore();
  }
  /** A shelf miniature: the object drawn small in a box. */
  function icon(ctx, kind, w, h, words) {
    // reader: kept in sync with logic/floor-layout.js FOOT.reader (spec §5.8) — a shelf icon
    // drawn at the old 124x96 aspect would crush the orbit picture it now carries.
    // pen: kept in sync with logic/floor-layout.js FOOT.pen (task B).
    // files: kept in sync with logic/floor-layout.js FOOT.files (task E).
    // splitter: kept in sync with logic/floor-layout.js FOOT.splitter — the shelf icon must
    // show the BAR at the proportions the floor draws it at, or the picture teaches the wrong split.
    // board: kept in sync with logic/floor-layout.js FOOT.board (Plan 3 task 4).
    // speaker/microphone: kept in sync with logic/floor-layout.js FOOT.speaker/microphone
    // (Composing Arc Plan A, task 3) — the wide wall footprint their cascade text needs.
    // frame: kept in sync with logic/floor-layout.js FOOT.frame (Composing Arc Plan C, task 3) —
    // the shelf icon must show the same PORTRAIT-ish opening the floor draws, or the picture
    // teaches the wrong shape of block.
    // brick: kept in sync with logic/floor-layout.js FOOT.brick (composing-arc "make your own
    // part", task 5) — no shelf draws one today (a brick comes from the child's own library, not
    // PALETTE), but the entry exists for the day one does, same sync law as every entry above.
    const f = { calculate: [164, 114], join: [174, 114], memory: [164, 114], feeder: [110, 120], datafeed: [140, 130], track: [150, 54], gate: [92, 116], pen: [90, 100], bin: [84, 96], checker: [250, 210], brick: [176, 132], carmaker: [216, 132], reader: [180, 130], camera: [96, 96], microphone: [176, 104], files: [128, 104], splitter: [176, 104], board: [176, 118], teach: [64, 76], sign: [240, 64], frame: [132, 108], lamp: [64, 84], noisemaker: [84, 84], speaker: [176, 104], timer: [84, 84], counter: [96, 76], filter: [110, 70], window: [116, 78], button: [96, 96], dice: [120, 116] }[kind] || [90, 80];
    const s = Math.min((w - 8) / f[0], (h - 8) / f[1]);
    const ow = f[0] * s, oh = f[1] * s;
    // `lit` is for the LAMP: a shelf icon of an unlit lamp is a grey lens, which tells a child
    // nothing about what the block is for. Only the lamp reads it, so it costs the others nothing.
    draw(ctx, { kind, x: (w - ow) / 2, y: (h - oh) / 2, w: ow, h: oh, name: '', exits: kind === 'gate' ? 2 : 0 }, { words: words || {}, kind: 'labels', items: ['a', 'b'], lit: true, dieFace: 4, passed: true, compact: true }, 0);
  }

  // FAMILY rides the export (task 085) so brain-view-art.js and chart-art.js draw Traditional
  // Chinese in the same faces the belt does, instead of each keeping a stack that drifts.
  /**
   * A SELECTED cable: the routed polyline re-stroked in amber so it reads as "this one" against
   * every lit teal neighbour, with a pill naming each end. Amber, not teal, so selection can never
   * be mistaken for a signal actually passing.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{x:number,y:number}>} pts the cable's polyline (`geom.pts`)
   * @param {string} [nameA] @param {string} [nameB] end labels; omitted for a multi-selection
   */
  function wireSelected(ctx, pts, nameA, nameB) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(232,161,60,0.18)'; ctx.lineWidth = 14; ctx.stroke();
    ctx.strokeStyle = 'rgba(232,161,60,0.55)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = P.warn; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    for (const pair of [[pts[0], nameA], [pts[pts.length - 1], nameB]]) {
      const p = pair[0], word = pair[1];
      if (!word) continue;
      ctx.save(); ctx.font = '700 10px' + FAMILY;
      const w = Math.ceil(ctx.measureText(word).width) + 12;
      ctx.restore();
      rr(ctx, p.x - w / 2, p.y - TAG_H - 6, w, TAG_H, 4);
      ctx.fillStyle = 'rgba(11,16,22,0.95)'; ctx.fill();
      label(ctx, word, p.x, p.y - TAG_H / 2 - 6, w - 4, { size: 10, colour: '#fff' });
    }
  }

  const FloorArt = { draw, icon, room, crate, cratePhoto, cable, wireSelected, link, linkHot, linkSelected, tether, socket, socketTags, edges, itemEnd, rubber, beltLead, halo, selection, marquee, sprites, P, FAMILY, minPx,
    roomGeom, roomKey, // task 092 test seams: the room cache's own pure rules
    laneBar, SEG_INK, // task 108 test seam: the Evaluator lane bar's own segmentation
    crateFaceCount: () => faces.size }; // task 092 test seam: how many crate faces are cached
  if (typeof window !== 'undefined') window.WorkshopFloorArt = FloorArt;
  if (typeof module !== 'undefined' && module.exports) module.exports = FloorArt;
})();
