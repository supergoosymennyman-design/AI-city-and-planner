/**
 * BrainAdapter_line — the LINE brain: real regression, and the first learner in this toolkit that
 * KEEPS A RULE INSTEAD OF EXAMPLES YOU CAN POINT AT.
 *
 * WHAT IT DOES: it fits one straight rule through every studied row —
 *     guess = w1·feature1 + w2·feature2 + … + b
 * — choosing the weights that make the total squared miss as small as possible (ordinary least
 * squares, solved exactly by the normal equations). On the ice-cream table it lands on ~3 cups
 * per degree and ~+15 on a weekend, which is the rule the data was actually built from. THAT is
 * the moment: the machine did not memorise 48 days, it FOUND THE RULE, and the rule is two
 * numbers a child can read out loud and check against the world.
 *
 * WHY IT IS WORTH HAVING BESIDE THE NUMBER BRAIN (which is k-NN averaging):
 *   - The number brain can only ever answer between days it has seen; ask it about 40°C — hotter
 *     than every studied day — and it answers with the hottest days it knows. The line brain
 *     EXTRAPOLATES, because a rule keeps working past its evidence. (It is also how a line lies:
 *     extrapolate far enough and it promises impossible cups. Both halves are the lesson.)
 *   - Its Evidence is not "which rows voted" — it is the rule itself, per feature. Interpretability
 *     of a different kind: not "who", but "what it believes".
 *
 * THE PENALTY DIAL (`penalty`, 0..1 → λ): ridge regression. λ adds a cost for BIG weights, so the
 * fit is pulled toward a flatter, simpler rule. On a tiny noisy table, λ=0 chases the noise and
 * λ>0 visibly straightens it — overfitting and its cure, as one turnable knob. λ never touches the
 * intercept (penalising the level would just bias every answer downward).
 *
 * THE DEGREE DIAL (`degree`, 1..3, owner "yesss" 2026-08-28): the curve can actually curve.
 * degree>1 EXPANDS every CONTINUOUS raw-vector column with its own powers (x², and x³ at 3) before
 * fitting — same ordinary least squares, more columns. One-hot option columns and the trailing
 * level constant are NEVER expanded (a one-hot squared is the SAME one-hot; giving it a power
 * column would just hand the solver a duplicate, collinear one) — detected schema-free, straight
 * from the STUDIED ROWS themselves (a column every row holds at exactly 0 or 1 is one-hot; any row
 * showing a strict fraction makes it continuous), because learn() never sees the schema (only
 * view() does, and only as an opt for AXIS PICKING). Composes with the penalty dial: λ still skips
 * only the level constant, which expand() keeps as the array's last slot always (see expand()'s
 * own doc). State stays plain JSON (`contSlots`/`powerCols` are flat arrays of numbers).
 *
 * THE VECTOR IT WANTS: the RAW feature vector (Datasets.rawVec — scaled numbers, one-hot options,
 * and a trailing level constant 1), NOT the unit-normalised one every distance brain reads. A line
 * fitted on unit vectors cannot say "3 cups per degree", because dividing each row by its own
 * length makes the model non-linear in the features a child can see. The host passes `opts.raw`
 * and stores `ex.raw`; if neither is present this brain falls back to `vec` and still fits — the
 * numbers are just no longer in the child's units.
 *
 * Shelves whose names are not numbers are ignored (this brain answers with a NUMBER, so a "cat"
 * shelf teaches it nothing) — the same rule the number brain follows.
 *
 * value (0..1) = how much of the answer's spread the rule explains, clamped R² on the studied
 * rows. A rule that explains nothing reads 0; a perfect rule reads 1. It is a property of the
 * RULE, not of this query — an honest thing to show, and the app's sure line applies on top.
 *
 * Deterministic (no randomness, no clock); state is plain JSON (weights as a flat array).
 * Globals: window.BrainAdapter_line. CommonJS-exported for node --test and the kit checker.
 */
(function () {
  'use strict';

  // line.js is not byte-pinned to the intern kit (unlike knn/proto/number/grouper/neural — kit
  // law, tests/brains.test.js pins those), so no require-fallback dance is needed for anything
  // this file reaches for — view() below is entirely self-contained (spec §5.5a: the fitline
  // picture is NOT chart.js's scatter geometry — see view()'s own doc for why).

  var MEMO_MAX = 4;
  var memo = [];

  function parseNumber(label) {
    var s = String(label === undefined || label === null ? '' : label).trim().replace(/,/g, '');
    if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function fmt(n) {
    var r = Math.round(n * 100) / 100;
    return String(Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }
  /** The vector this brain fits on: raw when the sense supplies it, else whatever it was given. */
  function rowOf(ex) { return (ex && Array.isArray(ex.raw) && ex.raw.length) ? ex.raw : (ex && ex.vec); }

  /** degree always lands on a whole number in 1..3 — junk (NaN, a string, out of range) clamps to
   *  the honest floor (1 = a straight line, exactly what this brain did before the dial existed). */
  function clampDegree(v) {
    var n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 1;
  }

  /**
   * Which raw-vector columns are CONTINUOUS, schema-free: every column except the trailing level
   * constant (always the LAST slot — Datasets.rawVec's own layout, `slotLayout`'s doc below) is a
   * candidate; it is called continuous the moment ANY studied row shows a strict fraction there
   * (a one-hot/options column only ever holds an EXACT 0 or 1, every row, by construction). This is
   * the ONLY signal learn() has — it never sees the schema, only view() does, and only as an opt
   * for axis picking, not for fitting.
   * @param {Array<{x:number[]}>} rows  UNEXPANDED rows (rowOf's own output, before expand())
   * @param {number} d0  the unexpanded row width
   * @returns {number[]} column indices, ascending
   */
  function detectContinuousSlots(rows, d0) {
    var out = [];
    for (var j = 0; j < d0 - 1; j++) {
      for (var r = 0; r < rows.length; r++) {
        var v = rows[r].x[j];
        if (v > 1e-9 && v < 1 - 1e-9) { out.push(j); break; }
      }
    }
    return out;
  }

  /**
   * Append power columns for every CONTINUOUS slot (degree dial) — the array's own length never
   * shrinks, and the trailing LEVEL CONSTANT stays the absolute last slot always (moved to the end
   * again after the new columns), because two invariants elsewhere depend on that position never
   * moving: the ridge penalty (`learn()`, "λ never touches the intercept") skips only index d-1,
   * and `rule()`/`answer()` (`w[w.length-1]` = base). Order: original feature columns (level
   * excluded), then power columns in `for p=2..degree: for each contSlot` order (the SAME order
   * `powerCols` records, so a caller can name column j back to (slot, power) without re-deriving
   * it), then the level constant. A no-op (returns a copy) at degree<=1 or with nothing continuous
   * to expand — byte-identical to this brain's pre-degree-dial behaviour.
   * @param {number[]} x  an UNEXPANDED raw vector (length d0)
   * @param {number[]} contSlots  from detectContinuousSlots
   * @param {number} degree  1..3 (already clamped)
   * @returns {number[]}
   */
  function expand(x, contSlots, degree) {
    if (degree <= 1 || !contSlots || !contSlots.length || !x.length) return x.slice();
    var head = x.slice(0, x.length - 1), level = x[x.length - 1];
    for (var p = 2; p <= degree; p++) for (var k = 0; k < contSlots.length; k++) head.push(Math.pow(x[contSlots[k]], p));
    head.push(level);
    return head;
  }

  var POWER_SUFFIX = { 2: '²', 3: '³' }; // ² ³ — only these ever appear (degree clamps 1..3)
  /**
   * Which (original slot, power) an APPENDED degree-dial column at expanded index `j` represents,
   * or null for an original feature slot or the level constant (both untouched by expand(), and
   * both need their OWN, un-power-suffixed name). Shared by answer()'s evidence chips and rule()'s
   * terms so the naming can never drift between the two the way two hand-rolled copies eventually
   * would (the extract-decisions law).
   * @param {object} state  a learned state (state.d0/state.powerCols/state.w present)
   * @param {number} j  a column index into the EXPANDED vector (0..state.w.length-1)
   * @returns {{slot:number, power:number}|null}
   */
  function powerColInfo(state, j) {
    var d0 = state.d0 || 0;
    if (j < d0 - 1 || j === state.w.length - 1) return null;
    return (state.powerCols && state.powerCols[j - (d0 - 1)]) || null;
  }

  /**
   * Solve (A + λI)·w = c by Gauss-Jordan with partial pivoting. A is d×d and SYMMETRIC here
   * (it is XᵀX), so no conditioning heroics are needed beyond the pivot and the ridge itself.
   * A singular system (a feature that never varies, or one-hot columns that sum to the level
   * constant) is handled by the tiny jitter added to the diagonal below, so this always returns.
   * @returns {number[]|null} w, or null if the system could not be solved at all.
   */
  function solve(A, c, d) {
    var M = [];
    for (var i = 0; i < d; i++) {
      M.push(A[i].slice());
      M[i].push(c[i]);
    }
    for (var col = 0; col < d; col++) {
      var piv = col;
      for (var r = col + 1; r < d; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      var p = M[col][col];
      for (var j = col; j <= d; j++) M[col][j] /= p;
      for (var r2 = 0; r2 < d; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col];
        if (!f) continue;
        for (var j2 = col; j2 <= d; j2++) M[r2][j2] -= f * M[col][j2];
      }
    }
    var w = [];
    for (var k = 0; k < d; k++) w.push(M[k][d]);
    return w;
  }

  /**
   * Fit the rule. Examples whose shelf name is a number become (x, y) pairs; everything else is
   * dropped. Returns plain JSON: the weights, the penalty they were fitted under, and the fit
   * quality — enough for answer() and for a panel to read the rule out loud.
   * @param {Array<{id:number,label:string,vec:number[],raw?:number[]}>} examples
   * @param {{penalty?:number}} [opts] penalty 0..1 (ridge λ = penalty scaled by the data's size)
   */
  function learn(examples, opts) {
    var penalty = Math.max(0, Math.min(1, (opts && Number(opts.penalty)) || 0));
    var degree = clampDegree(opts && opts.degree);
    var rows = [], i;
    for (i = 0; i < (examples || []).length; i++) {
      var ex = examples[i];
      var x = rowOf(ex);
      if (!ex || !Array.isArray(x) || !x.length) continue;
      var y = parseNumber(ex.label);
      if (y === null) continue;
      // id rides along so view() can name a point back to its crate — never re-derived, the
      // SAME id learn() was handed (the honesty rule's sibling: a picture must not invent
      // identity any more than it invents a residual).
      rows.push({ x: x, y: y, id: (ex.id === undefined ? null : ex.id) });
    }
    var d0 = rows.length ? rows[0].x.length : 0;
    // The degree dial (owner "yesss"): which columns are continuous, decided ONCE here from the
    // studied rows (schema-free — see detectContinuousSlots' own doc), then every row expanded the
    // same way. powerCols records which (slot, power) each appended column represents, in the
    // exact order expand() appends them, so answer()/rule() can name a squared/cubed term back
    // without re-deriving the mapping.
    var contSlots = detectContinuousSlots(rows, d0);
    var powerCols = [];
    for (var p = 2; p <= degree; p++) for (var k = 0; k < contSlots.length; k++) powerCols.push({ slot: contSlots[k], power: p });
    for (i = 0; i < rows.length; i++) rows[i].x = expand(rows[i].x, contSlots, degree);
    var d = rows.length ? rows[0].x.length : 0;
    // rows: the taught (x, y) pairs, kept on the state (already EXPANDED — the SAME columns the
    // fit itself used) so view() can draw the SAME rows the fit used — a second, separately-
    // derived copy of "what was taught" is exactly the kind of drift the honesty rule (spec §5.1)
    // exists to forbid. d0 is the UNEXPANDED width — the shape a schema/query/test-mark vector
    // arrives in — kept alongside d (the fitted, possibly degree-expanded, width) so every other
    // function can tell the two spaces apart without re-deriving either.
    var state = { w: null, d: d, d0: d0, degree: degree, contSlots: contSlots, powerCols: powerCols, n: rows.length, penalty: penalty, r2: 0, ybar: 0, rmse: null, rows: rows };
    if (rows.length < 2 || !d) return state;

    // Memoise by a fingerprint of (rows, penalty, degree): the host calls learn(ALL examples) on
    // every read (kit rule — no hidden state), and a 10 Hz belt must not refit a system per crate.
    // degree rides in the fingerprint explicitly (not just inferred from `d`, which two different
    // degrees could coincidentally share when nothing is continuous) — the SAME rows fitted at two
    // different degrees must never collide on one cached state.
    var fp = penalty + '|' + degree + '|' + rows.length + '|' + d + '|';
    for (i = 0; i < rows.length; i++) fp += rows[i].y + ',' + rows[i].x[0] + ';';
    for (i = 0; i < memo.length; i++) if (memo[i].fp === fp) return memo[i].state;

    // Normal equations: A = XᵀX + λI (the level column is NOT penalised), c = Xᵀy.
    var A = [], c = [], r, j, k;
    for (i = 0; i < d; i++) { A.push(new Array(d).fill(0)); c.push(0); }
    for (r = 0; r < rows.length; r++) {
      var xr = rows[r].x;
      for (j = 0; j < d; j++) {
        c[j] += xr[j] * rows[r].y;
        for (k = 0; k < d; k++) A[j][k] += xr[j] * xr[k];
      }
    }
    // λ scales with the number of rows so the same dial means the same strength on a 12-row table
    // and a 48-row one. The last slot is the level constant — never penalised.
    var lambda = penalty * rows.length;
    for (i = 0; i < d; i++) A[i][i] += (i === d - 1 ? 0 : lambda) + 1e-8;
    var w = solve(A, c, d);
    if (!w) return state;
    state.w = w;

    // Fit quality on the rows it was fitted to: clamped R², plus the plain-English rmse.
    var ybar = 0;
    for (r = 0; r < rows.length; r++) ybar += rows[r].y;
    ybar /= rows.length;
    var ssRes = 0, ssTot = 0;
    for (r = 0; r < rows.length; r++) {
      var yh = 0;
      for (j = 0; j < d; j++) yh += w[j] * rows[r].x[j];
      ssRes += (rows[r].y - yh) * (rows[r].y - yh);
      ssTot += (rows[r].y - ybar) * (rows[r].y - ybar);
    }
    state.ybar = ybar;
    state.rmse = Math.sqrt(ssRes / rows.length);
    state.r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

    memo.push({ fp: fp, state: state });
    if (memo.length > MEMO_MAX) memo.shift();
    return state;
  }

  /**
   * Apply the rule. Evidence is the rule itself — one line per feature, showing what that feature
   * contributed to THIS answer (weight × this row's value), so a child can see where the number
   * came from: "temperature put in 45, the weekend put in 15, the base is −30".
   */
  function answer(state, vec, opts) {
    try {
      if (!state || !Array.isArray(state.w) || !state.w.length) return null;
      // The query arrives UNEXPANDED (the same raw space the host/schema/a test-mark vector all
      // speak — state.d0 wide); expand() re-derives the SAME extra columns learn() fitted on
      // (state.contSlots/state.degree, frozen at learn() time), so a degree>1 fit answers a fresh
      // query exactly as honestly as it answered its own studied rows.
      var x0 = (opts && Array.isArray(opts.raw) && opts.raw.length) ? opts.raw : vec;
      if (!Array.isArray(x0) || x0.length !== state.d0) return null;
      var x = expand(x0, state.contSlots, state.degree);
      if (x.length !== state.w.length) return null;
      var yh = 0, parts = [], j;
      for (j = 0; j < state.w.length; j++) {
        yh += state.w[j] * x[j];
        parts.push({ i: j, share: state.w[j] * x[j] });
      }
      // Biggest contributions first — the ones that actually made this answer.
      parts.sort(function (a, b) { return Math.abs(b.share) - Math.abs(a.share) || a.i - b.i; });
      var names = (opts && opts.dimNames) || [];
      /** An evidence chip's name: the original feature/level name, or (degree dial) that same
       *  feature's name with a ²/³ mark for an appended power column. */
      var nameAt = function (j2) {
        var pc = powerColInfo(state, j2);
        if (pc) return (names[pc.slot] || ('part ' + (pc.slot + 1))) + (POWER_SUFFIX[pc.power] || '');
        if (j2 === state.w.length - 1) return names[state.d0 - 1] || 'level'; // the level constant, always last
        return names[j2] || ('part ' + (j2 + 1));
      };
      return {
        label: fmt(yh),
        value: Math.max(0, Math.min(1, state.r2)),
        evidence: parts.slice(0, 4).map(function (p) {
          var nm = nameAt(p.i);
          return { label: nm, distance: null, display: nm + ' put in ' + fmt(p.share) };
        }),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * The rule in words, for the panel: one line per feature in the child's own units when the
   * sense supplies dims (span converts "per scaled unit" into "per degree"). A degree-dial power
   * column reports under its base feature's name with a ²/³ mark, span 1 — a squared/cubed term's
   * own units are not "per real unit" any more, so the linear per-unit conversion would mislead.
   * @returns {{terms:Array<{name:string, per:number, raw:number}>, base:number, r2:number, rmse:number}|null}
   */
  function rule(state, dims) {
    if (!state || !Array.isArray(state.w) || !state.w.length) return null;
    var w = state.w, terms = [], j;
    for (j = 0; j < w.length - 1; j++) {
      var pc = powerColInfo(state, j);
      var nm, span;
      if (pc) {
        var base = dims && dims[pc.slot];
        nm = (base ? base.name : ('part ' + (pc.slot + 1))) + (POWER_SUFFIX[pc.power] || '');
        span = 1;
      } else {
        var d = (dims && dims[j]) || null;
        nm = d ? d.name : ('part ' + (j + 1));
        span = (d && d.span) || 1;
      }
      terms.push({ name: nm, per: w[j] / span, raw: w[j] });
    }
    return { terms: terms, base: w[w.length - 1], r2: state.r2, rmse: state.rmse };
  }

  /**
   * A schema feature's raw-vector slot span: numeric → 1 scaled slot, options → one-hot over
   * EVERY option. Mirrors Datasets.rawVec's own layout exactly (logic/datasets.js:234-244: for
   * each schema feature in order, an options feature pushes one 0/1 per option, a number feature
   * pushes ONE (x−min)/(max−min); then, past every feature, one trailing level constant `1`).
   * `layout.total` is therefore the full raw vector length this schema describes, level included.
   * @param {Array<{kind:'number'|'options', options?:string[]}>} features
   * @returns {{slots:Array<{feature:object, start:number, len:number}>, total:number}}
   */
  function slotLayout(features) {
    var offset = 0, slots = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var len = f.kind === 'options' ? ((f.options && f.options.length) || 0) : 1;
      slots.push({ feature: f, start: offset, len: len });
      offset += len;
    }
    return { slots: slots, total: offset + 1 };
  }
  function slotOf(layout, feature) {
    for (var i = 0; i < layout.slots.length; i++) if (layout.slots[i].feature === feature) return layout.slots[i];
    return null;
  }
  /** scaled 0..1 → the child's own unit — the exact inverse of Datasets.rawVec's number scaling. */
  function unscale(f, scaled) { return (f.max > f.min) ? f.min + scaled * (f.max - f.min) : f.min; }
  /** the child's own unit → scaled 0..1 — the exact forward of that same scaling, needed only to
   *  SAMPLE the line at a chosen child-unit x (a taught row's own x is read straight off its raw
   *  vector; this is for the two endpoints of the drawn line, which are not any row's x). */
  function scaleOf(f, x) { return (f.max > f.min) ? (x - f.min) / (f.max - f.min) : 0; }

  /**
   * Which of the THREE §5.5a projections this schema earns, decided from the schema's SHAPE
   * alone, never from the data — the code picks, the child does not. `layout` must already be
   * known to fully describe the fitted vector (layout.total === state.w.length) — a schema that
   * only partially matches the fitted rows is rejected exactly like no schema at all, because a
   * feature axis for numbers that are not really the whole story is the one-feature-scatter lie
   * this task exists to remove (spec §5.5a).
   * @returns {{levels:boolean, numberFeature:object, numberSlot:object, optionFeature?:object, optionSlot?:object}|null}
   */
  function pickProjection(schema, layout) {
    if (!schema || !layout) return null;
    var numbers = schema.features.filter(function (f) { return f.kind === 'number'; });
    var options = schema.features.filter(function (f) { return f.kind === 'options'; });
    if (numbers.length === 1 && options.length === 0) {
      return { levels: false, numberFeature: numbers[0], numberSlot: slotOf(layout, numbers[0]) };
    }
    if (numbers.length === 1 && options.length === 1 &&
        Array.isArray(options[0].options) && options[0].options.length >= 1 && options[0].options.length <= 4) {
      return {
        levels: true,
        numberFeature: numbers[0], numberSlot: slotOf(layout, numbers[0]),
        optionFeature: options[0], optionSlot: slotOf(layout, options[0]),
      };
    }
    return null; // several continuous features, a wide options feature, or no clean shape — guess
  }

  /**
   * A raw vector for a SAMPLED point on a feature-mode line: the number feature's slot set to the
   * chosen scaled value, the option feature's slot one-hot at `levelIdx` (omitted for the single-
   * line projection), the trailing level constant 1 — every OTHER slot is 0, which stays honest
   * here because pickProjection only ever returns a projection whose schema accounts for EVERY
   * slot of the fitted vector (layout.total === state.w.length, checked before this is called).
   */
  function buildRaw(layout, proj, scaledX, levelIdx) {
    var raw = new Array(layout.total).fill(0);
    raw[proj.numberSlot.start] = scaledX;
    if (proj.levels && Number.isFinite(levelIdx)) raw[proj.optionSlot.start + levelIdx] = 1;
    raw[layout.total - 1] = 1;
    return raw;
  }
  /** Which one-hot level a taught row or the query sits on, or -1 if the slot carries none. */
  function levelOf(optionSlot, raw) {
    for (var i = 0; i < optionSlot.len; i++) if (raw[optionSlot.start + i] > 0.5) return i;
    return -1;
  }
  /** dims-shaped labels for rule(), built from the SCHEMA (display names) instead of Datasets.dims
   *  (raw nameKeys) — same slot order slotLayout() assumes, ending in the level constant. */
  function dimsFromSchema(schema) {
    var out = [];
    for (var i = 0; i < schema.features.length; i++) {
      var f = schema.features[i];
      if (f.kind === 'options') {
        var opts = f.options || [];
        for (var k = 0; k < opts.length; k++) out.push({ name: opts[k], span: 1 });
      } else {
        out.push({ name: f.name, span: (f.max - f.min) || 1 });
      }
    }
    out.push({ name: 'level', span: 1 });
    return out;
  }

  /**
   * The Line brain's own picture (spec §5.5a, ratified 2026-08-27 — supersedes the withdrawn
   * `kind: 'scatter'` attempt): the classic regression picture — data points, the best-fit
   * line(s), residual sticks, the query riding its line past the data if it must extrapolate —
   * projected onto whichever of the THREE HONEST x-axes the schema earns (never a child's pick,
   * never a raw feature the model does not truly move in isolation):
   *   1. one continuous feature            → the textbook: y vs that feature, one line.
   *   2. one continuous + one option (≤4)  → y vs the continuous feature, ONE PARALLEL LINE PER
   *      LEVEL (the ice-cream lesson: a weekday line and a weekend line, 15 apart) — every stick
   *      drops to its OWN level's line, so its length is the exact residual the fit minimized.
   *   3. anything wilder, or no schema     → x = what the rule itself says (the guess); the
   *      best-fit is the diagonal, and a point's vertical gap to it is its residual regardless of
   *      how many features fed the guess.
   * THE REGRESSION HONESTY LAW (§5.5a's sibling to §5.1): no stick may be drawn whose length
   * differs from the residual the fit actually minimized. Every sample below re-applies the
   * brain's OWN fitted weights (`state.w`) to a raw vector this function builds or reads straight
   * off `state.rows` (the SAME rows learn() fitted on) — never a separately-derived number.
   *
   * The QUERY's `yhat` is PARSED from `ans.label` — the literal text the child is shown — never
   * recomputed here (the same Ruling B number.js's view() follows): a picture whose marker
   * disagreed with the answer by a rounding hair would be exactly the kind of lie this spec exists
   * to remove. Every taught row's own `resid`/line sample stays full-precision — rounding is a
   * DISPLAY property of the one number being voted on, not of the fit itself.
   *
   * Box-independent BY DESIGN (fix round 2, replacing the withdrawn attempt's Finding 1): every
   * coordinate here is DATA — real x/y in the child's own units, or the model's own guess — never
   * a pixel. All pixel mapping happens at draw time in brain-view-art.js, which is what makes this
   * plan correct for a face drawn at a nonzero canvas offset AND a panel drawn at the origin,
   * without either caller (game.js's viewPlan ~3110, panelPlanFor ~2958) ever passing a box.
   *
   * Optional by contract (§6.1): an unfitted brain (no numeric shelf, or fewer than two rows)
   * returns null, honestly, same as proto/number.
   * @param {object} state  from learn()
   * @param {number[]} vec  the query, in the SAME raw space as state.rows[].x
   * @param {{label:string,value:number,evidence:Array}|null} ans  from answer() — the vote this
   *   picture must never disagree with
   * @param {{schema?:{features:Array<{id:string,name:string,unit?:string,kind:'number'|'options',min?:number,max?:number,options?:string[]}>}, axisGuessName?:string, baseWord?:string, rsqWord?:string}} [opts]
   * @returns {{kind:'fitline', axis:{mode:'feature'|'guess',name:string,unit:string},
   *            groups:Array<{key:string,name:string,line:Array<{x:number,yhat:number}>,points:Array<{x:number,y:number,resid:number,id:*}>}>,
   *            query:{x:number,yhat:number,group:number}|null,
   *            rule:{terms:Array<{name:string,weight:number}>,base:number,r2:number,baseWord:string,rsqWord:string}, empty:boolean}|null}
   */
  function view(state, vec, ans, opts) {
    try {
      if (!state || !Array.isArray(state.w) || !state.w.length) return null;
      if (!Array.isArray(state.rows) || state.rows.length < 2) return null;
      var w = state.w, d = w.length, i;
      var predict = function (x) {
        var yh = 0;
        for (var j = 0; j < d && j < x.length; j++) yh += w[j] * x[j];
        return yh;
      };
      // The degree dial: a SAMPLED point (buildRaw, below) is built in the UNEXPANDED raw space
      // (it only knows the schema's shape) — predictRaw re-expands it the SAME way learn() did
      // (state.contSlots/state.degree, fixed at learn() time) before predict() can honestly read
      // it. At degree 1 expand() is a no-op, so this is byte-identical to plain predict() then.
      var predictRaw = function (raw) { return predict(expand(raw, state.contSlots, state.degree)); };
      // d0: the UNEXPANDED row width — what a schema, a query vector, and a test-mark vector all
      // arrive in. d (above) is the FITTED width, d0 or wider once the degree dial expanded it.
      var d0 = state.d0 || d;

      var schema = opts && opts.schema;
      var layout = (schema && Array.isArray(schema.features) && schema.features.length) ? slotLayout(schema.features) : null;
      // Compare against d0 (the schema's own, unexpanded, shape), never d: a degree>1 fit has
      // d > d0 by construction, and comparing against d would reject every honest schema the
      // instant the curve dial left 1, silently dropping every reader back to the guess axis.
      if (layout && layout.total !== d0) layout = null; // the schema doesn't describe THIS rule's shape — stay honest
      var proj = layout ? pickProjection(schema, layout) : null;

      var qVec = (Array.isArray(vec) && vec.length === d0) ? vec : null;
      var qAnswer = (ans && typeof ans.label === 'string') ? parseNumber(ans.label) : null;
      // The query's group + x-position, filled in by whichever branch below actually runs.
      var queryGroup = null, queryX = null;

      // N sampled points per line (owner "yesss": "the curve can actually curve") — two endpoints
      // would silently flatten a genuinely curved degree>=2 fit back into a lie. Every sample
      // re-applies the brain's OWN predict (via predictRaw, above) to a raw vector buildRaw()
      // constructs at that x — the SAME honesty law every point/stick elsewhere here holds.
      var SAMPLE_N = 24;
      function sampleLine(loX, hiX, levelIdx) {
        var pts = [];
        for (var si = 0; si < SAMPLE_N; si++) {
          var t = si / (SAMPLE_N - 1);
          var x = loX + t * (hiX - loX);
          pts.push({ x: x, yhat: predictRaw(buildRaw(layout, proj, scaleOf(proj.numberFeature, x), levelIdx)) });
        }
        return pts;
      }

      var axis, groups;
      if (proj && proj.levels) {
        var levels = proj.optionFeature.options;
        groups = levels.map(function (levelName, li) {
          var pts = [];
          for (i = 0; i < state.rows.length; i++) {
            var r = state.rows[i];
            if (levelOf(proj.optionSlot, r.x) !== li) continue;
            pts.push({ x: unscale(proj.numberFeature, r.x[proj.numberSlot.start]), y: r.y, resid: r.y - predict(r.x), id: r.id });
          }
          var lo = pts.length ? pts[0].x : proj.numberFeature.min;
          var hi = pts.length ? pts[0].x : proj.numberFeature.max;
          for (var pi = 1; pi < pts.length; pi++) { if (pts[pi].x < lo) lo = pts[pi].x; if (pts[pi].x > hi) hi = pts[pi].x; }
          return { key: String(levelName), name: String(levelName), li: li, lo: lo, hi: hi, points: pts };
        });
        if (qVec) {
          var qLevel = levelOf(proj.optionSlot, qVec);
          if (qLevel >= 0 && qLevel < groups.length) {
            queryGroup = qLevel;
            queryX = unscale(proj.numberFeature, qVec[proj.numberSlot.start]);
            var qg = groups[qLevel];
            if (queryX < qg.lo) qg.lo = queryX;
            if (queryX > qg.hi) qg.hi = queryX;
          }
        }
        groups.forEach(function (g) {
          if (!(g.hi > g.lo)) { g.hi = g.lo + 1; g.lo -= 1; } // every row on this level shared one x — still draw a line
          g.line = sampleLine(g.lo, g.hi, g.li);
          delete g.li; delete g.lo; delete g.hi;
        });
        axis = { mode: 'feature', name: proj.numberFeature.name, unit: proj.numberFeature.unit || '' };
      } else if (proj) {
        var pts1 = state.rows.map(function (r) {
          return { x: unscale(proj.numberFeature, r.x[proj.numberSlot.start]), y: r.y, resid: r.y - predict(r.x), id: r.id };
        });
        var lo1 = pts1[0].x, hi1 = pts1[0].x;
        for (i = 1; i < pts1.length; i++) { if (pts1[i].x < lo1) lo1 = pts1[i].x; if (pts1[i].x > hi1) hi1 = pts1[i].x; }
        if (qVec) {
          queryGroup = 0;
          queryX = unscale(proj.numberFeature, qVec[proj.numberSlot.start]);
          if (queryX < lo1) lo1 = queryX;
          if (queryX > hi1) hi1 = queryX;
        }
        if (!(hi1 > lo1)) { hi1 = lo1 + 1; lo1 -= 1; }
        groups = [{ key: 'all', name: proj.numberFeature.name, line: sampleLine(lo1, hi1, null), points: pts1 }];
        axis = { mode: 'feature', name: proj.numberFeature.name, unit: proj.numberFeature.unit || '' };
      } else {
        // No usable schema, or a shape wilder than the two honest feature axes: project onto the
        // rule's OWN guess. The diagonal IS the best fit here (x === yhat by construction), so a
        // point's vertical gap to it is its residual at ANY dimensionality (spec §5.5a rule 3).
        var ptsG = state.rows.map(function (r) {
          var g = predict(r.x);
          return { x: g, y: r.y, resid: r.y - g, id: r.id };
        });
        var loG = ptsG.length ? ptsG[0].x : 0, hiG = loG;
        for (i = 1; i < ptsG.length; i++) { if (ptsG[i].x < loG) loG = ptsG[i].x; if (ptsG[i].x > hiG) hiG = ptsG[i].x; }
        if (qVec && Number.isFinite(qAnswer)) {
          queryGroup = 0;
          queryX = qAnswer; // on the guess axis the query's x IS the answer — the diagonal's own rule
          if (queryX < loG) loG = queryX;
          if (queryX > hiG) hiG = queryX;
        }
        if (!(hiG > loG)) { hiG = loG + 1; loG -= 1; }
        var guessName = (opts && opts.axisGuessName) || 'what the rule says';
        groups = [{ key: 'all', name: guessName, line: [{ x: loG, yhat: loG }, { x: hiG, yhat: hiG }], points: ptsG }];
        axis = { mode: 'guess', name: guessName, unit: '' };
      }

      var query = (queryGroup !== null && Number.isFinite(queryX) && Number.isFinite(qAnswer))
        ? { x: queryX, yhat: qAnswer, group: queryGroup } : null;

      // TEST MARKS (owner day-one ask, part 2, task-C brief's "mechanics for the test overlay"):
      // the reader's OWN guesses on crates it was never fed the truth for, riding these SAME axes
      // in a second colour — never a residual, never the truth (the reader's face never shows it;
      // the Checker's face keeps that picture — connection law). The host accumulates
      // {vec, yhat} run-scoped (an UNEXPANDED raw vector + the number the child was shown);
      // PROJECTING each mark onto x reuses the EXACT SAME `proj`/`unscale` this view() already
      // computed for the studied groups above — never a second, hand-rolled axis decision — so a
      // mark can never land somewhere the studied dots' own axis would disagree with. In guess
      // mode (no clean schema) the axis IS the model's own output, so a mark's x is simply its own
      // yhat — the diagonal, by construction, same as every studied point in that mode (spec note:
      // "Guess-axis mode: x = the guess itself — marks degenerate onto the diagonal; acceptable").
      var testMarks = [];
      var rawMarks = opts && Array.isArray(opts.testMarks) ? opts.testMarks : null;
      if (rawMarks) {
        for (i = 0; i < rawMarks.length; i++) {
          var tm = rawMarks[i];
          if (!tm || !Array.isArray(tm.vec) || tm.vec.length !== d0 || !Number.isFinite(tm.yhat)) continue;
          var tx = proj ? unscale(proj.numberFeature, tm.vec[proj.numberSlot.start]) : tm.yhat;
          testMarks.push({ x: tx, yhat: tm.yhat });
        }
      }

      // The rule sentence's CONNECTIVE WORDS ("base", "R²") are English UI text, not numbers —
      // game.js's viewPlan/panelPlanFor translate them via t() and hand them in here (the same
      // opts.axisGuessName mechanism above), because brain-view-art.js (the renderer that reads
      // plan.rule to build the sentence) has no reachable t() of its own. A caller that skips this
      // opt (a bare kit user, a pure test) still gets a working, honest English default.
      var baseWord = (opts && opts.baseWord) || 'base';
      var rsqWord = (opts && opts.rsqWord) || 'R²';
      var testMarksWord = (opts && opts.testMarksWord) || '';
      var ruleOut = rule(state, layout ? dimsFromSchema(schema) : null);
      var planRule = ruleOut
        ? { terms: ruleOut.terms.map(function (t) { return { name: t.name, weight: t.per }; }), base: ruleOut.base, r2: ruleOut.r2, baseWord: baseWord, rsqWord: rsqWord }
        : { terms: [], base: 0, r2: state.r2, baseWord: baseWord, rsqWord: rsqWord };

      return { kind: 'fitline', axis: axis, groups: groups, query: query, testMarks: testMarks, testMarksWord: testMarksWord, rule: planRule, empty: false };
    } catch (e) {
      return null;
    }
  }

  /** The kit's self-test: a clean line y = 2x + 1 must come back as slope 2, base 1. */
  function sampleCase() {
    return {
      examples: [
        { id: 1, label: '3', vec: [1, 1], raw: [1, 1] },
        { id: 2, label: '5', vec: [2, 1], raw: [2, 1] },
        { id: 3, label: '7', vec: [3, 1], raw: [3, 1] },
      ],
      query: [4, 1],
      expectLabel: '9',
    };
  }

  var adapter = {
    id: 'line',
    name: 'Line brain',
    note: 'Fits ONE straight rule through every example and keeps the rule, not the examples. It can answer past what it has seen — and the penalty dial makes the rule simpler.',
    wantsRaw: true,   // the host hands this brain Datasets.rawVec, not the unit vector
    dials: ['penalty', 'degree'],
    // this brain's evidence rows name FEATURES (a feature/level name + how much it put into the
    // answer — answer(), above, `nameAt(p.i)`), never a competing ANSWER — so the app's debugging
    // walk must not offer a "runner-up" for it at all: neither the number problem `votes: true`
    // guards against (that gate is for a vote SHARE) nor a bare label are meaningful here (a
    // feature name is not a rival answer; presenting one as "close behind" would be its own lie).
    // See ADAPTER.md's "Optional declarations" for the full three-way shape this mirrors.
    features: true,
    learn: learn,
    answer: answer,
    rule: rule,
    view: view,
    sampleCase: sampleCase,
  };
  if (typeof window !== 'undefined') window.BrainAdapter_line = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
