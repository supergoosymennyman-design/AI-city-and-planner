'use strict';
/**
 * The brick mapper — turns a FLOOR SELECTION into a reusable "brick" (a machine made of
 * machines), and flattens a table wearing brick pieces back into the flat table the engine
 * already knows (composing-arc task-2-brief.md, "make your own part"). Pure logic: no DOM, no
 * Math.random, no Date.now — a part is exactly as reproducible as any other logic/*.js module.
 *
 * A brick PIECE (as it sits on a table) looks like `{id, type:'brick', def, x?, y?}` — the same
 * shape any other piece wears, plus its own `def` (the output of makePart below). The engine
 * never sees this type: Brick.expand() removes every brick piece before the table reaches
 * Snap.snapToLayout / Engine.createRun.
 *
 * A part's def:
 *   def = { name, pieces: [...], snaps: [...], wires: [...], ports: [...] }
 * A PORT is one boundary crossing, collapsed by inner endpoint (the port rule, below):
 *   port = { id, plane: 'item'|'signal', dir: 'in'|'out',
 *            inner: {piece, end}, display: {pieceName, type, end} }
 * `display` never calls t() — brick.js is pure; the caller (game.js) renders the sentence.
 */
(function () {
// Wrapped (breaker-fix round, finding #4): classic <script> tags share ONE global scope, and this
// file's own top-level `fail` used to be an unwrapped global binding — logic/tray.js ALSO declares
// its own top-level `function fail`, loads LAST in index.html's own order, and silently overwrote
// this one on the shared global object. Every throw below still spoke the RIGHT WORDS (fail's
// message is unaffected either way) but wore tray.js's "[tray]" tag instead of this file's own
// "[brick]" — a developer chasing a bug report would look in the wrong file first, every time.
// Wrapping matches every other logic/*.js module here (floor-layout.js, board.js, brick-panel.js…)
// that already opens `(function () { ... })();` for exactly this reason. engine.js/snap.js/
// brain.js/tray.js still collide with EACH OTHER (tray.js wins, loading last) — that fix touches
// the two most foundational, most heavily depended-on simulation files in the whole workshop and
// stays with the owner, to land behind the full `npm run validate` gate as its net (this laptop's
// hard rule is single test files only). See tests/vb-fail-tag-collision-browser.test.js's own
// header for the rescoped, still-honest accounting of what this DOES and does NOT fix.

function fail(msg) {
  throw new Error('[brick] ' + msg);
}

/** Deep-clone a plain-data value (pieces/snaps/wires carry only JSON-shaped config — no
 *  functions, no cycles) so a brick never aliases the table it was cut from. */
function clone(x) {
  return x === undefined ? x : JSON.parse(JSON.stringify(x));
}

// A piece can name another piece it watches three different ways (spec R1/R2, task 6 §8):
// a sense/teach's `watchPiece` (which track it sits on), a teach's `teachTarget` (which sense
// it files from), a board's `watchBlock` (which dial-bearing block it records). All three are
// bare piece ids, never port references — so a brick must re-key them exactly like a snap/wire
// endpoint whenever the piece they live on gets renamed (namespaced by expand, freshened by
// unpack).
const WATCH_FIELDS = ['watchPiece', 'teachTarget', 'watchBlock'];

/**
 * Cut a def (a reusable part) out of `ids` — the selected pieces of `table`. Ports are the
 * def's only interface to the outside: one per DISTINCT inner endpoint touched by at least one
 * boundary-crossing edge (see the port rule below).
 *
 * v1 scope (spec's own line): ports are wires and belts only. A watch-coupling
 * (watchPiece/teachTarget/watchBlock) may not cross the boundary in EITHER direction — there is
 * no port shape for "the outside names something inside my box" or vice versa.
 *
 * @param {object} table  the table model (logic/snap.js:9-18): {pieces, snaps, wires}
 * @param {string[]} ids  the selected piece ids — becomes the part's inside
 * @param {string} name   the part's own name, carried into def.name verbatim
 * @returns {{ok:true, def:object, portFor:Object<string,string>} | {ok:false, why:string}}
 *   why: 'tooFew' (fewer than 2 ids) | 'watcher' (an inside piece watches out)
 *      | 'watched' (an outside piece watches in)
 */
function makePart(table, ids, name) {
  if (!table || !Array.isArray(table.pieces)) fail('table.pieces must be an array');
  if (!Array.isArray(ids) || ids.length < 2) return { ok: false, why: 'tooFew' };

  const byId = {};
  for (const p of table.pieces) byId[p.id] = p;

  // Unknown/duplicate ids are a PROGRAMMER error (the caller built `ids` from the table itself,
  // so this can only mean a stale selection) — throw loud rather than silently drop them.
  const inside = new Set();
  for (const id of ids) {
    if (!byId[id]) fail(`makePart: unknown piece id "${id}"`);
    if (inside.has(id)) fail(`makePart: duplicate piece id "${id}" in selection`);
    inside.add(id);
  }

  // Refusal (v1 scope): a watch-coupling may not cross the boundary either way. Check the
  // selection's OWN watchers first — an inside piece reaching OUT is checked before any outside
  // piece reaching IN, matching the brief's own before/after ordering ('watcher' then 'watched').
  for (const id of ids) {
    const p = byId[id];
    for (const f of WATCH_FIELDS) {
      if (p[f] && !inside.has(p[f])) return { ok: false, why: 'watcher' };
    }
  }
  for (const p of table.pieces) {
    if (inside.has(p.id)) continue;
    for (const f of WATCH_FIELDS) {
      if (p[f] && inside.has(p[f])) return { ok: false, why: 'watched' };
    }
  }

  // --- The port rule -----------------------------------------------------------------------
  // One port per DISTINCT inner endpoint touched by >=1 boundary-crossing edge. A snap or wire
  // with exactly one side inside crosses; both-in and both-out edges stay fully internal (they
  // become def.snaps/def.wires below, never a port). Fan-out (several outside edges landing on
  // the SAME inner endpoint) collapses to the SAME port — the key is the inner endpoint, not the
  // edge. Collisions on the port id itself append 2, 3… in discovery order: snaps in table
  // order, THEN wires in table order — one shared counter, so the numbering a child sees is the
  // order the crossings were found, not which plane they live on.
  const ports = [];
  const portFor = {};
  // RULING (fix round 1): this counter is shared across BOTH planes on purpose, even though
  // findPort keys a port by (plane, id) and so could never actually confuse an item 'in' for a
  // signal 'in'. The reason is the CHILD, not the lookup: a brick shows one face with one set of
  // port labels — two ports both reading "in" on that face would be the confusing outcome,
  // whichever plane each one happens to carry underneath.
  const idCount = {};
  const allocateId = (base) => {
    const n = (idCount[base] = (idCount[base] || 0) + 1);
    return n === 1 ? base : base + n;
  };
  const addPort = (plane, innerPiece, innerEnd, dir, idBase) => {
    const key = plane + '|' + innerPiece + '|' + innerEnd;
    if (portFor[key] !== undefined) return; // fan-out: already ported from an earlier edge
    const id = allocateId(idBase);
    const inner = byId[innerPiece];
    ports.push({
      id,
      plane,
      dir,
      inner: { piece: innerPiece, end: innerEnd },
      display: { pieceName: inner.name || null, type: inner.type, end: innerEnd },
    });
    portFor[key] = id;
  };

  for (const s of table.snaps || []) {
    const fromIn = inside.has(s.from.piece);
    const toIn = inside.has(s.to.piece);
    if (fromIn === toIn) continue; // both in or both out — not a crossing
    const innerSide = fromIn ? s.from : s.to;
    // The inner side's OWN end name says the direction: an in-socket is always named 'in'
    // (snap.js's ITEM_ENDS) — anything else is an out-plug, however the type spells it
    // ('out', 'exit1'…). Item-plane id base is the generic in/out shape itself.
    const dir = innerSide.end === 'in' ? 'in' : 'out';
    addPort('item', innerSide.piece, innerSide.end, dir, dir);
  }
  for (const w of table.wires || []) {
    const fromIn = inside.has(w.from.block);
    const toIn = inside.has(w.to.block);
    if (fromIn === toIn) continue;
    const innerSide = fromIn ? w.from : w.to;
    const dir = toIn ? 'in' : 'out';
    // Signal-plane id base is the inner port's OWN name ('reading', 'show'…) — a wire carries
    // no generic in/out shape the way a belt coupling does; the name IS the interface.
    addPort('signal', innerSide.block, innerSide.port, dir, innerSide.port);
  }

  const def = {
    name,
    pieces: ids.map((id) => clone(byId[id])),
    snaps: (table.snaps || []).filter((s) => inside.has(s.from.piece) && inside.has(s.to.piece)).map(clone),
    wires: (table.wires || []).filter((w) => inside.has(w.from.block) && inside.has(w.to.block)).map(clone),
    ports,
  };
  return { ok: true, def, portFor };
}

/**
 * Look up one of a brick's own ports by (plane, id) — the only thing expand() needs to rewrite
 * a table edge that used to end at the brick into the port's namespaced inner endpoint.
 * @throws if the port doesn't exist — a stale/hand-edited table naming a port a brick doesn't
 *   have is a build error, not a silent no-op.
 */
function findPort(def, plane, id, ownerId) {
  const port = (def.ports || []).find((p) => p.plane === plane && p.id === id);
  if (!port) fail(`brick "${ownerId}" has no ${plane} port "${id}"`);
  return port;
}

/**
 * Flatten every brick piece out of `table`, recursively (a brick's own def may itself contain
 * bricks). The engine never learns a brick existed: every namespaced piece, snap and wire this
 * produces is exactly the shape Snap.snapToLayout / Engine.createRun already accept.
 *
 * Algorithm (task-2-brief.md, verbatim): while any piece has type==='brick' — for each brick
 * piece B, emit def.pieces as clones id-prefixed `B.id+'~'+p.id` (re-keying def-internal
 * snaps/wires and watchPiece/teachTarget/watchBlock the same way), rewrite every table
 * snap/wire endpoint that pointed at one of B's ports to the port's namespaced inner endpoint,
 * then drop B. Repeat until no brick piece remains.
 *
 * @param {object} table  a table whose pieces may include {type:'brick', def} entries
 * @returns {{pieces:Array, snaps:Array, wires:Array, glowAlias:Array<{fromKey,toKey}|undefined>}}
 *   glowAlias is parallel to INPUT table.wires: glowAlias[i] names the 'block:port' strings wire
 *   i carries AFTER expansion (identity for a wire no brick ever touched). A wire introduced by
 *   a def's own internal wiring gets no slot — it never had an index in the INPUT wires.
 */
function expand(table) {
  if (!table || !Array.isArray(table.pieces)) fail('table.pieces must be an array');
  // '~' is the separator expand() itself introduces below (B.id+'~'+innerId) — an INPUT id that
  // already carries one would make an expanded id ambiguous to unwind (which '~' was ours?).
  for (const p of table.pieces) {
    if (String(p.id).includes('~')) fail(`piece id "${p.id}" already contains "~" — reserved for brick expansion`);
  }

  let pieces = (table.pieces || []).map(clone);
  let snaps = (table.snaps || []).map(clone);
  // Carry the ORIGINAL wire index (src) alongside each working wire so glowAlias can stay
  // parallel to table.wires even after bricks rewrite, add to, and reorder nothing.
  let wires = (table.wires || []).map((w, i) => ({ w: clone(w), src: i }));

  // Depth guard: nested bricks unwind ONE layer per pass (an inner brick's own brick pieces
  // only surface, namespaced, after its outer brick is dropped this pass). 20 passes is far
  // beyond any machine a child would nest by hand; a table still not flat past it is a cycle
  // or a bug, never an honestly-deep part — this throws instead of looping forever.
  for (let pass = 0; pass < 20; pass++) {
    const bricks = pieces.filter((p) => p.type === 'brick');
    if (!bricks.length) break;

    for (const B of bricks) {
      const def = B.def;
      if (!def) fail(`brick "${B.id}" has no def`);

      for (const p of def.pieces || []) {
        // A def is SAVE-FORMAT PAYLOAD (it rides inside a brick piece in a champion file) — the
        // input-id guard above only ever saw the TABLE's own ids, never a def smuggled in from a
        // foreign or hand-edited save. A def piece id already carrying '~' is exactly that
        // exposure, and it would make the id this loop is ABOUT to mint ambiguous to unwind.
        if (String(p.id).includes('~')) fail(`brick "${B.id}"'s def piece "${p.id}" already contains "~" — a def is save-format payload; a foreign or hand-edited champion file is the one way this happens`);
        const np = clone(p);
        np.id = B.id + '~' + p.id;
        for (const f of WATCH_FIELDS) {
          if (np[f]) np[f] = B.id + '~' + np[f];
        }
        pieces.push(np);
      }
      for (const s of def.snaps || []) {
        snaps.push({
          from: { piece: B.id + '~' + s.from.piece, end: s.from.end },
          to: { piece: B.id + '~' + s.to.piece, end: s.to.end },
        });
      }
      for (const w of def.wires || []) {
        wires.push({
          w: {
            from: { block: B.id + '~' + w.from.block, port: w.from.port },
            to: { block: B.id + '~' + w.to.block, port: w.to.port },
          },
          src: -1, // def-internal wire — never had an index in the INPUT table.wires
        });
      }

      // Rewrite every OUTER snap/wire endpoint that pointed at one of B's ports into the
      // port's namespaced inner endpoint. Runs over the FULL current arrays (including what
      // this brick just pushed above, which is always already namespaced and so never matches
      // B.id bare) — order among sibling bricks in the same pass doesn't matter: whichever side
      // of a brick-to-brick edge gets processed first, the other side follows in its own turn.
      for (const s of snaps) {
        if (s.from.piece === B.id) {
          const port = findPort(def, 'item', s.from.end, B.id);
          s.from = { piece: B.id + '~' + port.inner.piece, end: port.inner.end };
        }
        if (s.to.piece === B.id) {
          const port = findPort(def, 'item', s.to.end, B.id);
          s.to = { piece: B.id + '~' + port.inner.piece, end: port.inner.end };
        }
      }
      for (const entry of wires) {
        const w = entry.w;
        if (w.from.block === B.id) {
          const port = findPort(def, 'signal', w.from.port, B.id);
          w.from = { block: B.id + '~' + port.inner.piece, port: port.inner.end };
        }
        if (w.to.block === B.id) {
          const port = findPort(def, 'signal', w.to.port, B.id);
          w.to = { block: B.id + '~' + port.inner.piece, port: port.inner.end };
        }
      }
    }

    pieces = pieces.filter((p) => !bricks.includes(p)); // drop every B processed this pass
  }
  if (pieces.some((p) => p.type === 'brick')) fail('brick nesting too deep');

  const glowAlias = [];
  for (const entry of wires) {
    if (entry.src < 0) continue; // def-internal wire — no INPUT slot to alias
    glowAlias[entry.src] = {
      fromKey: entry.w.from.block + ':' + entry.w.from.port,
      toKey: entry.w.to.block + ':' + entry.w.to.port,
    };
  }

  return { pieces, snaps, wires: wires.map((entry) => entry.w), glowAlias };
}

/**
 * Turn a part's def back into ordinary table pieces — the inverse of placement. Used when a
 * child opens a brick back up: def pieces get FRESH ids (never namespaced — a brick opened
 * twice must not collide with itself or with anything already on the table), and every
 * internal cross-reference (a snap/wire endpoint, or a watchPiece/teachTarget/watchBlock naming
 * another def piece) follows to the new id. Reconnecting the BOUNDARY — the table edges that
 * used to end at the brick's ports — is the CALLER's job (game.js): this function only knows
 * the def's own inside, via def.ports + the returned innerToNew map.
 *
 * @param {object} def          a Brick.makePart() def: {name, pieces, snaps, wires, ports}
 * @param {object} brickPiece   the table piece being opened — must be `{type:'brick', ...}`;
 *                              a loud guard against unpacking the wrong thing
 * @param {function(): string} nextIdFn  returns one fresh id per call ('b'+n, the table's own
 *                              idiom) — injected so this stays pure/deterministic; the CALLER
 *                              owns id allocation, exactly like every other add-to-table path
 * @returns {{pieces:Array, snaps:Array, wires:Array, innerToNew:Object<string,string>}}
 */
function unpack(def, brickPiece, nextIdFn) {
  if (!def || !Array.isArray(def.pieces)) fail('unpack: def.pieces must be an array');
  if (!brickPiece || brickPiece.type !== 'brick') fail('unpack: brickPiece must be a {type:"brick"} table piece');
  if (typeof nextIdFn !== 'function') fail('unpack: nextIdFn must be a function');

  const innerToNew = {};
  for (const p of def.pieces) innerToNew[p.id] = nextIdFn();

  // Loud guards below: a def is SAVE-FORMAT PAYLOAD (game.js:4726-4740 serializes bricks inside
  // a machine's own pieces/snaps/wires) — a cross-reference naming a piece OUTSIDE this def's own
  // pieces can only mean a corrupted or hand-edited champion file, never a reachable in-app state.
  // Failing loudly here, at the one place that owns the full id map, beats letting `undefined`
  // leak into a table piece and surface as a mystery deep in snapToLayout instead.
  const pieces = def.pieces.map((p) => {
    const np = clone(p);
    np.id = innerToNew[p.id];
    for (const f of WATCH_FIELDS) {
      if (np[f]) {
        if (!(np[f] in innerToNew)) fail(`unpack: def piece "${p.id}"'s ${f} names "${np[f]}" — not one of this def's own pieces`);
        np[f] = innerToNew[np[f]];
      }
    }
    return np;
  });
  const snaps = (def.snaps || []).map((s) => {
    if (!(s.from.piece in innerToNew)) fail(`unpack: def snap references unknown piece "${s.from.piece}"`);
    if (!(s.to.piece in innerToNew)) fail(`unpack: def snap references unknown piece "${s.to.piece}"`);
    return {
      from: { piece: innerToNew[s.from.piece], end: s.from.end },
      to: { piece: innerToNew[s.to.piece], end: s.to.end },
    };
  });
  const wires = (def.wires || []).map((w) => {
    if (!(w.from.block in innerToNew)) fail(`unpack: def wire references unknown block "${w.from.block}"`);
    if (!(w.to.block in innerToNew)) fail(`unpack: def wire references unknown block "${w.to.block}"`);
    return {
      from: { block: innerToNew[w.from.block], port: w.from.port },
      to: { block: innerToNew[w.to.block], port: w.to.port },
    };
  });
  return { pieces, snaps, wires, innerToNew };
}

/**
 * Every piece hiding INSIDE any brick's own def on this table, recursively (a nested brick's own
 * def pieces compound the namespace one more layer, exactly as expand() itself mints their ids) —
 * the "honesty walk" a host narration needs to find a sealed Evaluator/source a flat top-level
 * scan can never see (breaker-fix round, findings #2/#3: sealing an Evaluator/Splitter-source
 * inside a brick used to report a false "Scored 0"/silently drop the "only N of TOTAL" honesty,
 * because the host's own lookup only ever scanned `table.pieces`, never a brick's own `def`).
 * Table-order iteration: outer pieces in `table.pieces` order, each brick's own `def.pieces` in
 * ITS order, depth-first.
 *
 * Deliberately does NOT look at un-sealed top-level pieces — a caller already has its own plain
 * `table.pieces.filter(predicate)` for those; this is the sealed-only half.
 *
 * @param {{pieces:Array}} table  the table model (logic/snap.js:9-18); pieces may be `{type:'brick', def}`
 * @param {function(object): boolean} predicate  tested against each def piece
 * @returns {Array<{id:string, piece:object}>} id is the FULLY NAMESPACED id ('outerId~innerId',
 *   'outerId~midId~innerId' for a nested brick) — exactly the key expand() mounts this piece
 *   under in a run, so a caller can go straight from this to `state.run.blocks[id]`/`byId[id]`
 * @throws if a brick piece on the table has no `def` (a corrupt/hand-edited table — findPort idiom)
 */
function findSealed(table, predicate) {
  if (!table || !Array.isArray(table.pieces)) fail('findSealed: table.pieces must be an array');
  if (typeof predicate !== 'function') fail('findSealed: predicate must be a function');
  const out = [];
  const walkDef = (pieces, prefix) => {
    for (const p of pieces || []) {
      if (predicate(p)) out.push({ id: prefix + p.id, piece: p });
      if (p.type === 'brick') {
        if (!p.def) fail(`findSealed: brick "${prefix}${p.id}" has no def`);
        walkDef(p.def.pieces, prefix + p.id + '~');
      }
    }
  };
  for (const p of table.pieces) {
    if (p.type !== 'brick') continue;
    if (!p.def) fail(`findSealed: brick "${p.id}" has no def`);
    walkDef(p.def.pieces, p.id + '~');
  }
  return out;
}

/**
 * Resolve a WIRE endpoint `{block, port}` THROUGH brick ports, one layer at a time, to the real
 * inner endpoint a flattened run actually mounts — the other half of the honesty walk (finding
 * #3): `state.table.wires` still name the brick's own OUTER id once a wire's source is sealed
 * (makePart rewires the table around the new brick piece, but `state.run` only exists from the
 * NEXT expand() at Run, which namespaces everything one layer at a time) — so a host reading
 * `state.run.byId` needs this to land on the exact same namespaced id expand() minted.
 *
 * `end.block` naming something that is not a brick piece (the ordinary, unsealed case — by far
 * the common one) is returned UNCHANGED, byte-identical: this is meant to sit in front of an
 * existing `state.run.byId[...]` lookup with zero behavior change for a wire no brick ever touched.
 *
 * @param {{pieces:Array}} table
 * @param {{block:string, port:string}} end  a WIRE endpoint (signal plane — this module's own
 *   {block, port} shape, distinct from a snap's {piece, end})
 * @returns {{block:string, port:string}} the resolved endpoint — namespaced one layer per brick
 *   this wire's source turned out to be sealed inside (recursing through a nested brick's own port)
 * @throws if `end.port` does not name one of the brick's own ports (findPort idiom)
 */
function resolveEndpoint(table, end) {
  if (!table || !Array.isArray(table.pieces)) fail('resolveEndpoint: table.pieces must be an array');
  if (!end || typeof end.block !== 'string' || typeof end.port !== 'string') fail('resolveEndpoint: end must be a {block, port} pair');
  const outer = table.pieces.find((p) => p.id === end.block);
  if (!outer || outer.type !== 'brick') return end;
  return resolveThroughDef(outer.def, end.block, end.port);
}

/** resolveEndpoint's recursive half: walk one brick's own def, one port at a time. `prefix` is
 *  the namespaced id accumulated so far (expand()'s own B.id+'~'+p.id idiom, one layer per
 *  recursive step) — also what a thrown error names as the brick a bad port belongs to. */
function resolveThroughDef(def, prefix, portId) {
  if (!def) fail(`resolveEndpoint: brick "${prefix}" has no def`);
  const port = findPort(def, 'signal', portId, prefix);
  const innerId = prefix + '~' + port.inner.piece;
  const innerPiece = (def.pieces || []).find((p) => p.id === port.inner.piece);
  if (innerPiece && innerPiece.type === 'brick') return resolveThroughDef(innerPiece.def, innerId, port.inner.end);
  return { block: innerId, port: port.inner.end };
}

/**
 * Which endpoints inside `ids` may become a part's ports.
 *
 * The socket list is INJECTED (`opts.connsFor`) rather than re-derived here: game.js's connsOf is
 * already the one source the floor's sockets and the plate's rows both read, and it alone knows a
 * gate's dynamic exits and a nested part's own per-instance face. A second copy of that rule would
 * drift (the laws-already-in-code rule).
 *
 * A belt OUT-plug is offerable even though it is coupled inside, and `cuts` names what exposing it
 * severs: snap.js lets an out-plug lead exactly one place, and every machine that runs at all has
 * every out-plug coupled (snap.js:110 "leads nowhere"), so refusing coupled plugs would offer an
 * empty set for every real machine — a part could take crates in and never pass one on.
 *
 * Dials are not offered (v1): `man.brick.dials` ships the sentence "a sealed part carries no dial
 * on its face". Delete the `c.kind === 'dial'` skip below to reverse that, and rewrite the manual
 * line in the same commit.
 *
 * @param {{pieces:Array, snaps:Array}} table
 * @param {string[]} ids
 * @param {{connsFor:function}} opts
 */
function offerablePorts(table, ids, opts) {
  if (!table || !Array.isArray(table.pieces)) fail('table.pieces must be an array');
  if (!opts || typeof opts.connsFor !== 'function') fail('offerablePorts needs opts.connsFor');
  const inside = new Set(ids || []);
  const coupledFrom = {};
  for (const s of table.snaps || []) coupledFrom[s.from.piece + '|' + s.from.end] = { piece: s.to.piece, end: s.to.end };
  const out = [];
  for (const p of table.pieces) {
    if (!inside.has(p.id)) continue;
    for (const c of opts.connsFor(p) || []) {
      if (c.kind === 'dial') continue;
      const plane = c.kind.indexOf('item') === 0 ? 'item' : 'signal';
      const dir = c.kind === 'sig-out' || c.kind === 'item-out' ? 'out' : 'in';
      const cuts = (plane === 'item' && dir === 'out') ? (coupledFrom[p.id + '|' + c.name] || null) : null;
      out.push({ plane, dir, piece: p.id, end: c.name, pieceName: p.name || null, type: p.type, cuts });
    }
  }
  return out;
}

const PORT_NAME_MAX = 24;

/**
 * Seal a whole machine into a def with a CHOSEN face.
 *
 * Unlike makePart (a floor cut, whose ports are derived from the edges the cut crossed and whose
 * caller then REMOVES the cut pieces from the table), this never touches the table it reads: the
 * machine stays where it is and the part is a copy.
 *
 * A belt out-plug on the face has its inner coupling CUT in the copy — an out-plug leads exactly
 * one place (snap.js:87), so it cannot both feed the inside and reach the outside. The machine's
 * own coupling is untouched; `cut` reports every severed one so the chooser can say it out loud
 * before anyone confirms.
 *
 * `opts.learningFor(piece)` closes the other leak a snapshot has: a Model with no `learning` of
 * its own reads the SHARED registry (game.js modelEntry), which belongs to whatever machine the
 * part is placed in — so an untouched copy would quietly answer with a stranger's teaching. The
 * host answers with the bank the copy must carry (`{}` when there is nothing to carry), or null
 * for a piece that needs none. It is asked of every piece at EVERY DEPTH — a part already on this
 * table hides its own Models, and they leak exactly the same way (see `bankInto` below). The rule
 * stays pure: this file never learns what a Model is.
 *
 * Every item OUT-plug in the table must end up either coupled INSIDE the copy or exposed as a
 * face port (`why: 'unwired'`, whole-branch review finding 4): `unwiredFacePorts` only ever
 * inspects an ALREADY-SEALED part's own face, so a machine mid-build — a Feeder, Pen, or gate
 * exit whose out-plug nobody has coupled yet — sailed straight through here, and `expand()` later
 * handed `Snap.snapToLayout` a namespaced dead end nobody placing the finished part could see or
 * open ("bk~f1 is not coupled to anything"). Refused HERE instead, while the machine is still open
 * and the person can still fix it on the floor.
 */
function sealMachine(table, name, ports, opts) {
  if (!table || !Array.isArray(table.pieces)) fail('table.pieces must be an array');
  if (!opts || typeof opts.learningFor !== 'function') fail('sealMachine needs opts.learningFor');
  const ids = table.pieces.map((p) => p.id);
  if (ids.length < 2) return { ok: false, why: 'tooFew', detail: null };
  if (!ports || !ports.length) return { ok: false, why: 'noPorts', detail: null };

  const offers = {};
  for (const o of offerablePorts(table, ids, opts)) offers[o.piece + '|' + o.end] = o;
  const byId = {};
  for (const p of table.pieces) byId[p.id] = p;

  const seen = new Set();
  const face = [];
  const cut = [];
  for (const p of ports) {
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id || id.length > PORT_NAME_MAX || /[:~]/.test(id)) return { ok: false, why: 'badName', detail: String(p.id) };
    if (seen.has(id)) return { ok: false, why: 'duplicateName', detail: id };
    seen.add(id);
    const key = p.inner && (p.inner.piece + '|' + p.inner.end);
    const offer = offers[key];
    if (!offer) return { ok: false, why: 'notOfferable', detail: key || null };
    const inner = byId[p.inner.piece];
    face.push({
      id,
      plane: offer.plane,
      dir: offer.dir,
      inner: { piece: p.inner.piece, end: p.inner.end },
      display: { pieceName: inner.name || null, type: inner.type, end: p.inner.end },
    });
    if (offer.cuts) cut.push({ from: { piece: p.inner.piece, end: p.inner.end }, to: offer.cuts });
  }

  // See the function doc: an item out-plug that is neither coupled inside nor on the chosen face
  // can never deliver anything once this table is flattened — `offer.cuts` is only ever set for a
  // plane:'item', dir:'out' offer (offerablePorts' own rule), so this walks every such offer once.
  const chosenInner = new Set(face.map((f) => f.inner.piece + '|' + f.inner.end));
  for (const key of Object.keys(offers)) {
    const o = offers[key];
    if (o.plane !== 'item' || o.dir !== 'out' || o.cuts || chosenInner.has(key)) continue;
    const inner = byId[o.piece];
    return { ok: false, why: 'unwired', detail: { piece: o.piece, end: o.end, pieceName: (inner && inner.name) || null, type: o.type } };
  }

  const severed = new Set(cut.map((c) => c.from.piece + '|' + c.from.end));
  const banked = [];
  /**
   * Bank one piece, then everything sealed inside it — RECURSIVELY (re-review finding 1).
   *
   * The walk used to be top-level only, and a Model sealed inside a part ALREADY on this table
   * kept its gap: `opts.learningFor` answers null for a brick (it is not a Model), so the whole
   * subtree was skipped and the copy's inner Model went on falling back to the shared registry —
   * the teaching of whatever machine the part is later placed into. That is the exact leak this
   * function's own doc, four paragraphs up, exists to close; it just never went deep enough.
   * `unwiredFacePorts` below recurses for the same reason, and says so: the hole nests.
   *
   * `trail` is the NAMESPACED path for `banked` — one `~` segment per level, expand()'s own
   * `B.id+'~'+innerId` rule (and findSealed's returned id shape). A top-level entry stays a bare
   * id, so the two can never be confused inside the one flat `banked` array, and a reader can go
   * straight from a nested entry to the id the run will actually mount it under.
   *
   * The CLONE is what gets asked and what gets written: `learningFor` is documented as a read
   * (game.js's sealBankFor never writes), but handing it the copy rather than the live piece is
   * what makes "sealing never edits the machine" true by construction rather than by trust — and
   * a clone is data-identical, so the answer is the same either way.
   */
  const bankInto = (copy, trail) => {
    if (!copy.learning) {                         // has one already? the clone carried it — leave it
      const bank = opts.learningFor(copy);
      if (bank) {                                 // null: not a Model, or one that reads no shelf
        copy.learning = clone(bank);
        banked.push(trail);
      }
    }
    if (copy.type === 'brick' && copy.def) {
      for (const innerCopy of copy.def.pieces || []) bankInto(innerCopy, trail + '~' + innerCopy.id);
    }
  };
  const pieces = table.pieces.map((p) => {
    const copy = clone(p);
    bankInto(copy, copy.id);
    return copy;
  });
  return {
    ok: true,
    cut,
    banked,
    def: {
      name,
      pieces,
      snaps: (table.snaps || []).filter((s) => !severed.has(s.from.piece + '|' + s.from.end)).map(clone),
      wires: (table.wires || []).map(clone),
      ports: face,
    },
  };
}

/**
 * Every belt OUT port, at any depth, that nothing is coupled to.
 *
 * Without this, expand() hands snapToLayout an out-plug leading nowhere and the Run dies with
 * `track "m1~a~t" leads nowhere` — a namespaced id for a block nobody can see. The PORT is what
 * the person can see, so the port is what the refusal names.
 *
 * It recurses because the hole nests: a part sealed around a part whose belt end nothing catches
 * carries that hole inside it, and a top-level scan walks straight past. A nested port is excused
 * only when the face above FORWARDS it — then it is reported once, at the level where a person can
 * actually reach it, under that level's name.
 */
function unwiredFacePorts(table) {
  if (!table || !Array.isArray(table.pieces)) fail('table.pieces must be an array');
  const out = [];
  /**
   * @param {Array} pieces        this level's pieces
   * @param {Array} snaps         this level's couplings
   * @param {string} placedId     the PLACED part every finding here belongs to (the floor's own id)
   * @param {Array<string>} trail the names from that placed part down to this level
   * @param {Set<string>} excused 'piece|end' keys this level's own face already answers for
   */
  const walk = (pieces, snaps, placedId, trail, excused) => {
    const wired = new Set();
    for (const s of snaps || []) wired.add(s.from.piece + '|' + s.from.end);
    for (const p of pieces || []) {
      if (p.type !== 'brick' || !p.def) continue;
      const name = p.name || p.def.name || '';
      const id = placedId || p.id;
      const forwarded = new Set();
      for (const q of p.def.ports || []) {
        if (q.plane !== 'item' || q.dir !== 'out') continue;
        const key = p.id + '|' + q.id;
        if (wired.has(key) || excused.has(key)) {
          // Answered here, so whatever it forwards to inside is answered too.
          if (q.inner) forwarded.add(q.inner.piece + '|' + q.inner.end);
        } else {
          out.push({ brick: id, brickName: trail.concat(name).join(' ▸ '), port: q.id });
          // Reported at THIS level; do not report the same hole again further in.
          if (q.inner) forwarded.add(q.inner.piece + '|' + q.inner.end);
        }
      }
      walk(p.def.pieces, p.def.snaps, id, trail.concat(name), forwarded);
    }
  };
  walk(table.pieces, table.snaps, null, [], new Set());
  return out;
}

const WorkshopBrick = { makePart, expand, unpack, findSealed, resolveEndpoint, offerablePorts, sealMachine, unwiredFacePorts };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopBrick;
if (typeof window !== 'undefined') window.WorkshopBrick = WorkshopBrick;
})();
