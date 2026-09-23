'use strict';
/**
 * floor-layout.js — the pure half of the FLOOR (spec 2026-08-19-workshop-floor-design.md): the
 * child's TABLE (pieces · snaps · wires · watchPiece) laid out as real objects in a room, in
 * PIXELS for a given viewport, plus the smart-add rule the picture shelf uses.
 *
 * WHY computed, never dragged: a child adds an object and it lands where a factory would put
 * it — item-plane objects left→right by flow depth (hopper · belts · switch tower · bins),
 * a reader arch OVER the belt it watches, wall devices in the top band, actors (button, pet)
 * in the front strip. No overlap by construction; readable at 1024 and 2800 wide; nothing to
 * mis-drag. Same TABLE model as the Blueprint (card grid) — only the face differs.
 *
 * Pure: no DOM, no state, no randomness. Port tables are passed in (game.js owns them).
 */
(function () {
// Wrapped: classic <script> tags share ONE global scope — a bare `const ITEM_TYPES` here collided
// with stage-layout.js's (SyntaxError, page dead). Everything below is private; the api is exported at the end.
const StageLayout = (typeof require === 'function') ? require('./stage-layout.js') : window.WorkshopStageLayout;

/** Object footprints (px at scale 1) per KIND. kind = type, except feeder+dataset → 'datafeed'
 *  and a sense → 'reader' (arch over a belt). An OFF-TRACK sense draws as the same arch, parked
 *  on the wall until it is mounted — the old 'roomeye' wall-camera card left with room mode
 *  (spec 2026-08-27 §4.3 + owner 2026-08-27: a picture of a sense watching the room promises
 *  exactly what the app no longer does). It still refuses to Run until placed (logic/snap.js). */
const FOOT = {
  calculate:{w:164,h:114}, join:{w:174,h:114}, memory:{w:164,h:114},
  feeder: { w: 110, h: 120 }, datafeed: { w: 140, h: 130 }, track: { w: 132, h: 54 },
  gate: { w: 92, h: 116 },
  // The PEN (task B): a waiting room, modelled on the BIN's idiom — a receptacle you watch fill
  // — since its whole job (like a bin's) is holding a visible pile; unlike a bin it also has a
  // way out, so it earns its own footprint rather than reusing the bin's exactly.
  pen: { w: 90, h: 100 },
  bin: { w: 84, h: 96 }, checker: { w: 250, h: 210 },
  // The face carries a live orbit now, not a word + 3 chips (spec 2026-08-19-workshop-thinking-
  // screen-design §5.2/§5.8) — 124x96 had no room for a legible picture. This is a CONSTANT
  // change, not a layout rewrite: FIT_MIN and the belt slack below already absorb it.
  reader: { w: 180, h: 130 }, teach: { w: 64, h: 76 },
  sign: { w: 240, h: 64 }, lamp: { w: 64, h: 84 }, noisemaker: { w: 84, h: 84 }, timer: { w: 84, h: 84 },
  counter: { w: 96, h: 76 }, filter: { w: 132, h: 86 }, window: { w: 116, h: 78 }, cloud: { w: 100, h: 70 }, send: { w: 100, h: 70 },
  button: { w: 96, h: 96 }, dice: { w: 120, h: 116 },
  // The Camera carries a LIVE VIEWFINDER, and a child needs to see THEMSELVES holding the thing
  // they are showing it (owner, 2026-08-20) — at 96x96 the feed was a thumbnail. Same reasoning as
  // the reader's 124x96 -> 180x130: the picture is the point, so the block gets the room.
  //
  // 132x108 IS A CEILING, MEASURED, NOT A PREFERENCE. A wall block's height comes out of the floor
  // band, and at 1024x768 the floor canvas is only 456px tall — so a taller camera pushes the FRONT
  // strip past the bottom of the canvas and a child can no longer reach a Button to cable it.
  // Verified by running face-browser (which pulls a real cable to a front-strip Button) at each
  // size: 132x108 green, 140x114 red, 150x122 red. Raise it only with that suite, not by eye.
  camera: { w: 196, h: 108 },
  // The FILES block (task E): the camera's sibling for a child's own data — a wall machine (it
  // carries no items; its rows reach the belt only through a wire into a feeder's drop). Same
  // height ceiling reasoning as the camera above: wall heights eat the floor band.
  files: { w: 128, h: 104 },
  // The SPLITTER carries a bar a child has to be able to DRAG accurately, so it is wider than the
  // Files block it stands beside — the same reasoning that gave the camera its viewfinder room.
  // Height stays at the wall ceiling the camera measured (104 ≤ 108): a wall block's height comes
  // out of the floor band, and a taller one pushes the front strip off a 1024x768 canvas.
  splitter: { w: 176, h: 104 },
  // The BOARD (Plan 3 task 3): a record, not a machine part — no item ends, one signal socket.
  // A shade taller than the Splitter it usually stands downstream of: room for a small chart
  // AND its watch/picker row, not just a bar.
  board: { w: 176, h: 118 },
  // THE VOICE PAIR (Composing Arc Plan A, task 3): task-3-brief's own footprint for both — the
  // Splitter's exact wall size (176x104), room enough for a name plate AND an honest sentence
  // that can run to a few words without being squeezed to nothing.
  speaker: { w: 176, h: 104 }, microphone: { w: 176, h: 104 },
  // THE FRAME (Composing Arc Plan C, task 3): a picture box — the one wall block whose whole face
  // IS an image, so unlike the Splitter/Speaker (which only need a caption's worth of room) it
  // takes the FULL wall HEIGHT the camera's own probe established. 108 is a CEILING, not a
  // preference: see FOOT.camera above — 108 green, 114 red, verified by face-browser at 1024x768,
  // because a taller wall block pushes the FRONT strip past the bottom of the canvas and a child
  // can no longer reach a Button to cable it. The WIDTH is this block's own choice (the camera is
  // 196 wide, and nothing about that number applies here): 132 holds a 56x56 thumbnail plus its
  // caption and name plate with air around them, and a wider box would only stretch empty steel
  // around a fixed-size picture. Widen it only with the state-2 band measurements in
  // floor-art.js's frameBox, which are taken against this width.
  frame: { w: 132, h: 108 },
  // THE BRICK (composing-arc "make your own part", task 5): a made part joins the belt like a
  // bin or a checker — it is ITEM-plane, not a wall device (see ITEM_TYPES below) — so it needs
  // the room a real machine-in-a-box wants, not a caption's worth. 176 wide matches the Board/
  // Splitter/voice-pair family (a name plate that will not be squeezed); 132 tall is the
  // checker's own middle ground between a plain bin (96) and the checker's full scoreboard
  // (210) — a sealed part shows no scoreboard of its own, only its name, so it never needed the
  // checker's height.
  brick: { w: 176, h: 132 },
  // THE CAR MAKER (car-galleries task 11): a free-standing machine that BUILDS a car crate from two
  // dials and puts it on the belt when `go` fires — item-plane, so its footprint comes out of the
  // FLOOR band (the feeder's + brick's own band), never the wall-height budget the camera measured.
  // 216 WIDE is the host's own `widthOf('carmaker')` (game.js), so the block's card and its floor
  // picture share one width and a dial is never squeezed below its label; 132 tall matches the
  // Brick/datafeed family — room for a car preview, two dial knobs that clear a fingertip, and the
  // name plate, without rivaling the checker's full scoreboard.
  carmaker: { w: 216, h: 132 },
};
// The smallest a block may be drawn. Below this its name plate cannot hold a word: a bin at
// scale 0.42 is 35 px wide with 26 px of label room, and "Not sure" needs 30 px at the smallest
// type label() will draw (probe 2026-08-19, 1024x768 — where the floor canvas is only 456 tall
// because the shelf takes the rest). At 0.7 a bin is 59 px with 48 px of room: ~11 px type.
// Hitting this floor means the plan outgrows the viewport, which is what panning is for.
const FIT_MIN = 0.7;
// THE BIG BOARD (worldW task 1): how much wider than the window the hall is AT LEAST drawn — a
// floor, not a max (FIT_MIN overflow still grows it past this) — so a child has real room to
// spread a build out before FIT_MIN ever has to bite. Read at floorPlan's own `worldW` declaration
// for the placement/zoom split this enables.
const BOARD_X = 2.5;
// THE BRICK joins the item plane (composing-arc task 5): a made part can carry items straight
// through it (its own v1 port rule ports only wires and belts — see logic/brick.js's own doc),
// so it belongs in the factory line beside a bin or a checker, never on the wall. A brick with no
// single item in-port (addBrickTarget, below) still lands here — uncoupled, at its own depth-0
// column — exactly as an unconnected bin does today; ITEM_TYPES decides WHERE a piece is drawn,
// never whether it happens to be wired to anything yet.
// THE CAR MAKER joins them (car-galleries task 11) as an item SOURCE: a `go` builds a car crate
// onto a track, so it is the START of a flow exactly as a feeder is — ITEM-plane, on the belt line.
const ITEM_TYPES = ['feeder', 'track', 'gate', 'pen', 'bin', 'checker', 'brick', 'carmaker'];
// A Camera hangs on the wall (off the belt line) like any other wall device: it captures, it
// does not carry items, so it earns no place in ITEM_TYPES or FRONT_TYPES (spec 2026-08-19 §4).
// The Files block (task E) hangs beside it for the same reason: it eats files and speaks rows
// down a wire — it never carries an item itself.
// The Splitter joins them: it holds no items at all, it only divides ROWS and speaks them down a
// wire, so it hangs on the wall beside the Files block that feeds it.
// The BOARD (Plan 3 task 3) joins them for the same reason: it holds no items, it only records
// a chart off a wire — a wall device, not a belt part.
// THE VOICE PAIR (Composing Arc Plan A, task 3) joins them too: the Speaker is spoken TO (a
// signal wires into `say`), the Microphone is spoken to AND speaks back (`listen`/`heard`) — like
// the Camera, neither ever carries an item, so both hang on the wall.
// THE FRAME (Composing Arc Plan C, task 3) joins them by the same rule: it is a SINK on the signal
// plane (engine.js IN_PORTS.frame = ['show'], no out-ports) — it holds the example a reading named
// and never touches an item, exactly the Board's own standing one plane over.
const WALL_TYPES = ['calculate', 'join', 'memory', 'sign', 'lamp', 'noisemaker', 'timer', 'counter', 'filter', 'window', 'cloud', 'send', 'camera', 'files', 'splitter', 'board', 'speaker', 'microphone', 'frame'];
const FRONT_TYPES = ['button', 'dice'];

/** The kind an object is drawn as. Pure. */
function kindOf(p) {
  // task D: a feeder wearing an UPLOADED table (p.table) is a Data feed too, footprint and all —
  // the same rule game.js's own kindOf keeps (see that function's doc).
  if (p.type === 'feeder') return (p.dataset || p.table) ? 'datafeed' : 'feeder';
  // Mounted or not, a sense/teach is the SAME object — off-track it parks on the wall (below)
  // instead of drawing as the old room-mode wall camera, which promised a room-reading the app
  // no longer performs (owner, 2026-08-27).
  if (p.type === 'sense') return 'reader';
  if (p.type === 'teach') return 'teach';
  // A brick (composing-arc task 5) is its OWN kind, 'brick' — it needs no special case here: it
  // is not a feeder wearing a dataset, not a sense/teach that can be off-track, so it falls
  // straight through to the plain `return p.type` below, same as every other ordinary block.
  return p.type;
}
// A brick's face is per-INSTANCE (its def's own ports), not per-type, so its box cannot be the
// constant every other block's is: edgeSlots spreads N sockets evenly down the edge, so six down a
// 132 px edge sit 19 px apart — under the 44 px touch floor this product keeps everywhere else.
// `piece` is optional: every caller with no piece in hand (footprint('reader')) keeps the per-kind
// answer.
//
// THE HONEST GUARANTEE — two pinned points, not one (fix round 1: a lone-brick-on-an-empty-table
// test cannot see the second). The drawn gap between adjacent sockets is `PORT_PITCH * scale`
// (`edgeSlots` spreads N sockets at (i+1)/(N+1) down an edge built to `PORT_PITCH*(N+1)`, so the
// PITCH is exactly what survives the division), and `scale` (below, `Math.max(FIT_MIN, ...)`) is
// clamped at TWO different floors depending on how crowded the room is:
//   - alone on an uncrowded floor, `scale` tracks `zoom`, which floors at 0.9  → 49*0.9  = 44.1 px
//   - sharing a busy column, `scale` floors at FIT_MIN (0.7)                  → 49*0.7  = 34.3 px
// 49 is 44/0.9 rounded up — it buys the FIRST floor with a hair to spare. It does NOT buy the
// second, and cannot: raising PORT_PITCH only grows this same function's own `busiest+1` box,
// which raises `needH` (the column-height reducer below), which pushes `scale` further DOWN via
// `floorH / needH` — the crowded-regime gap is `PORT_PITCH * floorH/needH`, bounded above by
// `floorH/(busiest+1)`, a term PORT_PITCH cancels out of entirely. The only way to lift the 34.3 px
// floor is to give crowded columns more room (a bigger FIT_MIN, or a needH exemption) — a real,
// deliberate layout change, not a constant to nudge. See
// 'the crowded-column floor: PORT_PITCH * FIT_MIN is the honest floor, pinned' in
// tests/floor-layout.test.js, which pins 34.3 px so this floor cannot silently drop further.
const PORT_PITCH = 49;
function footprint(kind, piece) {
  const base = FOOT[kind] || { w: 90, h: 80 };
  if (kind !== 'brick' || !piece || !piece.def) return base;
  let ins = 0, outs = 0;
  for (const q of piece.def.ports || []) { if (q.dir === 'in') ins++; else outs++; }
  const busiest = Math.max(ins, outs, 1);
  return { w: base.w, h: Math.max(base.h, PORT_PITCH * (busiest + 1)) };
}

/**
 * Spread one edge's sockets (task 104). `sig` = round signal socket names in order; `items` =
 * square belt ends, each with the fraction `at` its art links at. No squares → the old even
 * spread (i+1)/(n+1). No rounds → each square keeps its own link point. Both → n+m even slots;
 * each square takes the free slot nearest its link point, the rounds fill the rest in order.
 * Pure. @returns {{sig:Object<string,number>, item:Object<string,number>}} fractions of the edge
 */
function edgeSlots(sig, items) {
  const out = { sig: {}, item: {} };
  if (!items.length) { sig.forEach((n, i) => { out.sig[n] = (i + 1) / (sig.length + 1); }); return out; }
  if (!sig.length) { for (const it of items) out.item[it.name] = it.at; return out; }
  const m = sig.length + items.length;
  const free = Array.from({ length: m }, (_, j) => (j + 1) / (m + 1));
  for (const it of items) {
    let best = 0;
    for (let j = 1; j < free.length; j++) if (Math.abs(free[j] - it.at) < Math.abs(free[best] - it.at)) best = j;
    out.item[it.name] = free.splice(best, 1)[0];
  }
  sig.forEach((n, i) => { out.sig[n] = free[i]; });
  return out;
}

/**
 * Lay the table out for a viewport.
 * @param {{pieces:Array, snaps:Array, wires:Array}} table
 * @param {{w:number, h:number, ports?:{out:Object,in:Object,dials:Object,dialsFor?:function,outsFor?:function,insFor?:function}}} opts
 *   size in px; ports = SIG_OUT / SIG_IN / dial names per type. `dialsFor(piece)` overrides the
 *   per-type dial list when the host supplies it — a sense only gets the diamonds its worn brain
 *   actually reads. `outsFor(piece)` does the same for the OUT sockets — a sense only gets the
 *   `nearest` socket when its worn brain can name a real stored example. `insFor(piece)` is
 *   outsFor's own missing twin (composing-arc task 5): a BRICK's signal IN-ports are per-PIECE
 *   too (its own def.ports, not a type-wide list — a made part's shape is whatever the child
 *   sealed inside it), so `ports.in[type]` alone can never be right for one. All three overrides
 *   are optional; a caller that supplies none of them (older tests, a host with no bricks) keeps
 *   reading the plain per-type `ports.in`/`ports.out`/`ports.dials` maps, unchanged.
 * @returns {{objects:Object, belts:Array, cables:Array, wall:string[], front:string[], sockets:Object, bands:Object, scale:number, roomMachine:boolean}}
 *   objects: id → {id, type, kind, name, x, y, w, h, cx, cy, over?, exits?} (x,y = top-left px)
 */
function floorPlan(table, opts) {
  const W = Math.max(320, (opts && opts.w) || 1024), H = Math.max(240, (opts && opts.h) || 768);
  const ports = (opts && opts.ports) || { out: {}, in: {}, dials: {} };
  const pieces = table.pieces || [];
  const byId = {};
  for (const p of pieces) byId[p.id] = p;
  const objects = {};

  // ---- bands: wall (top) · floor (middle) · front (bottom) — empty bands collapse.
  const itemPieces = pieces.filter((p) => ITEM_TYPES.includes(p.type));
  const roomMachine = itemPieces.length === 0;
  // An UNMOUNTED sense/teach (no watchPiece yet) parks on the wall rail like a part on a shelf —
  // its plate + Blueprint row carry the "drag me onto a track" warning, and Run refuses it
  // honestly (logic/snap.js). Counting it here (not just via the stray rule) lets the wall band
  // size itself to the arch, so the parked part is never squeezed or clipped.
  const unmounted = (p) => (p.type === 'sense' || p.type === 'teach') && !p.watchPiece;
  const wallPieces = pieces.filter((p) => WALL_TYPES.includes(p.type) || unmounted(p));
  const frontPieces = pieces.filter((p) => FRONT_TYPES.includes(p.type));
  const readerPieces = pieces.filter((p) => (p.type === 'sense' || p.type === 'teach') && p.watchPiece && byId[p.watchPiece]);
  // ROOM ZOOM: how big the hall is drawn. A 1100x760 room draws objects at their base size; a
  // 2800-wide window draws the same machine ~1.8x bigger instead of stranding it in empty floor.
  // Everything that follows multiplies by it (gaps, bands, arch headroom), so the composition is
  // the same picture at every size — and the fit caps below still bound it, so no overlap and
  // nothing leaves the room.
  //
  // THE `min` IS LOAD-BEARING — DO NOT LET WIDTH LIFT THIS (tried and reverted 2026-08-27).
  // On the school tablet (a 2560x1600 Xiaomi reports a 1280x800 CSS viewport) the height ratio
  // wins and floors to 0.9, so 1.16 of width is discarded and the machine draws at laptop size in
  // a hall 256px wider. Letting width lift the zoom to 1.0 DOES make the blocks bigger — and it
  // pushes the FRONT strip's sockets past the bottom of the canvas, so a child can no longer pull
  // a cable from a Button. Reproduced by face-browser's "LIVE k dial" test at 1280x900: green at
  // 0.9, red at 1.0 ("the wire was laid" fails, status stays "Added Button"). Same hazard the
  // camera's 132x108 ceiling above documents. Growing blocks on a SHORT room costs reachability;
  // buy the height back from the chrome (styles.css) instead, or move the front strip out of the
  // band model first. face-browser is the gate — a pure "sockets stay inside H" assertion would be
  // WRONG, because a tall machine's bottom sockets legitimately sit outside the canvas already
  // (recycle: socket y 529 in a 464-tall laptop floor) and the Floor pans to them.
  const zoom = Math.max(0.9, Math.min(2.0, Math.min(W / 1100, H / 760)));
  // Bands are sized to what hangs in them (a lone marquee does not deserve a third of the room).
  const tallest = (list) => list.reduce((m, p) => Math.max(m, footprint(kindOf(p), p).h), 0);
  const wallH = wallPieces.length ? Math.min(0.28 * H, (tallest(wallPieces) + 28) * zoom) : 0;
  const frontH = frontPieces.length ? Math.min(roomMachine ? 0.4 * H : 0.22 * H, (tallest(frontPieces) * (roomMachine ? 1.5 : 1) + 24) * zoom) : 0;
  const bands = { wall: { y: 0, h: wallH }, floor: { y: wallH, h: H - wallH - frontH }, front: { y: H - frontH, h: frontH } };

  // ---- the item plane: stagePlan's flow depth + column order, then pixels.
  const stage = StageLayout.stagePlan({ pieces: itemPieces, snaps: table.snaps || [] });
  const cols = stage.cols || 1;
  const margin = 24 * zoom;
  // THE BIG BOARD: placement lays out on the WORLD, so the hall is wide; zoom and the bands (above)
  // keep answering to the WINDOW, so blocks stay tablet-true and the front strip stays reachable —
  // the "THE `min` IS LOAD-BEARING" ROOM ZOOM law above is exactly why this can never be `W * zoom`
  // or any other window-derived number. `worldW` is a floor, not a target: FIT_MIN overflow (below)
  // still grows the room past it when a build genuinely needs more.
  // FIX ROUND 3, F1: the board floor is a FLOOR-VIEW concern — a machine that PANS. A FIT-TO-VIEW
  // caller (brick-panel.js's own small floor: never pans, shrinks the whole picture to fit instead,
  // spec doc at fitScale's own declaration) has no window to pan; the 2.5x floor only ever pushed
  // fitScale down to its own saturated 0.4, quartering a sealed part's picture for no reason (a
  // green-suites-blind-to-the-look bug: fitScale's hit-testing divides by the SAME shrunk scale, so
  // nothing failed, only the child's own eyes would have caught it). `opts.board === false` opts
  // out — worldW falls back to the window itself, exactly the pre-big-board formula. The main
  // floor passes nothing, so its own default (the board floor, unchanged) still applies.
  const worldW = opts && opts.board === false ? W : Math.max(W * BOARD_X, W);
  // THE LEFT START (owner 2026-09-08, "all the set up of gallery start from leftmost"): a laid-out
  // machine BEGINS at the hall's left end and every spare pixel of the wide board runs RIGHT —
  // open building room, not symmetric dead space around a centred machine. ONE helper so the item
  // plane (`acc`, and `acc2`'s belt re-place) and every wall/front row share the same anchor. A
  // FIT-TO-VIEW caller (`board: false` — brick-panel.js's small floor, which has no pan to spend
  // spare room on) keeps the centred pre-big-board picture: for it the two laws draw the same
  // machine, and centring is what a porthole portrait wants.
  const lineStart = (span) => margin + (opts && opts.board === false
    ? Math.max(0, (worldW - 2 * margin - span) / 2) : 0);
  const perCol = {};
  for (const id of Object.keys(stage.nodes)) {
    const n = stage.nodes[id];
    const col = Math.round(n.x * cols - 0.5);
    (perCol[col] = perCol[col] || []).push(n);
  }
  // Which track pieces carry a MOUNTED reader (task 3/B: a latch gate's file-spot and quiz-spot
  // belts each read independently) — built once, read by both the column-width and
  // column-row-height fixes below.
  const readerBelts = new Set(readerPieces.map((p) => p.watchPiece));
  // Columns are PACKED (a factory line, not a stretch across the hall), each as wide as its
  // widest object plus a gap, and the line is centred; if the room is still too narrow the
  // whole line scales down together (never overlap). A column whose track carries a mounted
  // reader must be at least as wide as the ARCH (180px), not just the belt (132px) — the arch is
  // centred on the same cx as its belt (the `onBelt` loop below), so a narrower column lets
  // neighbouring arches bleed into each other even when their own tracks do not touch (task 3/B:
  // two independently-read belts, e.g. a latch gate's file-spot and quiz-spot lanes, sit in
  // adjacent columns).
  const GAP = 44;
  const colWidths = [];
  for (let c = 0; c < cols; c++) {
    colWidths.push(Math.max(60, ...(perCol[c] || []).map((n) => {
      const w = footprint(kindOf(byId[n.id]), byId[n.id]).w;
      return readerBelts.has(n.id) ? Math.max(w, footprint('reader').w) : w;
    })) + GAP);
  }
  const lineW = colWidths.reduce((a, b) => a + b, 0);
  // Grow to the room's zoom, but never past what the width can hold (that cap is what keeps
  // columns from overlapping — objects scale by `scale`, which is never more than `scaleX`).
  const scaleX = Math.min(zoom, (worldW - 2 * margin) / Math.max(1, lineW));
  // `sx` is scaleX with the legibility floor under it: columns are SPACED at the size the objects
  // are actually drawn, so flooring the scale moves them apart instead of overlapping them. The
  // line may then run past the right wall — that is the room growing, and the Floor pans to it.
  const sx = Math.max(scaleX, FIT_MIN);
  const colLeft = [];
  let acc = lineStart(lineW * sx);
  for (const cw of colWidths) { colLeft.push(acc); acc += cw * sx; }
  // A reader arch stands over its belt: keep headroom above the item row for the arch.
  const archRoom = readerPieces.length ? footprint('reader').h * zoom + 8 : 0;
  const floorTop = bands.floor.y + 16 * zoom + archRoom, floorH = Math.max(40, bands.floor.h - 32 * zoom - archRoom);
  // …and down together when a column (four bins) is taller than the floor: one uniform scale.
  let needH = 1;
  for (const col of Object.keys(perCol)) needH = Math.max(needH, perCol[col].reduce((acc, n) => acc + footprint(kindOf(byId[n.id]), byId[n.id]).h, 0) + 8 * (perCol[col].length - 1));
  // …but never below FIT_MIN. `scale <= sx` still holds either way, so columns cannot collide.
  const scale = Math.max(FIT_MIN, Math.min(scaleX, floorH / needH));
  // THE BELTS ABSORB THE SLACK. Every object has a fixed footprint except a conveyor, whose length
  // is free — so any width the packed line leaves over is handed to the belt columns and the line
  // spans the hall. (Without this the machine sat in the middle of 1400px of empty floor.) Widening
  // happens INSIDE each column's own width, so nothing can overlap: the columns simply move apart.
  const beltCols = [];
  for (const c of Object.keys(perCol)) {
    if (perCol[c].length && perCol[c].every((n) => kindOf(byId[n.id]) === 'track')) beltCols.push(Number(c));
  }
  const extraW = {};
  if (beltCols.length) {
    // SLACK STAYS ON `W` — CENTERING IS NOT SIZING (fix round 1, F1: a three-way probe the
    // shipped two-way A/B missed). `slack` feeds `share`, which feeds `extraW`, which is added
    // straight into a belt's DRAWN width below — a SIZING term, not a placement one. Bound it to
    // `worldW` and every belt's 560*scale stretch cap saturates: measured, the sorter's belts drew
    // 200px -> 644px and its whole span ran 938px -> 2448px inside a 1024 window (7 of 10
    // galleries wider than their own window) — the child can no longer see the machine they just
    // built, which defeats the feature this task exists to serve. A belt spanning the wider hall
    // would be a real, deliberate LOOK change (it needs its own cap, and the owner's word) — never
    // a rider smuggled in on a centering fix.
    const slack = Math.max(0, (W - 2 * margin) - lineW * sx);
    // Cap each belt's stretch so a two-block machine does not become one absurd 2000px conveyor.
    const share = Math.min(slack / beltCols.length, 560 * scale);
    for (const c of beltCols) { extraW[c] = share; colWidths[c] += share / sx; }
    // Re-place the columns now that the belt columns are wider — through the SAME `lineStart`
    // anchor `acc` above used: this block (which runs whenever ANY column is belt-only — the
    // common case, a lone conveyor in its own column) unconditionally rebuilds colLeft from
    // scratch, so any other formula here would silently overwrite the anchored line `acc` just
    // produced, undoing the placement law for most real machines.
    const lineW2 = colWidths.reduce((a, b) => a + b, 0);
    colLeft.length = 0;
    let acc2 = lineStart(lineW2 * sx);
    for (const cw of colWidths) { colLeft.push(acc2); acc2 += cw * sx; }
  }
  // Tallest object in each column, at the scale it will be drawn: the minimum pitch its rows can
  // take without touching. A column whose SIBLING rows each carry their own mounted reader (a
  // latch gate's file-spot and quiz-spot lanes running side by side, task 3/B) needs room for an arch ABOVE
  // every row, not just the tallest object's own footprint — else row 2's arch overlaps row 1's
  // belt. Harmless everywhere else: a single-row column never reads colRowH for its cy (below).
  // (readerBelts is built once, above, alongside the column-WIDTH fix this pairs with.)
  const colRowH = {};
  for (const col of Object.keys(perCol)) {
    const tall = perCol[col].reduce((m, node) => Math.max(m, footprint(kindOf(byId[node.id]), byId[node.id]).h), 0);
    const needsArch = perCol[col].some((node) => readerBelts.has(node.id));
    colRowH[col] = (needsArch ? tall + footprint('reader').h + 8 : tall) * scale + 10 * zoom;
  }
  for (const col of Object.keys(perCol)) {
    const list = perCol[col].slice().sort((a, b) => a.y - b.y);
    const n = list.length;
    list.forEach((node, i) => {
      const p = byId[node.id];
      const kind = kindOf(p);
      const f = footprint(kind, p);
      const w = f.w * scale + (extraW[col] || 0), h = f.h * scale;
      // Rows share the floor height — but never closer than the objects are TALL. Once the scale
      // hits FIT_MIN the column needs more height than the band has, and an even share would draw
      // the bins through each other.
      const rowH = Math.max(floorH / n, colRowH[col]);
      // A lone object sits a little above centre (the belt line reads better with more floor in
      // front of it than behind); a column of bins shares the height evenly.
      const cy = n === 1 ? floorTop + floorH * 0.42 : floorTop + rowH * (i + 0.5);
      const cx = colLeft[Number(col)] + colWidths[Number(col)] * sx / 2;
      objects[p.id] = { id: p.id, type: p.type, kind, name: p.name || '', x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, exits: node.exits || 0 };
    });
  }

  // A dragged belt / hopper / tower / bin sits where the child put it (own position first, so a
  // reader placed "over its belt" below follows the belt).
  for (const p of itemPieces) {
    const o = objects[p.id];
    if (!o || !Number.isFinite(p.fx) || !Number.isFinite(p.fy)) continue;
    // NO UPPER CLAMP: a drag past the edge is the child MAKING ROOM, not an error to correct
    // (owner 2026-08-20 "it should be like blueprint... many many room"). floor.js's `at()` hands
    // us WORLD coords, so fx > 1 is a real place; `world` at the end of this fn grows to contain
    // it and the Floor pans there. The LOWER bound stays — pan clamps at 0, so anything left of or
    // above the origin would be unreachable. Saved builds all have fx/fy in 0..1: unaffected.
    o.cx = Math.max(o.w / 2, p.fx * W);
    o.cy = Math.max(o.h / 2, p.fy * H);
    o.x = o.cx - o.w / 2; o.y = o.cy - o.h / 2;
    o.placed = true;
  }
  // ---- readers over their belts (several on one belt fan out sideways).
  const onBelt = {};
  for (const p of readerPieces) (onBelt[p.watchPiece] = onBelt[p.watchPiece] || []).push(p);
  for (const beltId of Object.keys(onBelt)) {
    const belt = objects[beltId];
    const list = onBelt[beltId];
    list.forEach((p, i) => {
      const kind = kindOf(p);
      const f = footprint(kind, p);
      const w = f.w * scale, h = f.h * scale;
      const spread = list.length > 1 ? (i - (list.length - 1) / 2) * (w + 8) : 0;
      const cx = belt.cx + spread;
      const cy = belt.cy - h / 2 - 6; // the arch's feet stand on the belt line
      objects[p.id] = { id: p.id, type: p.type, kind, name: p.name || '', x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, over: beltId };
    });
  }

  // ---- wall / front bands: left→right in blueprint x order (the author's / the child's add
  // order) — EXCEPT a block that FEEDS one already on the floor, which hangs OVER the thing it
  // feeds instead of floating in a centred decorative row.
  //
  // WHY (owner, 2026-08-29, looking at the ice-cream stand: "File block is there but it isnt
  // connected anything"): the wire was never missing — ic_src:row → ic_feed:drop has been in
  // `cables` all along. The ROW CENTRED ITSELF, so with only three wall pieces in a 2800-wide hall
  // the Files block landed at cx 1051 while its feeder sat at cx 186, and the cable drew as a
  // hairline across the entire room. The block-connection law is not "a wire exists" — it is that
  // the relationship is VISIBLE; an invisible coupling reads as a broken machine. The whole point
  // of this arc is that SOURCES ARE MACHINES wired into the Feeder: if the wire is not legible,
  // the grammar is not taught. ONE rule for every block, never a `files` special case — the
  // recycle / grouper / pose / watchdog Cameras drop over their own feeders by the same rule, and
  // a block that feeds nothing keeps today's placement to the pixel. `anchorCx` below states
  // exactly which blocks qualify, and why a relay deliberately does not.
  const MIN_AIR = 12; // the hair of air a scaled-down row already leaves between two blocks

  /**
   * The cx a block wants to hang over, or null to leave it in the flowed row.
   *
   * A block anchors only when it is a SOURCE: something wires OUT of it into a block already
   * standing on the floor, and NOTHING wires into it. That is the shape the owner's complaint is
   * about — a Files block or a Camera whose entire relationship to the machine is the one cable it
   * speaks down. A RELAY in the middle of a signal chain (an Only-if reading a sense and switching
   * a gate, a Counter fed by a feeder) has a wire at BOTH ends, so hanging it over one target only
   * moves the long wire to the other end — and, measured, it also dragged the recycle sorter's
   * three Only-ifs across the hall to the gate and pushed the wall row 250 px off the right edge,
   * which is not more legible, it is off screen. This is a rule about the SHAPE of a block's
   * wiring, never about its type: no `files` special case exists or is wanted.
   *
   * The target is the FIRST outgoing wire's, in author order — never an average over several.
   * dl_src feeds dl_feed AND releases dl_pen, and the midpoint of those two is the empty middle of
   * the room, which is precisely the spot the owner read as "connected to nothing".
   *
   * ONE NAMED EXCEPTION (task 4 fix round 1, IMPORTANT 4): a SPLITTER is spoken to (a Files block
   * wires into its `in`) and speaks (it wires into a Feeder's `drop`) — a relay by the rule above,
   * and Files→Splitter→Feeder is now the ice-cream stand's whole wall/floor seam. Excluding it
   * the way an Only-if is excluded would leave the Splitter — and the Files block feeding IT —
   * both adrift in the flowed row, exactly the "connected to nothing" bug this law exists to fix,
   * just moved one hop upstream. So `splitter` alone is exempted from "spoken to → never anchor":
   * it still anchors over whatever ITS OWN first outgoing wire targets. Anything feeding a
   * splitter whose target is not yet placed follows that ONE extra hop through it to the solid
   * object at the far end, so both the Splitter and its Files source resolve to the SAME anchor
   * (the Feeder) and cluster over it exactly as two sources feeding one machine already do. The
   * exemption is scoped to the type `splitter`, not to "anything with a wire at both ends" — an
   * Only-if or a Counter still refuses to anchor, unchanged, so commit 1c8b800's fix stays fixed.
   *
   * Only the item plane and the reader arches exist when the wall row is laid out (the front strip
   * additionally sees the wall), so a wire into a block not yet placed finds nothing and leaves it
   * unanchored — placement can only follow something already standing somewhere (or, for a
   * splitter target specifically, the one hop past it described above).
   */
  const anchorCx = (p) => {
    let out = null;
    const relayOK = p.type === 'splitter';
    for (const w of (table.wires || [])) {
      if (!w || !w.from || !w.to) continue;
      if (!relayOK && w.to.block === p.id) return null;             // spoken to: a relay, not a source
      if (out !== null || w.from.block !== p.id) continue;
      if (objects[w.to.block]) { out = objects[w.to.block].cx; continue; }
      // The target itself may be an unplaced SPLITTER (Files → Splitter → Feeder): follow its
      // own first outgoing wire ONE hop further to whatever solid object stands at the far end.
      const target = byId[w.to.block];
      if (!target || target.type !== 'splitter') continue;
      for (const w2 of (table.wires || [])) {
        if (!w2 || !w2.from || !w2.to || w2.from.block !== target.id || !objects[w2.to.block]) continue;
        out = objects[w2.to.block].cx;
        break;
      }
    }
    return out;
  };

  const placeRow = (list, band, ids, boost, anchored) => {
    if (!list.length) return;
    const sorted = list.slice().sort((a, b) => (a.x || 0) - (b.x || 0) || String(a.id).localeCompare(String(b.id)));
    let s = boost || 1; // room machines draw their few objects BIG
    const total = sorted.reduce((acc, p) => acc + footprint(kindOf(p), p).w, 0) * s;
    const gap = Math.max(12, Math.min(40, (worldW - 2 * margin - total) / Math.max(1, sorted.length - 1)));
    // THE FIT_MIN LAW, extended to the bands (measured 2026-09-05 at 1280x800: 30 wall blocks
    // drew 15.3px wide, 110 drew NEGATIVE -1.4px — a name plate that cannot hold a letter, then
    // geometry that is not geometry). The item plane has had the answer since 2026-08-20: an
    // object never shrinks past FIT_MIN; a row that then cannot fit simply RUNS PAST the right
    // wall, floorPlan's world pass grows to contain it, and the Floor pans there — the room
    // getting bigger, not the blocks getting fake. The centring below already clamps at the
    // margin, and the anchored-cluster sweep is overflow-friendly by construction.
    if (total + gap * (sorted.length - 1) > worldW - 2 * margin) {
      s = Math.max(s * ((worldW - 2 * margin - 12 * (sorted.length - 1)) / total), FIT_MIN);
    }
    // Anchor the row through the SAME `lineStart` as the item plane's own `acc` above (the
    // left-start law; centred only for a board:false fit-to-view caller): this flowed pass runs
    // FIRST and is otherwise unchanged — it is the placement every unanchored block keeps, and
    // the row's scale-down still bounds it.
    let x = lineStart(total * (s / (boost || 1)) + gap * (sorted.length - 1));
    const slots = sorted.map((p, i) => {
      const kind = kindOf(p);
      const f = footprint(kind, p);
      const slot = { p, kind, i, w: f.w * s, h: Math.min(f.h * s, band.h - 12), x, anchor: anchored ? anchorCx(p) : null };
      x += slot.w + (s < 1 ? 12 : gap);
      return slot;
    });
    if (slots.some((slot) => slot.anchor !== null)) {
      // CLUSTERS, not loose blocks. Sources feeding the SAME machine hang over it shoulder to
      // shoulder as ONE rigid unit, centred on it: two sources into one feeder must BOTH read as
      // wired, so neither may take the spot alone. Everything else is a cluster of one.
      // (Sweeping loose blocks instead let an unanchored Sign wedge itself between two blocks that
      // feed the same machine and shunt the rest of the row off the wall — measured, not feared.)
      const clusters = [], byAnchor = new Map();
      for (const slot of slots) {
        const key = slot.anchor === null ? null : String(slot.anchor);
        let c = key === null ? null : byAnchor.get(key);
        if (!c) { c = { members: [], x: slot.x, i: slot.i, anchor: slot.anchor }; clusters.push(c); if (key !== null) byAnchor.set(key, c); }
        c.members.push(slot);
      }
      for (const c of clusters) {
        c.w = c.members.reduce((acc, slot) => acc + slot.w, 0) + MIN_AIR * (c.members.length - 1);
        // The left bound is the row's own margin (pan clamps at 0, so anything further left is
        // unreachable). There is deliberately NO right bound: a machine the child dragged out past
        // the wall takes its source with it, and `world` below grows to hold them both so the
        // Floor pans there — the same law the drag path has kept since 2026-08-20.
        if (c.anchor !== null) c.x = Math.max(margin, c.anchor - c.w / 2);
      }
      // ANCHORS ARE LAW, FLOW IS CONVENIENCE (left-start fix, 2026-09-08): rows now FLOW from the
      // hall's left end, so a loose block can flow INTO the spot an anchored cluster must hold
      // (measured at 2800 wide: a loose lamp flowed to x 568 while a two-source pair wanted 674 —
      // the old single want-x sweep then shoved the PAIR 436px off its own feeder, breaking the
      // visible-coupling law the anchor exists for; under the old world-centred flow the loose
      // blocks always flowed far right of any window-fraction anchor, so the case never arose).
      // So: anchored clusters place FIRST and never move for a loose block — they resolve only
      // among THEMSELVES, with the same left→right push as before (two machines close together
      // still fan their sources rightward, deterministically). Loose blocks then keep their
      // flowed spot unless it overlaps a placed anchor — hopping just past it, never the other
      // way round. A row with nothing anchored never enters this branch at all, which is what
      // keeps today's placement byte-identical for every block that feeds nothing.
      const anchoredCs = clusters.filter((c) => c.anchor !== null).sort((a, b) => a.x - b.x || a.i - b.i);
      for (let k = 1; k < anchoredCs.length; k++) {
        anchoredCs[k].x = Math.max(anchoredCs[k].x, anchoredCs[k - 1].x + anchoredCs[k - 1].w + MIN_AIR);
      }
      const looseCs = clusters.filter((c) => c.anchor === null).sort((a, b) => a.x - b.x || a.i - b.i);
      let cursor = -Infinity;
      for (const c of looseCs) {
        c.x = Math.max(c.x, cursor);
        // anchoredCs is left→right sorted, so one pass suffices: each hop lands right of the
        // interval it hit, and only later (further-right) intervals can still collide.
        for (const f of anchoredCs) {
          if (c.x < f.x + f.w + MIN_AIR && c.x + c.w + MIN_AIR > f.x) c.x = f.x + f.w + MIN_AIR;
        }
        cursor = c.x + c.w + MIN_AIR;
      }
      clusters.sort((a, b) => a.x - b.x || a.i - b.i);
      slots.length = 0;
      for (const c of clusters) { let cx = c.x; for (const slot of c.members) { slot.x = cx; cx += slot.w + MIN_AIR; slots.push(slot); } }
    }
    const cy = band.y + band.h / 2;
    for (const slot of slots) {
      objects[slot.p.id] = { id: slot.p.id, type: slot.p.type, kind: slot.kind, name: slot.p.name || '', x: slot.x, y: cy - slot.h / 2, w: slot.w, h: slot.h, cx: slot.x + slot.w / 2, cy };
      ids.push(slot.p.id);
    }
  };
  const wall = [], front = [];
  placeRow(wallPieces, bands.wall, wall, zoom, true);
  // A floor that outgrew its band pushes the front band down rather than being drawn through it.
  const floorBottom = Object.keys(objects).reduce((m, id) => Math.max(m, objects[id].y + objects[id].h), 0);
  if (frontH && floorBottom + 12 * zoom > bands.front.y) bands.front.y = floorBottom + 12 * zoom;
  // …AND THE STRIP KEEPS WHATEVER HEIGHT IS LEFT (vision-breaker 2026-09-02, finding 2). The push
  // above is a shove with no floor under it: on the ice-cream stand at 1024x768 it moved the
  // front band to y=379 in a 461-tall canvas and then handed it its full 101 px anyway, so three
  // act Buttons the on-screen hint tells the child to press ran to y=473 — off the bottom of the
  // room, reachable only by panning, on the very first screen. placeRow already sizes an actor to
  // `band.h - 12`, so simply telling the band the truth about its room shrinks the Buttons to fit
  // instead of walking them off the canvas. The 48 px floor keeps a squeezed Button a real
  // tap target (ui-ux-common's 44 px minimum) — past that the room genuinely is bigger than the
  // window, which is what panning is for, and nothing here pretends otherwise.
  if (frontH) bands.front.h = Math.max(48, Math.min(bands.front.h, H - bands.front.y));
  // The front strip anchors by the SAME rule: a Button under the timer it presses is the same
  // legible coupling, and moving an actor sideways inside the strip costs it no thumb reach.
  placeRow(frontPieces, bands.front, front, (roomMachine ? 1.5 : 1) * zoom, true);
  // Anything unplaced (unknown type, or a reader whose belt vanished) lands on the wall so it is never invisible.
  const stray = pieces.filter((p) => !objects[p.id]);
  if (stray.length) placeRow(stray, bands.wall.h ? bands.wall : { y: 0, h: 120 }, wall, 1, true);

  // ---- the child's OWN positions win: a dragged object stays where it was put (fx/fy = fractions
  // of the room, so a build survives a resize). The computed layout is only the default.
  for (const p of pieces) {
    const o = objects[p.id];
    if (!o || !Number.isFinite(p.fx) || !Number.isFinite(p.fy)) continue;
    // NO UPPER CLAMP: a drag past the edge is the child MAKING ROOM, not an error to correct
    // (owner 2026-08-20 "it should be like blueprint... many many room"). floor.js's `at()` hands
    // us WORLD coords, so fx > 1 is a real place; `world` at the end of this fn grows to contain
    // it and the Floor pans there. The LOWER bound stays — pan clamps at 0, so anything left of or
    // above the origin would be unreachable. Saved builds all have fx/fy in 0..1: unaffected.
    o.cx = Math.max(o.w / 2, p.fx * W);
    o.cy = Math.max(o.h / 2, p.fy * H);
    o.x = o.cx - o.w / 2; o.y = o.cy - o.h / 2;
    o.placed = true;
  }
  // Session geometry is resolved before sockets/routes, so all ink and hit tests agree.
  for (const p of pieces) {
    const ref = opts && opts.reference && opts.reference[p.id], o = objects[p.id];
    if (!ref || !o) continue;
    const moved = p.fx !== ref.fx || p.fy !== ref.fy;
    const cx = moved && Number.isFinite(p.fx) ? p.fx * W : ref.cx;
    const cy = moved && Number.isFinite(p.fy) ? p.fy * H : ref.cy;
    Object.assign(o, { w: ref.w, h: ref.h, cx, cy, x: cx - ref.w / 2, y: cy - ref.h / 2 });
  }
  // Belts as line segments (for crates + drawing): each track's own span — after any drag.
  const belts = itemPieces.filter((p) => p.type === 'track').map((p) => { const o = objects[p.id]; return { id: p.id, x1: o.x, x2: o.x + o.w, y: o.cy }; });

  // ---- sockets: outs on the right edge, ins on the left, dials along the bottom.
  // BELT ends (task 104) are SQUARE sockets (dir 'item-out' / 'item-in') the Floor pulls belts
  // from, exactly like a cable. Each has a link point the object's art implies (the hopper's
  // spout, a gate's exit row, a bin's open top); where a square shares an edge with round signal
  // sockets, edgeSlots spreads them all evenly and the square takes the slot nearest its link
  // point — so the two never sit on top of each other. Squares only appear when the host supplies
  // `itemFor` (older callers and their tests see exactly the old socket lists).
  const outAnchorFrac = (o, end, outs) => {
    if (o.type === 'gate') { const k = outs.indexOf(end) + 1; return (k - 0.5) / outs.length; }
    if (o.kind === 'feeder' || o.kind === 'datafeed') return 0.74;
    return outs.length > 1 ? (outs.indexOf(end) + 0.5) / outs.length : 0.5;
  };
  const sockets = {};
  for (const p of pieces) {
    const o = objects[p.id];
    if (!o) continue;
    const list = [];
    const belt = ports.itemFor ? ports.itemFor(p) : { ins: [], outs: [] };
    // Per-PIECE when the host offers it — the same seam `dialsFor` opened a few lines down, for the
    // same law: a sense's `nearest` out-port exists only where the worn brain can name a real
    // stored example, so a per-type list would draw a socket under every Model and invite a child
    // to pull a cable nothing will ever come down. Falls back to the per-type list for every caller
    // that supplies no outsFor (tests, older saves).
    const outs = (ports.outsFor ? ports.outsFor(p) : (ports.out[p.type] || []));
    const outY = edgeSlots(outs, belt.outs.map((end) => ({ name: end, at: outAnchorFrac(o, end, belt.outs) })));
    outs.forEach((port) => list.push({ port, dir: 'out', x: o.x + o.w, y: o.y + o.h * outY.sig[port] }));
    // `insFor` is outsFor's own twin, one side over (composing-arc task 5): a BRICK's signal
    // in-ports are per-PIECE (its own def.ports), exactly like a sense's out-ports are per-brain
    // — a per-TYPE table has no row for a type whose sockets differ piece to piece. Optional, so
    // every older caller (tests, a host with no bricks yet) keeps reading the per-type list.
    let ins = (ports.insFor ? ports.insFor(p) : (ports.in[p.type] || []).slice());
    // Sorter AND latch (task B): the per-way switch1..N sockets — a latch shares the sorter's
    // dynamic exit shape, so it shares this socket rule too, never a bespoke one.
    if (p.type === 'gate' && ((p.mode || 'sorter') === 'sorter' || p.mode === 'latch')) { ins = []; const n = Math.min(6, Math.max(2, p.exits || 2)); for (let k = 1; k <= n; k++) ins.push('switch' + k); }
    // A Pen's ONE real in-socket (release) comes straight from `ports.in.pen` above — no
    // special-casing needed; the dying Split gate's own override lived here and is gone with it.
    // A BIN is open at the TOP — its square sits there, clear of every rim socket.
    const topIns = p.type === 'bin' ? belt.ins : [];
    const sideIns = belt.ins.filter((end) => !topIns.includes(end));
    const inY = edgeSlots(ins, sideIns.map((end, i) => ({ name: end, at: sideIns.length > 1 ? (i + 0.5) / sideIns.length : 0.5 })));
    ins.forEach((port) => list.push({ port, dir: 'in', x: o.x, y: o.y + o.h * inY.sig[port] }));
    // Per-PIECE when the host offers it: a sense's dials depend on the brain it wears, so a
    // Linear Regression Model must not be given a `k` diamond it cannot read. Falls back to the
    // per-type list for every caller that does not supply dialsFor (tests, older saves).
    const dials = (ports.dialsFor ? ports.dialsFor(p) : (ports.dials[p.type] || []));
    dials.forEach((port, i) => list.push({ port: 'dial:' + port, dir: 'dial', x: o.x + o.w * ((i + 1) / (dials.length + 1)), y: o.y + o.h }));
    belt.outs.forEach((end) => list.push({ port: end, dir: 'item-out', x: o.x + o.w, y: o.y + o.h * outY.item[end] }));
    sideIns.forEach((end) => list.push({ port: end, dir: 'item-in', x: o.x, y: o.y + o.h * inY.item[end] }));
    topIns.forEach((end, i) => list.push({ port: end, dir: 'item-in', x: o.x + o.w * ((i + 1) / (topIns.length + 1)), y: o.y + o.h * 0.26 }));
    sockets[p.id] = list;
  }
  // Cables resolve SIGNAL sockets only — a signal port and a belt end may share a name ('in').
  const at = (id, port) => (sockets[id] || []).find((s) => s.port === port && s.dir !== 'item-out' && s.dir !== 'item-in') || null;
  const trayBase = (bands.wall.h ? bands.wall.h : bands.floor.y) + 14;
  const boxes = Object.keys(objects).map((id) => objects[id]);
  const cables = (table.wires || []).map((w, i) => {
    const a = at(w.from.block, w.from.port), b = at(w.to.block, w.to.port);
    if (!a || !b) return null;
    const trayLane = trayBase + (i % 8) * 7;
    const from = { id: w.from.block, port: w.from.port, x: a.x, y: a.y };
    const to = { id: w.to.block, port: w.to.port, x: b.x, y: b.y };
    // Task 105: WALL-TO-WALL cables keep the tray under the wall rail (their ends hang right by
    // it); every other cable takes the short way round (routeCable). Owner 09-18: a front-strip
    // Button cabled to a Feeder climbed the whole room to that one lane and fell back down.
    const onWall = (y) => bands.wall.h > 0 && y < bands.floor.y;
    const routed = onWall(from.y) && onWall(to.y)
      ? { pts: [from, { x: from.x, y: trayLane }, { x: to.x, y: trayLane }, to], tray: trayLane }
      : routeCable(from, a.dir, to, b.dir, boxes, [bands.floor.y, bands.front.y, trayLane], i, scale);
    const pts = routed.pts, tray = routed.tray;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { index: i, id: w.id || null, from, to, geom: { pts, aabb: { x0, y0, x1, y1 }, tray } };
  }).filter(Boolean);

  // Item-plane edges (couplings), drawn SOCKET TO SOCKET when the host gave belt ends (task 104):
  // the conveyor link lands in the very square the child plugged it into. Without itemFor, the
  // same link points the squares would have taken (older callers).
  const itemAt = (id, dir, end) => (sockets[id] || []).find((q) => q.dir === dir && q.port === end) || null;
  const fallbackOut = (o, end) => {
    if (o.type === 'gate') { const n = Math.max(1, o.exits || 1); const k = Math.max(1, Number(String(end).replace('exit', '')) || 1); return { x: o.x + o.w, y: o.y + o.h * ((k - 0.5) / n) }; }
    if (o.kind === 'feeder' || o.kind === 'datafeed') return { x: o.x + o.w * 0.98, y: o.y + o.h * 0.74 };
    return { x: o.x + o.w, y: o.cy };
  };
  const fallbackIn = (o) => {
    if (o.type === 'bin') return { x: o.cx, y: o.y + o.h * 0.26 };
    return { x: o.x, y: o.cy };
  };
  const links = (table.snaps || []).map((sn) => {
    const a = objects[sn.from.piece], b = objects[sn.to.piece];
    if (!a || !b) return null;
    const sa = itemAt(sn.from.piece, 'item-out', sn.from.end), sb = itemAt(sn.to.piece, 'item-in', sn.to.end);
    return { from: sn.from.piece, to: sn.to.piece, end: sn.from.end, toEnd: sn.to.end,
      a: sa ? { x: sa.x, y: sa.y } : fallbackOut(a, sn.from.end), b: sb ? { x: sb.x, y: sb.y } : fallbackIn(b) };
  }).filter(Boolean);
  // The room the Floor can pan over: the WORLD floor (worldW, task 1's big board), or the machine's
  // own extent when it is bigger still (objects stopped shrinking at FIT_MIN). Vertically there is
  // no such floor — H is it, unless an object overflows it. Socket tags hang ~34 px below a block,
  // so the bottom margin clears them — panning to the edge must not cut a word off.
  const world = { w: Math.max(worldW, W), h: H };
  for (const id of Object.keys(objects)) {
    const o = objects[id];
    world.w = Math.max(world.w, o.x + o.w + margin);
    world.h = Math.max(world.h, o.y + o.h + 34 + margin);
  }
  return { objects, belts, cables, links, wall, front, sockets, bands, scale, roomMachine, world };
}

/** Placement is visual only. Adding a block never chooses a connection or a watched track.
 * Retain the result shape for shelf callers; existing saved edges are never changed.
 * @returns {{couple:null, watchPiece:null, candidates:Array, where:string}}
 */
function addTarget(table, type) {
  const where = ITEM_TYPES.includes(type) ? 'line' : FRONT_TYPES.includes(type) ? 'front' : 'wall';
  return { couple: null, watchPiece: null, candidates: [], where };
}

/** Reusing a part preserves its internal design, but never connects its external ports.
 * @returns {{couple:null, watchPiece:null, candidates:Array, where:string}}
 */
function addBrickTarget(table, def) {
  return { couple: null, watchPiece: null, candidates: [], where: 'line' };
}

/** Do two placed objects overlap (touching edges do not)? Pure. */
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * THE CULL PAD, in room px — how far outside the window a box still counts as visible.
 *
 * WHY 64: a block's ink is not its box. The widest overhang is the socket TAG, which hangs ~34 px
 * below the bottom edge (the same number floorPlan's own `world.h` margin uses, and the one
 * socketTags in floor-art.js draws to). Next is the lit cable's halo — three passes of one path,
 * the widest a 16 px stroke, so it bulges 8 px each side of the wire's centre line (this used to
 * read "a 12 px shadowBlur"; fix round 2 replaced the blur with layered strokes, and the number
 * moved). Then an 'offer' socket ring, which grows to r 12 with a glow on top, and the selection
 * box, drawn outside the rim. 64 clears every one of those with room to spare, so nothing can pop
 * at the edge of the window while a child pans — and it is still ~5 % of a 1280 px window, i.e. it
 * costs the cull almost nothing.
 */
const VIEW_PAD = 64;

/**
 * Is this box worth DRAWING at this view? The whole of the Floor's view culling, in one pure rule.
 *
 * WHY it exists (vision-breaker 2026-09-05, Drive 3): `paint()` drew every object, socket, link
 * and cable every RAF frame. At 360 pieces the room is 4519x9363 against a 1280x560 window — about
 * 1/58th of it on screen — and painting all 58/58ths cost 6 fps AND starved the engine's own
 * setInterval to 2.3 of its dialled 10 ticks/s, so the child's belts said "10 /s" and delivered
 * a quarter of it. This is DRAW-ONLY: hit-testing, hover, the plan, the pan clamps and every piece
 * of state still see the whole room, exactly as before. Cull the ink, never the machine.
 *
 * When the world fits the window (the ordinary case, and every gallery example) `view` is the whole
 * room and this returns true for everything — a provable no-op, pinned by its own test.
 *
 * @param {{x:number, y:number, w?:number, h?:number}} box  in ROOM px (w/h default 0, so a point works)
 * @param {{x:number, y:number, w:number, h:number, pad?:number}} view  the window over the room; `pad`
 *   overrides VIEW_PAD (0 = the bare rect, for a caller that has already allowed for its own ink)
 * @returns {boolean}
 */
function inView(box, view) {
  const pad = Number.isFinite(view.pad) ? view.pad : VIEW_PAD;
  return box.x <= view.x + view.w + pad
    && box.x + (box.w || 0) >= view.x - pad
    && box.y <= view.y + view.h + pad
    && box.y + (box.h || 0) >= view.y - pad;
}

/**
 * The bounding box of a set of points — how a LINK or a CABLE asks `inView` about itself.
 *
 * A link's bezier control points are (mid, a.y) and (mid, b.y), so the curve never leaves the box
 * of its two ends. A CABLE does: it is routed orthogonally through a TRAY lane, so its own tray y
 * must be passed in as a third point, or a cable whose two ends are both off screen would be culled
 * while the long run across the window is the very thing being drawn.
 *
 * @param {Array<{x:number,y:number}>} pts
 * @returns {{x:number, y:number, w:number, h:number}}
 */
function spanBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The reader arch's FACE, decomposed into three bands (spec 2026-08-19-workshop-thinking-screen-
 * design.md §5.2, re-proportioned after the owner's screenshot review — a plate anchored from its
 * TOP at h*0.78 sitting 1px from a tag centred at h*0.9 collided at every scale (tablet, laptop,
 * ~2800 wide), and a 3:1 orbit box wasted all its width on a circle sized off the SHORT side,
 * radius ~20px at tablet scale). Both constants lived as magic numbers inside floor-art.js's
 * `reader()` draw function, where no test could see them — that is WHY this shipped broken.
 * Pulling them out here, as pure geometry, is what lets a node test assert "no band overlaps
 * another, none escapes the arch" at every scale the Floor actually renders at, instead of that
 * only being checkable by eye.
 *
 * Three bands, stacked top to bottom with a fixed gap between each — the gap alone guarantees no
 * overlap BY CONSTRUCTION (band[n+1].y = band[n].y + band[n].h + gap, always > band[n]'s bottom
 * edge), and the bands' heights are computed to sum to exactly `h` (the LAST band absorbs
 * whatever remains), which guarantees none escapes the bottom. `inset` keeps every band inside
 * the arch's left/right edges the same way:
 *   - `word`  — a COMPACT single reading line at the top (owner: "the crate on the belt already
 *     carries its own label and the expanded panel repeats it — this is the least valuable use
 *     of the space" — it no longer gets its own 28%-tall screen band).
 *   - `orbit` — the brain's live picture, ~65% of the arch's height (owner: "the algorithm is
 *     the lesson, so it gets the room"), centred between the word and name bands.
 *   - `name`  — ONE merged line for the object's name + its mounted brain ("Sorter · Memory
 *     brain"), replacing the separate plate + tag that collided.
 * @param {number} w  the arch's RENDERED width (already scaled — FOOT.reader.w * plan.scale)
 * @param {number} h  the arch's RENDERED height
 * @returns {{word:{x:number,y:number,w:number,h:number}, orbit:{x:number,y:number,w:number,h:number}, name:{x:number,y:number,w:number,h:number}}}
 */
function readerFace(w, h) {
  const inset = Math.min(6, w * 0.04);   // side margin — small and scale-safe (FIT_MIN 0.7 -> ~5px)
  const gap = Math.max(1, h * 0.02);     // a positive gap between every pair of bands, always > 0

  // THE ARCH'S STRUCTURE, not decoration drawn over the content. It used to be: beam across
  // 0.28..0.40h and the lit panel starting at 0.40h, while the picture band began at 0.14h — so
  // the orbit was correctly inside the ARCH and still landed on top of the steelwork, by 21px at
  // tablet and 54px on a wide desk (owner, 2026-08-20: "still overflow"). The beam now sits ABOVE
  // the picture and the panel starts under it, so "inside the arch" and "inside the drawable
  // panel" are the same statement.
  const beamY = h * 0.05, beamH = h * 0.11;
  const panelY = beamY + beamH + gap;
  const panel = { x: 12, y: panelY, w: Math.max(0, w - 24), h: h - panelY };
  const legY = beamY + beamH * 0.8;      // legs hang from the beam's underside to the belt line

  // The READING WORD BAND IS GONE (owner, 2026-08-20: "it is doing sign block jobs"). The Display
  // block exists to say what a model read; an arch repeating it spent 14% of its height competing
  // with a block the child wired on purpose. That height is now the picture's.
  const nameH = Math.max(12, h * 0.17);
  const bw = Math.max(0, w - inset * 2);
  const orbitY = panelY + gap;
  return {
    beam: { x: 0, y: beamY, w: w, h: beamH },
    legs: { y: legY, h: Math.max(0, h - legY) },
    panel: panel,
    orbit: { x: 14, y: orbitY, w: Math.max(0, w - 28), h: Math.max(0, (h - nameH) - orbitY - gap) },
    name: { x: inset, y: h - nameH, w: bw, h: nameH },
  };
}

/**
 * The Board's own face (Plan 3 fix round 1, Escalation B; fix round 2, MAJOR finding — the
 * fingertip): a name-plate HEADER band on top and the CHART below it — `floor-art.js`'s
 * `boardBox()` reads its layout from this function instead of repeating the literals inline, and
 * `floor.js`'s own `isBoardFaceTap` tests against the identical `chart` rectangle — so a tap can
 * never disagree with what the child sees drawn, the readerFace precedent's own law, applied to
 * the Board.
 *
 * THE HEADER IS THE ONLY FLOOR-REACHABLE ROUTE to a placed Board's Delete/rename/cable — unlike
 * the reader's orbit (surrounded on every side by steelwork with no tappable "elsewhere"), so it
 * must be a REAL tap target, not merely a proportion. Fix round 2 (vision-breaker MAJOR, measured
 * live): at a real placed footprint (158.4×106.2px), the plain `h*0.27` split gave a 28.7px-tall
 * header with ZERO forgiveness at the seam — an 8px fingertip drift in EITHER direction flipped
 * the routing outcome, and the header itself was already thinner than a realistic fingertip
 * contact patch (commonly cited 40–57px). `headerH` now floors at 44px (the same touch-target
 * `socketNear`'s own comment cites: "a child's fingertip covers ~40px") — the SAME units `w`/`h`
 * arrive in (this function is scale-agnostic; whatever real on-screen px `boardBox`/
 * `isBoardFaceTap` pass in is what the 44px floor is measured against), so a room shrunk to
 * `FIT_MIN` gets an EVEN BIGGER proportional header than a room at 1:1, never a smaller one. The
 * chart's own bottom boundary (`h*0.92`) is unchanged — the header simply eats more of the box
 * when `h*0.27` alone would not clear the floor, which only happens on a genuinely small block.
 * @param {number} w · @param {number} h  the Board's own footprint, in whatever px unit the
 *   caller already scaled it to (floor-layout's own objects are real on-screen px; the unit tests
 *   multiply `FOOT.board` by a scale factor first, exactly as `readerFace`'s own tests do)
 * @returns {{header:{x:number,y:number,w:number,h:number}, chart:{x:number,y:number,w:number,h:number}}}
 */
function boardFace(w, h) {
  const headerH = Math.min(h, Math.max(h * 0.27, 44));
  return {
    header: { x: 0, y: 0, w: w, h: headerH },
    chart: { x: 8, y: headerH, w: Math.max(0, w - 16), h: Math.max(0, h * 0.92 - headerH) },
  };
}

/**
 * The sealed part's own "peek" window (composing-arc task 6; fix round 1, MAJOR 1 — the ≥44px
 * touch-target law, boardFace's own 44px header floor applied to a CIRCLE). A brick has nothing
 * like the reader's orbit or the Board's chart to split a tap by — it is one closed case — so this
 * is NOT "the whole box is the face" (that would swallow brick-floor-browser.test.js's own
 * centre-tap poke case, task 5's law that a plain tap still pokes+opens the plate, and task 4's
 * hold-to-pick gesture, neither of which this task may touch). Instead it is a SMALL, honestly-
 * drawn porthole set near the TOP of the case, well clear of the object's own geometric centre
 * (`o.cx`/`o.cy`, exactly `w/2, h/2` — the seam's own midpoint too, since its inset is symmetric on
 * every side), which is where every existing poke/plate test already taps.
 *
 * TWO RADII, same law the socket rings already keep (a drawn ~16px nub, a ~20-46px grab/snap
 * radius): `r` is what floor-art.js's `brickPorthole` actually PAINTS (grown modestly this round,
 * still reads as a small window, never the whole case); `acceptR` is the invisible FORGIVENESS
 * radius `floor.js`'s `isBrickFaceTap` tests against — `>= r` always, sized so its own DIAMETER
 * clears 44px at native scale and never drops below ~31px at FIT_MIN (fix round 1's own measured
 * failure: the old single-radius porthole was 24.2px/20px in diameter with zero forgiveness).
 *
 * THE INVARIANT (must hold at every scale, forever, computed fresh from `cy`/`h` — never a fixed
 * constant that could quietly stop holding as the OTHER numbers here change): `acceptR` is capped
 * at `safeR`, the exact distance from the porthole's own centre to the box's TRUE centre, less a
 * 1px clearance — the accept region can shrink to fit a tiny render, but it can never widen past
 * that line, which is what keeps Task 5's centre-tap poke case untouched no matter how generous
 * the forgiveness radius gets elsewhere.
 *
 * @param {number} w · @param {number} h  the brick's own rendered footprint
 * @returns {{seam:{x:number,y:number,w:number,h:number},
 *   porthole:{cx:number,cy:number,r:number,acceptR:number}}}
 *   `porthole` offsets are relative to the object's own x/y, exactly like readerFace's `orbit` and
 *   boardFace's `chart`.
 */
function brickFace(w, h) {
  const inset = Math.min(11, w * 0.06, h * 0.08); // brickBox's own inset, verbatim
  const seam = { x: inset * 1.7, y: inset * 1.7, w: Math.max(0, w - inset * 3.4), h: Math.max(0, h - inset * 3.4) };
  // The DRAWN radius — grown modestly this round (was `max(10, minSide*0.14)`; a real forgiveness
  // radius now sits invisibly outside it, so the visible window itself only needed to grow a
  // little, not to the full touch-target size — a circle that LOOKS as big as its own tap region
  // would stop reading as "a small window", the one honest thing about a sealed part's face).
  const r = Math.max(12, h * 0.11);
  // Positioned just clear of the seam's own top edge (never the seam's own vertical middle, which
  // is where the box's true centre already sits) — a few px of breathing room, not a fraction of
  // the seam's height, so the accept radius below keeps the most room the geometry can honestly
  // give it.
  const cy = seam.y + r + 4;
  const safeR = Math.max(0, h / 2 - cy - 1);
  // The FORGIVENESS radius: >=16px floor, ~19% of h — solved once against FOOT.brick's own
  // 176x132 (h*0.19 = 25.08 -> 50.2px diameter at native scale) and FIT_MIN's 0.7 scale (h*0.19 =
  // 17.56 -> 35.1px diameter) to clear 44px/~31px with real margin, then capped at `safeR` so the
  // invariant above holds at every OTHER scale too, not just these two pinned points.
  const acceptR = Math.min(Math.max(r, h * 0.19, 16), safeR);
  return { seam, porthole: { cx: seam.x + seam.w / 2, cy, r, acceptR } };
}

/**
 * THE CAR MAKER'S FACE — the one geometry `floor-art.js` PAINTS and `floor.js` HIT-TESTS, exactly
 * as `barHandles`/`boardFace` serve the Splitter and the Board. A P5 child must read the block
 * instantly as "a thing that makes a car with two dials", so the face is three stacked bands:
 *   - `car`  — the car being built, a preview across the top.
 *   - `dials` — TWO knobs (power, weight), the block's two hero controls. Each carries a drawn `r`
 *     and an invisible `acceptR` finger-forgiveness radius, the same nub-vs-grab split every socket
 *     keeps (floor.js hit-tests `acceptR` so a tap never misses a knob a child can plainly see).
 *   - `name` — the stamped name plate along the bottom.
 * Offsets are relative to the object's own top-left, like readerFace/boardFace/brickFace.
 * @param {number} w · @param {number} h  the block's rendered footprint (px)
 * @returns {{car:{x,y,w,h}, name:{x,y,w,h}, dials:Array<{prop:string,cx:number,cy:number,r:number,acceptR:number}>}}
 */
function carmakerFace(w, h) {
  const inset = Math.min(10, w * 0.06, h * 0.08);
  const nameH = Math.max(14, h * 0.20);
  const name = { x: inset, y: h - nameH - 2, w: Math.max(0, w - inset * 2), h: nameH };
  const car = { x: inset + 2, y: h * 0.06, w: Math.max(0, w - (inset + 2) * 2), h: Math.max(0, h * 0.26) };
  const bandTop = car.y + car.h + 2, bandBot = name.y - 2;
  const bandH = Math.max(1, bandBot - bandTop);
  const r = Math.max(10, Math.min(bandH * 0.46, w * 0.12));
  const cy = bandTop + bandH / 2;
  // Centres only ever FARTHER apart than the knobs are wide (2.4r > 2r), so the two circles can
  // never overlap at any scale — the layout test pins it rather than trusting the constant.
  const dx = Math.max(r * 2.4, w * 0.24);
  const dial = (prop, cx) => ({ prop, cx, cy, r, acceptR: r + 4 });
  return { car, name, dials: [dial('power', w / 2 - dx / 2), dial('weight', w / 2 + dx / 2)] };
}

/**
 * Which of the Car Maker's two knobs is under this point — nearest-wins within `acceptR`, or null
 * (the block's own body, where a tap still opens the plate). Pure, so the knob a child sees drawn
 * and the knob a finger turns can never disagree.
 * @param {{x:number,y:number,w:number,h:number}} o  the placed object (room px)
 * @param {number} x @param {number} y  the finger (room px)
 * @returns {{prop:string}|null}
 */
function carmakerDialAt(o, x, y) {
  if (!o) return null;
  const face = carmakerFace(o.w, o.h);
  let best = null;
  for (const d of face.dials) {
    const dist = Math.hypot(x - (o.x + d.cx), y - (o.y + d.cy));
    if (dist <= d.acceptR && (!best || dist < best.dist)) best = { prop: d.prop, dist };
  }
  return best ? { prop: best.prop } : null;
}

/**
 * One TAP of a dial: advance `v` by `step`, WRAPPING to the far end so a child can always reach
 * every value with taps alone (the tap-always-works law — no control may need a drag to move). The
 * wrap is deliberate: a dial is a knob, and a knob that stops dead at its maximum is a knob half
 * the children then cannot turn back. Pure.
 * @param {number} v  the current value
 * @param {number} min @param {number} max  the dial's C3 range
 * @param {number} step  the tap's notch (see carmakerNotch)
 * @returns {number}
 */
function carmakerDialStep(v, min, max, step) {
  const next = v + step;
  if (next > max) return min;
  return next;
}

/**
 * A dial's tap notch: a twentieth of its range, at least 1 — so a tap visibly moves a small-range
 * dial (target, 0..50) and does not crawl across a wide one (weight, 1000..7000). Pure.
 * @param {number} min @param {number} max  the dial's C3 range
 * @returns {number}
 */
function carmakerNotch(min, max) {
  return Math.max(1, Math.round((max - min) / 20));
}

/**
 * The socket NEAREST (x, y) within `r` px, or null.
 *
 * WHY it is here and not in floor.js: a child's fingertip covers ~40 px, but a socket is drawn as
 * a ~16 px ring, so BOTH ends of a wiring gesture — the grab and the drop — have to forgive the
 * gap between where they aimed and where they landed. That forgiveness is the whole UX fix, so it
 * is pure geometry, shared by both ends, and provable in node without a browser.
 *
 * Nearest-wins (not first-found) matters where sockets crowd: a tower with five switch-ins packs
 * them down one edge, and first-found would hand back the top one wherever you pressed.
 *
 * @param {Object} sockets plan.sockets — {pieceId: [{port, dir, x, y}]}
 * @param {number} x @param {number} y canvas px
 * @param {number} r search radius in px (the FINGER, not the dot)
 * @param {(id:string, s:object)=>boolean} [ok] keep only the sockets this says yes to
 * @returns {{id:string, port:string, dir:string, x:number, y:number, d:number}|null}
 */
function socketNear(sockets, x, y, r, ok) {
  var best = null;
  var ids = Object.keys(sockets || {});
  for (var i = 0; i < ids.length; i++) {
    var list = sockets[ids[i]] || [];
    for (var j = 0; j < list.length; j++) {
      var s = list[j];
      if (ok && !ok(ids[i], s)) continue;
      var d = Math.hypot(s.x - x, s.y - y);
      if (d <= r && (!best || d < best.d)) best = { id: ids[i], port: s.port, dir: s.dir, x: s.x, y: s.y, d: d };
    }
  }
  return best;
}

/**
 * Which of a block's lit-up sockets get their WORD painted this frame — never all of them at once.
 * Floor-art's `socketTags` used to receive every non-'nub' socket of a hovered/selected block, and
 * with blocks packed ~12 px apart and words 20–120 px wide there is nowhere to place six or eight
 * of them that does not print over the neighbour (measured 2026-09-01: 15 tags did, in every
 * gallery — see the WHY comment on `socketTags` in floor-art.js). The ring affordance — a block's
 * sockets growing out of their resting 'nub' — is untouched; this only decides which ones also
 * speak their name in text, and the answer is at most one: the socket the finger is ACTUALLY on.
 *
 * Cable-drag is the one exception, left as it always worked: mid-pull, every fitting/offered socket
 * keeps naming itself, because a child scanning for where to plug in needs to see every candidate,
 * not just the nearest.
 *
 * @param {Array<{port:string}>} lit          the non-'nub' sockets already resolved for ONE block
 * @param {{cableMode?:boolean, focusedPort?:(string|null)}} [state]
 * @returns {Array<{port:string}>} the subset (0 or 1 outside cable-drag) that should paint a word
 */
function tagPorts(lit, state) {
  var s = state || {};
  if (s.cableMode) return lit;
  if (!s.focusedPort) return [];
  return lit.filter(function (it) { return it.port === s.focusedPort; });
}

/**
 * The object under (x, y), readers/arches first — they straddle belts, so a tap on the arch is
 * the arch. Pure, and shared with the drop rule: releasing a cable anywhere ON a block is how a
 * child aims at a BLOCK ("plug it into the tower") instead of at a 16 px pin.
 *
 * @param {Object} objects plan.objects
 * @param {number} x room px
 * @param {number} y room px
 * @param {(o:object)=>boolean} [ok] keep only the objects this says yes to — the tutorial's hidden
 *   pieces pass `false` here so an un-placed example part can never be tapped or dragged even though
 *   its plan object still exists (the layout stays stable; only the ink and the hit-test go away).
 * @returns {object|null} the placed object
 */
function objectAt(objects, x, y, ok) {
  var all = Object.keys(objects || {}).map(function (k) { return objects[k]; });
  var order = all.filter(function (o) { return o.over; }).concat(all.filter(function (o) { return !o.over; }));
  for (var i = 0; i < order.length; i++) {
    var o = order[i];
    if (ok && !ok(o)) continue;
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
  }
  return null;
}

/**
 * WHICH message an empty face shows — a DECISION, so it lives here where a test can reach it
 * rather than inline in floor-art.js's draw call (the readerFace lesson: the last set of magic
 * choices inside a draw function shipped an owner-visible defect).
 *
 * WHY it exists at all: the orbit draws only once the sense is TAUGHT and something has been
 * READ. With neither, viewPlan() returns null and the orbit band drew nothing whatsoever — an
 * empty panel a person reads as "broken", which is exactly what happened on the owner's screen
 * (2026-08-20). A model that cannot draw its picture must say why.
 *
 * @param {{taught?:number, running?:boolean, hasPlan?:boolean, hasEvidence?:boolean}} o
 * @returns {string|null} a key into the floor's `words` map, or null when a picture IS drawn
 */
function faceEmptyKey(o) {
  const s = o || {};
  if (s.hasPlan || s.hasEvidence) return null;   // a real picture is up; never caption it
  if (!s.taught) return 'faceUntaught';          // teaching is the next move, running or not
  return s.running ? 'faceWaiting' : 'faceIdle'; // taught: waiting for a crate, or waiting for Run
}

/** How near a finger must come to a handle to take hold of it, in ROOM PIXELS. Exported because
 *  it is a CONTRACT, not a taste: barRail's inset is measured against it, and a test pins that no
 *  socket ever falls inside it. */
const BAR_GRAB = 12;

/**
 * THE RAIL the Splitter's bar runs along: the block's box, INSET from its rim.
 *
 * WHY inset, and why this much: a block's sockets sit ON its rim — ins down the left edge, outs
 * down the right, dials along the bottom (see the socket pass in floorPlan) — and floor.js takes
 * hold of a handle within BAR_GRAB px. A rail that reached the rim put handle 0 within 12 px of
 * the `dial:validation` socket at the default 60/20/20, so a press on the lower half of that
 * handle pulled a CABLE instead of moving the bar. The inset is the grab radius plus slack, and
 * the rail sits high enough that its grab band clears the bottom rim's dial sockets as well.
 *
 * @param {{x:number,y:number,w:number,h:number}} o the block's box (px)
 * @returns {{x:number, w:number, y:number, h:number}} the rail's own rect (px)
 */
function barRail(o) {
  const pad = Math.max(BAR_GRAB + 2, o.w * 0.1);
  return { x: o.x + pad, w: Math.max(1, o.w - pad * 2), y: o.y + o.h * 0.58, h: o.h * 0.25 };
}

/**
 * THE SPLITTER'S BAR — where its two handles stand, in ROOM PIXELS.
 *
 * WHY it lives here and not in the draw call: the bar is DRAWN by floor-art.js and DRAGGED by
 * floor.js, and two copies of the same geometry are two copies that drift — the extract-decisions
 * law. One definition, three readers, and the drag can be proved without a browser.
 *
 * The bar runs the rail's full width, because the three shares must be readable as WIDTHS:
 * 60/20/20 is a picture, not a number a child has to add up.
 *
 * @param {{x:number,y:number,w:number,h:number}} o  the block's box (px, top-left origin)
 * @param {{training:number, validation:number}} p  the shares (percent; Test is the remainder)
 * @returns {{x:number, w:number, x0:number, x1:number, y:number, h:number}}
 *   the rail's rect, plus handle 0 / handle 1 x (px). Shares map onto x/w, NOT onto the block.
 */
/**
 * THE SHARES A DEALT TABLE ACTUALLY HOLDS, as whole percents — the bar's division once the source
 * is spent and the dials stop governing anything (floor.js liveFor's `spent`).
 *
 * Extracted because TWO surfaces computed it and neither could see the other (whole-branch review
 * M9): floor.js's `barShares` decides where a finger GRABS a handle, floor-art.js's `splitter`
 * decides where the handle is DRAWN and what percentage is printed beside it. Hand-copied across
 * that hit-test/paint boundary, they drift silently — and a grab band that disagrees with the
 * paint by a few percent is exactly the class of bug the block's own dealt-vs-drawn finding was.
 *
 * @param {{training:number, validation:number, test:number}|null} dealt  rows given to each pile
 * @returns {{training:number, validation:number}|null} whole percents, or null when nothing has
 *          been dealt yet (the caller keeps using the dials)
 */
function dealtShares(dealt) {
  if (!dealt) return null;
  const n = (dealt.training || 0) + (dealt.validation || 0) + (dealt.test || 0);
  if (!(n > 0)) return null;
  return { training: Math.round((100 * (dealt.training || 0)) / n), validation: Math.round((100 * (dealt.validation || 0)) / n) };
}

function barHandles(o, p) {
  const bar = barRail(o);
  const t = Math.max(0, Math.min(100, p.training));
  // Validation is capped by what Training left: an impossible split must be impossible to DRAW.
  const v = Math.max(0, Math.min(100 - t, p.validation));
  return { x: bar.x, w: bar.w, x0: bar.x + bar.w * (t / 100), x1: bar.x + bar.w * ((t + v) / 100), y: bar.y, h: bar.h };
}

/**
 * Where a dragged handle leaves the shares. Handle 0 divides Training from Validation; handle 1
 * divides Validation from Test. A handle never crosses its neighbour, and no pile goes negative —
 * an impossible split must be impossible to DRAW, not merely rejected afterwards.
 *
 * WHY the two handles behave differently: handle 0 moves the wall BETWEEN training and validation,
 * so their sum is conserved and the sealed Test pile is untouched — dragging it must never quietly
 * change how the machine is finally examined. Handle 1 is the exam wall itself: it trades
 * validation against Test.
 *
 * @param {{x:number,y:number,w:number,h:number}} o  the block's box (px)
 * @param {{training:number, validation:number}} p  the shares BEFORE the drag (percent)
 * @param {number} handle  0 = training|validation, 1 = validation|test
 * @param {number} px  the finger, in room pixels
 * @returns {{training:number, validation:number}} the shares after (whole percent)
 */
function barDrop(o, p, handle, px) {
  const bar = barRail(o);
  const pct = Math.max(0, Math.min(100, Math.round(((px - bar.x) / bar.w) * 100)));
  const t = Math.max(0, Math.min(100, p.training));
  const v = Math.max(0, Math.min(100 - t, p.validation));
  if (handle === 0) {
    const training = Math.max(0, Math.min(t + v, pct));
    return { training, validation: (t + v) - training };
  }
  // Never left of handle 0 (validation cannot be negative); pct is already capped at 100, so Test
  // bottoms out at zero rather than going under.
  const edge = Math.max(t, pct);
  return { training: t, validation: edge - t };
}

/**
 * WHICH handle, if any, is under this point — null when the finger is not on one, so a press on
 * the block's body still selects (or drags) the block itself.
 *
 * Pure, and here rather than in floor.js's pointer handler, because the TIE-BREAK is a rule, not
 * plumbing — and a rule buried in a handler is a rule no test can reach. The two handles land on
 * top of each other whenever the middle pile is empty, and then the tie-break decides whether the
 * bar can be moved at all:
 *   - Training 0 / Validation 0 (everything is Test): handle 0 conserves Training+Validation,
 *     which is ZERO, so it cannot move the bar by any distance. Handle 1 can.
 *   - Training 100 (everything is Training): handle 1 can only travel within 100-Training, which
 *     is zero. Handle 0 can.
 * Picking the nearer handle blindly hands the child the pinned one in the first case, and the bar
 * is then stuck for the life of the machine — two ordinary drags and the only way out is the
 * plate, which is the affordance this bar exists to replace. So a pinned handle yields to a free
 * one standing just as close.
 *
 * @param {{x:number,y:number,w:number,h:number}} o  the block's box (px)
 * @param {{training:number, validation:number}} shares  percent
 * @param {number} px @param {number} py  the finger, in room pixels
 * @returns {0|1|null}
 */
function barHandleAt(o, shares, px, py) {
  const bar = barHandles(o, shares);
  if (py < bar.y - 6 || py > bar.y + bar.h + 6) return null;
  const d = [Math.abs(px - bar.x0), Math.abs(px - bar.x1)];
  if (Math.min(d[0], d[1]) > BAR_GRAB) return null;
  const t = Math.max(0, Math.min(100, shares.training));
  const v = Math.max(0, Math.min(100 - t, shares.validation));
  // How far each handle can travel at all: handle 0 within Training+Validation, handle 1 within
  // whatever Training has left it. Zero room = a pinned handle.
  const room = [t + v > 0, 100 - t > 0];
  const near = d[0] <= d[1] ? 0 : 1, other = near === 0 ? 1 : 0;
  if (!room[near] && room[other] && d[other] <= BAR_GRAB) return other;
  return near;
}

/**
 * Where a crate at `progress` (0..1 through its current cell) paints, for plan object `o` (fix
 * round 1, MINOR 2 — floor.js's own crate loop and brick-panel.js's own `paint()` had grown a
 * byte-identical copy of this formula, with no test pinning either — "two sources" is how the
 * pair drift). A belt rides its own length (12px inset from each end, so a crate never paints
 * flush against a coupling); anything else (a gate, a bin, a pen mid-hold) rides its own centre.
 * @param {{kind:string, x:number, y:number, w:number, h:number, cx:number, cy:number}} o
 * @param {number} progress  0..1
 * @returns {{x:number, y:number}}
 */
function cratePos(o, progress) {
  const x = o.kind === 'track' ? o.x + 12 + (o.w - 24) * progress : o.cx;
  const y = o.kind === 'track' ? o.cy : o.y + o.h * 0.5;
  return { x, y };
}

/**
 * LIFTING A PART OFF THE SHELF (task 089). A shelf card answers two gestures: a tap (lands the
 * part at floorPlan's own computed spot) and a LIFT — press, travel, let go over the floor —
 * which lands it centred under the finger. These two are the pure half: floor.js owns the
 * pointer events and the ghost, and nothing about "is this a lift yet" or "where does it land"
 * lives inside a handler where a test cannot reach it.
 *
 * WHY 8 px: a fingertip wobbles a few px inside a tap; a deliberate pull travels far more. The
 * canvas's own tap-vs-drag split uses 6 (floor.js onPointerMove); the shelf is a touch more
 * forgiving because the card is smaller than a placed object and a slipped tap must stay a tap.
 */
const LIFT_PX = 8;
/** Has a press that started at (sx, sy) and is now at (x, y) travelled far enough to be a lift? */
function shelfLift(sx, sy, x, y) {
  return Math.hypot(x - sx, y - sy) >= LIFT_PX;
}
/**
 * Where a lifted part LANDS. `rect` is the floor canvas's bounding rect in client px (left, top,
 * width, height), (cx, cy) the release point in the same space, `view` the pan, `size` the floor's
 * own {w, h}. Returns {fx, fy} in floorPlan's fraction units — the SAME units bridge.setPos and
 * a dragged object use (fx * W is the object's CENTRE) — or null when the release is off the
 * canvas (back on the shelf, over the header, outside the window): off the floor means "put it
 * back", never a part landing somewhere the child cannot see.
 */
function shelfLanding(rect, cx, cy, view, size) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  if (cx < rect.left || cx >= rect.left + rect.width || cy < rect.top || cy >= rect.top + rect.height) return null;
  const rx = cx - rect.left + view.x, ry = cy - rect.top + view.y; // room px, floor.js's own at()
  return { fx: rx / size.w, fy: ry / size.h };
}

/** Perpendicular distance from (px,py) to the segment (ax,ay)-(bx,by). A zero-length segment
 *  degrades to the point distance. Pure. @returns {number} */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * WHICH CABLE a press lands on (task: wire-selectable). `cables` is `plan.cables` — each carries
 * `{from,to,geom:{pts,aabb}}`. An AABB expanded by the fingertip tolerance REJECTS the overwhelming
 * majority in O(1) before any segment math (Metis: bounding-box fast path), then each orthogonal
 * span is measured and the NEAREST within `tol` wins. Returns the cable object (read `.from`/`.to`/
 * `.index`/`.id` off it) or null.
 * @param {Array<{from:object,to:object,geom?:{pts:Array,aabb:object}}>} cables
 * @param {number} x @param {number} y @param {number} [tol=14] fingertip tolerance, room px
 * @returns {object|null} the nearest cable within tolerance
 */
function wireAt(cables, x, y, tol) {
  const t = tol === undefined ? 14 : tol;
  let best = null, bestD = Infinity;
  for (const c of (cables || [])) {
    const g = c && c.geom;
    if (!g || !g.pts) continue;
    const b = g.aabb;
    if (x < b.x0 - t || x > b.x1 + t || y < b.y0 - t || y > b.y1 + t) continue;
    for (let i = 1; i < g.pts.length; i++) {
      const d = distToSegment(x, y, g.pts[i - 1].x, g.pts[i - 1].y, g.pts[i].x, g.pts[i].y);
      if (d <= t && d < bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

/**
 * ROUTE ONE CABLE the short way round (task 105) — pure. A cable steps SIDEWAYS out of each socket
 * (an out-socket leaves to the right, an in-socket is entered from the left, a dial from below),
 * so it never runs along a block's own rim; then one horizontal run joins the two stubs. The run's
 * height is chosen from candidates — the two stub rows, the band gaps (`gaps`: floor top, front
 * top, the old tray lane) and every block's top and bottom edge — as the one whose route passes
 * THROUGH the fewest blocks, then the shortest. A lane offset (by wire index) keeps parallel
 * cables from merging whenever it costs no extra crossing.
 * @param {{x,y}} from @param {string} fromDir 'out' · @param {{x,y}} to @param {string} toDir 'in'|'dial'
 * @param {Array<{x,y,w,h}>} boxes every placed object · @param {number[]} gaps extra candidate heights
 * @param {number} index the wire's index (lane) · @param {number} scale the plan's drawing scale
 * @returns {{pts:Array<{x,y}>, tray:number}} `tray` = the height of the horizontal run
 */
function routeCable(from, fromDir, to, toDir, boxes, gaps, index, scale) {
  const S0 = Math.max(10, 16 * (scale || 1)), PAD = 0.5, lane = (index % 4) * 6;
  // EVERY leg lies inside the cable's own x-span (stubs included), so only the blocks standing in
  // that column can ever be crossed — and only their edges are worth trying as heights. This is
  // what keeps a 400-piece floor from paying (heights × blocks) per cable (measured 09-18: 5 s →
  // see the perf note in the task-105 board entry).
  const xa = Math.min(from.x, to.x) - S0 - 1, xb = Math.max(from.x, to.x) + S0 + 1;
  const col = boxes.filter((o) => o.x < xb && o.x + o.w > xa);
  const through = (p, q) => {
    const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
    let n = 0;
    for (const o of col) if (x0 < o.x + o.w - PAD && x1 > o.x + PAD && y0 < o.y + o.h - PAD && y1 > o.y + PAD) n++;
    return n;
  };
  const ys = new Set([from.y, to.y].concat(gaps));
  for (const o of col) { ys.add(o.y - 8); ys.add(o.y + o.h + 8); }
  let best = null;
  // Full stubs first; then shorter ones, then none (straight off the socket — the old route's own
  // shape) — for a block packed so tight beside a socket that a full stub would poke into it (the
  // sorter's sign stands 12 px from the Only-if). Each step down costs more than any length
  // difference but less than a crossing, so the old tray route is always a candidate: a route is
  // never worse than it was.
  const STUBS = [[S0, 0], [S0 / 2, 2e4], [4, 5e4], [0, 1e5]];
  for (const [S, stubCost] of STUBS) {
    const E = { x: from.x + (fromDir === 'in' ? -S : S), y: from.y };
    const N = toDir === 'dial' ? { x: to.x, y: to.y + S } : { x: to.x + (toDir === 'out' ? S : -S), y: to.y };
    for (const base of ys) {
      for (const h of lane ? [base + lane, base] : [base]) {
        const pts = [from, E, { x: E.x, y: h }, { x: N.x, y: h }, N, to];
        let cost = stubCost + (lane && h === base ? 0.5 : 0);
        for (let k = 1; k < pts.length; k++) cost += Math.abs(pts[k].x - pts[k - 1].x) + Math.abs(pts[k].y - pts[k - 1].y);
        // Length first (cheap); the block scan only runs while this candidate can still win.
        for (let k = 1; k < pts.length && (!best || cost < best.cost); k++) cost += through(pts[k - 1], pts[k]) * 1e6;
        if (!best || cost < best.cost) best = { cost, h, pts };
      }
    }
  }
  // Drop zero-length legs (a stub row that IS the run): a polyline point with no turn is noise.
  const out = [];
  for (const p of best.pts) {
    const q = out[out.length - 1];
    if (q && q.x === p.x && q.y === p.y) continue;
    out.push(p);
  }
  for (let k = out.length - 2; k >= 1; k--) {
    const a = out[k - 1], m = out[k], c = out[k + 1];
    if ((a.x === m.x && m.x === c.x) || (a.y === m.y && m.y === c.y)) out.splice(k, 1);
  }
  return { pts: out, tray: best.h };
}

/**
 * THE BELT LINK under a room point (task 104) — the tap that selects a conveyor link so it can be
 * disconnected. Follows the SAME curve floor-art's link() draws (a straight rail when level, else
 * the bezier through (mid, a.y) and (mid, b.y)), sampled as a polyline. KEEP IN STEP with link().
 * @param {Array} links  `plan.links`
 * @param {number} x @param {number} y @param {number} [tol=14] fingertip tolerance, room px
 * @returns {object|null} the nearest link within tolerance
 */
function linkAt(links, x, y, tol) {
  const t = tol === undefined ? 14 : tol;
  let best = null, bestD = Infinity;
  for (const l of (links || [])) {
    const a = l.a, b = l.b;
    if (x < Math.min(a.x, b.x) - t || x > Math.max(a.x, b.x) + t || y < Math.min(a.y, b.y) - t || y > Math.max(a.y, b.y) + t) continue;
    const mx = (a.x + b.x) / 2, N = Math.abs(a.y - b.y) < 2 ? 1 : 24;
    let px = a.x, py = a.y;
    for (let i = 1; i <= N; i++) {
      const u = i / N, v = 1 - u;
      const qx = N === 1 ? b.x : v * v * v * a.x + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * b.x;
      const qy = N === 1 ? b.y : v * v * v * a.y + 3 * v * v * u * a.y + 3 * v * u * u * b.y + u * u * u * b.y;
      const d = distToSegment(x, y, px, py, qx, qy);
      if (d <= t && d < bestD) { bestD = d; best = l; }
      px = qx; py = qy;
    }
  }
  return best;
}

/**
 * WHICH CABLES a marquee FULLY ENCLOSES (task: wire-selectable, user ruling: "完全覆盖的线才框进来").
 * Every vertex of the polyline must sit inside the rect — a wire whose ends are inside but whose
 * tray run bulges out is NOT selected, so a marquee never grabs a wire it did not visibly surround.
 * @param {Array} cables  `plan.cables`
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect  corners in any order
 * @returns {Array} the fully-enclosed cables
 */
function wiresInRectFully(cables, rect) {
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  const out = [];
  for (const c of (cables || [])) {
    const g = c && c.geom;
    if (!g || !g.pts || !g.pts.length) continue;
    let inside = true;
    for (const p of g.pts) { if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) { inside = false; break; } }
    if (inside) out.push(c);
  }
  return out;
}

const WorkshopFloorLayout = { floorPlan, addTarget, addBrickTarget, kindOf, footprint, overlaps, inView, spanBox, socketNear, tagPorts, objectAt, readerFace, boardFace, brickFace, carmakerFace, carmakerDialAt, carmakerDialStep, carmakerNotch, faceEmptyKey, barHandles, dealtShares, barDrop, barHandleAt, cratePos, shelfLift, shelfLanding, LIFT_PX, wireAt, linkAt, routeCable, wiresInRectFully, distToSegment, FOOT, BAR_GRAB, FIT_MIN, VIEW_PAD, BOARD_X, ITEM_TYPES, WALL_TYPES, FRONT_TYPES, PORT_PITCH };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopFloorLayout;
if (typeof window !== 'undefined') window.WorkshopFloorLayout = WorkshopFloorLayout;
})();
