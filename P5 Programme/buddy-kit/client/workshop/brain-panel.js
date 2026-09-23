'use strict';
/**
 * The brain laboratory: a frozen observation and captured learner, with algorithm-specific
 * explanations and reversible local experiments (task 082). The host supplies data through
 * sessionFor; this renderer never reaches into game state. Native controls retain identity
 * during interaction. Choosing a known example is explicit and does not replace the original
 * observation; Restore original returns to the opening query and settings. Saved model weights
 * are immutable. Shared-shelf investigations capture their teaching examples at open.
 */
(function () {
  /**
   * Panel-only readability limit (Ruling O, task-7 brief). The engine itself never clamps k
   * (`clampDial`, logic/engine.js:887-901, has no k branch) — `Brain.kVoters` clamps only at the
   * point of use. This cap exists purely so the k-ring stays legible on an orbit and a turn
   * visibly changes something a child can count; the floor's own dial still bottoms out at 1.
   */
  var K_MAX = 12;

  /** @param {*} k  @returns {number} a whole number in [1, K_MAX] — never NaN, never out of range. */
  function clampK(k) {
    var n = Math.round(Number(k));
    if (!Number.isFinite(n)) n = 1;
    return Math.max(1, Math.min(K_MAX, n));
  }

  /**
   * The pure half (node-testable, zero DOM): a frozen decision + an action -> a NEW frozen
   * decision, or null. Actions: `setK`, `setBrain`, `close`.
   *   - `close` returns null — the panel is gone, not a stale hidden picture (spec: closing
   *     returns to live).
   *   - `setK` / `setBrain` return a NEW object whose `vec` is a COPY of `state.vec` — never the
   *     same array reference — so nothing downstream (least of all the belt moving on) can
   *     rewrite a moment this reducer already froze.
   *   - anything else is an honest no-op: the exact input state comes back, unmutated. A reducer
   *     that "corrected" or dropped an unknown action into some default would be exactly the kind
   *     of silent drift this screen exists to prevent.
   * `pieceId` and `tick` never change after open — they name WHICH crate and WHEN, and neither a
   * k turn nor a brain swap is asking a different question. `recordedLabel`/`recordedValue` (I7,
   * final whole-branch review) are the SAME kind of fact — the step's own historical answer,
   * frozen at open — so they ride through setK/setBrain unchanged exactly like pieceId/tick,
   * never recomputed and never dropped by a turn of the dials.
   * @param {{pieceId:string, vec:number[], brainId:string, k:number, tick:number, recordedLabel?:(string|null), recordedValue?:(number|null)}} state
   * @param {{type:string, k?:number, brainId?:string}} action
   * @returns {{pieceId:string, vec:number[], brainId:string, k:number, tick:number, recordedLabel?:(string|null), recordedValue?:(number|null)}|null}
   */
  function reduce(state, action) {
    if (!action || action.type === 'close') return null;
    var next = Object.assign({}, state, {vec:state.vec.slice()});
    if (action.type === 'setExample') { next.exampleId = action.id; return next; }
    if (state.locked && (action.type === 'setK' || action.type === 'setBrain' || action.type === 'setPenalty')) return state;
    if (action.type === 'setPenalty') { next.penalty = Math.max(0,Math.min(1,Number(action.value)||0));return next; }
    if (action.type === 'setK') {
      next.k=clampK(action.k); return next;
    }
    if (action.type === 'setBrain') {
      next.brainId=action.brainId;return next;
    }
    return state;
  }

  // ---------------------------------------------------------------------------------------------
  // The DOM shell. Everything below touches `document`/`window` and is exercised only by the
  // browser suite (tests/panel-browser.test.js) — never by node --test, which only ever requires
  // `reduce`/`K_MAX` off the module.exports guard at the bottom.
  // ---------------------------------------------------------------------------------------------
  var root = null;        // the overlay's own DOM root, appended into the host `open()` was given
  var panelState = null;  // the frozen decision, as last returned by reduce()
  var panelDeps = null;   // Ruling R's deps: {planFor, answerFor, brains, t, thumbOf}
  var selectedVoter = null; // an exampleId tapped in the picture, or null — which photo shows below it
  var currentPlan = null; // the plan drawn on `canvasEl` right now — read by its own pointerdown listener
  var previousFocus = null; // what had focus before open() — restored on close() (WAI-ARIA APG dialog pattern)

  // Persistent nodes, created once in open(), mutated in place by update(). Never recreated while
  // the panel is open — that identity is the whole fix for Finding 1/4.
  var closeBtn = null, pictureCol = null, canvasEl = null, voterHintEl = null, noPicEl = null;
  var answerCol = null, photoBox = null;
  var kLabelText = null, kIn = null, brainLabelText = null, sel = null;
  var capNoticeEl = null;
  // Fix round 1, Finding 8: the reader's own `k` widget has no max (game.js's WIDGETS.sense) and
  // the engine never clamps it (clampDial has no k branch) — a machine wearing k=20 is legal.
  // Ruling O sanctions the panel-only readability cap; it does NOT sanction opening on a silently
  // different k than the machine is actually wired to. `cappedFrom` remembers what open() saw
  // BEFORE clampK ran, so update() can say so out loud instead of just quietly answering under 12.
  var cappedFrom = null;
  var session = null, originalState = null, baseline = null, trainingView = false, unitsView=false;
  var introEl, legendEl, experimentEl, compareEl, queryEl, networkEl, trainingBtn, unitsBtn, exampleSelect, penaltyIn;
  function profile() {
    var all = typeof window !== 'undefined' && window.WorkshopBrainLab;
    return all && all.profiles[panelState.brainId] || {};
  }
  function word(part, vars) { return tOf('lab.'+panelState.brainId+'.'+part,vars); }
  function pretty(n) { return Number.isFinite(n) ? String(Number(n.toPrecision(4))) : ''; }

  /** deps.t, guarded (Ruling: guard every deps call — a broken/missing dep must never throw). */
  function tOf(key, vars) {
    try { return panelDeps && typeof panelDeps.t === 'function' ? panelDeps.t(key, vars) : key; }
    catch (e) { return key; }
  }
  /** Call a deps function defensively; any throw, or a non-function dep, is an honest null. */
  function safeCall(fn, arg) {
    if (typeof fn !== 'function') return null;
    try { return fn(arg); } catch (e) { return null; }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /**
   * Which plotted point sits under (x, y) in the panel canvas, for tap-a-voter. Positions come
   * from `WorkshopBrainViewArt.orbitPoints(plan, box, 'panel')` — the SAME formula `orbit()`
   * itself draws from (fix round 1, Finding 5: this used to keep its own copy of that layout
   * math, exactly the kind of second-copy drift `logic/floor-layout.js`'s `readerFace()`
   * docstring warns about, and already shipped once on this very plan).
   * Only `orbit` points carry an `exampleId` (one voter = one crate someone showed the eye); a
   * `centroids` point stands for a whole shelf's average and a `numberline` point isn't drawn on
   * this canvas shape at all — `orbitPoints` itself returns `[]` for both, so both stay
   * un-hit-testable on purpose rather than pointing a tap at a photo that does not honestly
   * belong to it.
   * @returns {{exampleId:number}|null}
   */
  function pointAt(plan, x, y, w, h) {
    if (typeof window === 'undefined' || !window.WorkshopBrainViewArt) return null;
    var positioned = window.WorkshopBrainViewArt.orbitPoints(plan, { x: 0, y: 0, w: w, h: h }, 'panel');
    var best = null, bd = 18; // a finger-sized hit radius, not the drawn dot's own few px
    for (var i = 0; i < positioned.length; i++) {
      var p = positioned[i];
      if (p.exampleId === undefined) continue;
      var d = Math.hypot(p.px - x, p.py - y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  }

  /** The canvas's OWN pointerdown listener, attached ONCE in open(). Reads `currentPlan` (set
   *  fresh by update() every render) rather than closing over a plan from whenever the listener
   *  was attached — the listener's identity never changes, but the plan it hit-tests must always
   *  be the one currently drawn. */
  function onCanvasTap(ev) {
    var r = canvasEl.getBoundingClientRect();
    var x = (ev.clientX - r.left) * (canvasEl.width / r.width);
    var y = (ev.clientY - r.top) * (canvasEl.height / r.height);
    var hit = pointAt(currentPlan, x, y, canvasEl.width, canvasEl.height);
    if (hit) { selectedVoter = hit.exampleId; update(); }
  }

  function dispatch(action) {
    if (action.type === 'reset') {
      panelState=Object.assign({},originalState,{vec:originalState.vec.slice()});
      selectedVoter=null;trainingView=false;unitsView=false;update();return;
    }
    var next = reduce(panelState, action);
    if (next === null) { close(); return; }
    panelState = next;
    if(action.type==='setBrain'){trainingView=false;unitsView=false;}
    selectedVoter = null; // a fresh k/brain answers fresh — an old tapped photo would now be a lie
    update();
  }

  /**
   * Build every DOM node ONCE. Called exactly once, from open(). Interactive controls
   * (`closeBtn`, `kIn`, `sel`, the canvas) get their event listeners attached HERE, never again —
   * `update()` only ever mutates their properties (`.value`, `.hidden`, `.selected`, redrawing
   * the canvas bitmap), so a control mid-interaction is never pulled out from under the finger.
   */

  /**
   * Match the canvas's backing store to the box the layout actually gave it.
   *
   * WHY: a canvas has no intrinsic responsive sizing — with `max-width:100%; height:auto` the
   * browser scales it by its ASPECT RATIO, so a wide window makes it TALL, and the picture
   * overran the controls at 2848px wide. Measuring the container is the only way a canvas
   * participates in a layout rather than dictating one. Tap coordinates already scale by
   * canvasEl.width / rect.width (onCanvasTap), so any backing-store size stays hit-accurate.
   */
  /** Re-draw at the new box size. Guarded: a resize after close must not throw. */
  function onResize() { if (root && panelState) update(); }

  function fitCanvas() {
    if (!canvasEl || !pictureCol) return;
    // Measure the canvas's allocated box, including the space now used by its legend/tabs.
    // A guessed parent height stretches circles into ellipses and changes apparent distances.
    var w = Math.max(1,Math.floor(canvasEl.clientWidth || pictureCol.clientWidth-24));
    var h = Math.max(1,Math.floor(canvasEl.clientHeight || 230));
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
  }

  function buildShell() {
    root = document.createElement('div');
    root.className = 'brainpanel';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', tOf('lab.aria'));
    root.tabIndex = -1;
    root.addEventListener('keydown', onTrapKey);

    var head = el('div', 'labhead');
    head.appendChild(el('h2', 'labtitle', tOf('lab.heading')));
    closeBtn = el('button', 'labclose', tOf('panel.close'));
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', function () { dispatch({ type: 'close' }); });
    head.appendChild(closeBtn);
    root.appendChild(head);

    capNoticeEl = el('div', 'labcap');
    root.appendChild(capNoticeEl);
    introEl=el('p','labintro');root.appendChild(introEl);

    var body = el('div', 'labbody');
    root.appendChild(body);

    pictureCol = el('div', 'labpicture');
    body.appendChild(pictureCol);
    legendEl=el('p','lablegend');pictureCol.appendChild(legendEl);
    canvasEl = document.createElement('canvas');
    // Sized to its container by fitCanvas() on every render — a fixed backing store with CSS
    // `height:auto` scales by ASPECT, so on a 2848-wide window the picture grew to ~957px tall
    // and spilled straight through the controls (owner, 2026-08-20). These are only the values
    // used before the first measurement.
    canvasEl.width = 900; canvasEl.height = 620;
    canvasEl.className = 'labcanvas';
    canvasEl.setAttribute('role','img');
    canvasEl.addEventListener('pointerdown', onCanvasTap);
    pictureCol.appendChild(canvasEl);
    voterHintEl = el('div', 'hint', tOf('lab.voterHint'));
    pictureCol.appendChild(voterHintEl);
    noPicEl = el('div', 'hint', tOf('lab.noPicture'));
    pictureCol.appendChild(noPicEl);
    networkEl=el('div','labnetwork');networkEl.tabIndex=0;networkEl.setAttribute('role','region');networkEl.setAttribute('aria-label',tOf('lab.neural.outputs'));pictureCol.appendChild(networkEl);
    trainingBtn=el('button','labtraining');trainingBtn.type='button';
    trainingBtn.addEventListener('click',function(){trainingView=!trainingView;unitsView=false;update();});
    unitsBtn=el('button','labinspectunits');unitsBtn.type='button';
    unitsBtn.addEventListener('click',function(){unitsView=!unitsView;trainingView=false;update();});
    var viewButtons=el('div','labviewbuttons');viewButtons.appendChild(unitsBtn);viewButtons.appendChild(trainingBtn);pictureCol.appendChild(viewButtons);

    // The reading column: answer, evidence, then the tapped voter's photo. Wrapped so the body is
    // a TWO-column grid — three loose children used to wrap into the left third and leave most of
    // a wide screen empty (owner, 2026-08-20).
    var side = el('div', 'labside');
    side.tabIndex=0;
    side.setAttribute('role','region');side.setAttribute('aria-label',tOf('lab.evidenceRegion'));
    body.appendChild(side);
    queryEl=el('div','labquery');side.appendChild(queryEl);
    answerCol = el('div', 'labanswer');
    side.appendChild(answerCol);
    photoBox = el('div', 'labphoto');
    side.appendChild(photoBox);
    compareEl=el('div','labcompare');compareEl.setAttribute('aria-live','polite');side.appendChild(compareEl);

    experimentEl=el('p','labexperiment');root.appendChild(experimentEl);

    var controls = el('div', 'labcontrols');
    root.appendChild(controls);

    var kRow = el('label', 'labk');
    kLabelText = document.createTextNode('');
    kRow.appendChild(kLabelText);
    kIn = document.createElement('input');
    kIn.type = 'range'; kIn.min = '1'; kIn.max = String(K_MAX); kIn.step = '1';
    kIn.className = 'labkslider';
    kIn.addEventListener('input', function () { dispatch({ type: 'setK', k: Number(kIn.value) }); });
    kRow.appendChild(kIn);
    controls.appendChild(kRow);
    var penaltyRow=el('label','labpenalty',tOf('lab.line.control'));
    penaltyIn=document.createElement('input');penaltyIn.type='range';penaltyIn.min='0';penaltyIn.max='1';penaltyIn.step='0.01';
    penaltyIn.setAttribute('aria-label',tOf('lab.line.control'));
    penaltyIn.addEventListener('input',function(){dispatch({type:'setPenalty',value:penaltyIn.value});});
    penaltyRow.appendChild(penaltyIn);controls.appendChild(penaltyRow);

    var brainRow = el('label', 'labbrainrow');
    brainLabelText = document.createTextNode(tOf('lab.brain'));
    brainRow.appendChild(brainLabelText);
    sel = document.createElement('select');
    sel.className = 'labbrain';
    sel.setAttribute('aria-label', tOf('lab.brain'));
    var brains = (panelDeps && Array.isArray(panelDeps.brains)) ? panelDeps.brains : [];
    for (var j = 0; j < brains.length; j++) {
      var o = document.createElement('option');
      o.value = brains[j].id; o.textContent = brains[j].name || brains[j].id;
      o.disabled=!!brains[j].disabled;
      sel.appendChild(o);
    }
    sel.addEventListener('change', function () { dispatch({ type: 'setBrain', brainId: sel.value }); });
    brainRow.appendChild(sel);
    controls.appendChild(brainRow);
    var tryRow=el('label','labtryrow',tOf('lab.tryInput'));
    exampleSelect=document.createElement('select');exampleSelect.className='labexample';
    exampleSelect.setAttribute('aria-label',tOf('lab.tryInput'));
    var first=el('option','',tOf('lab.original'));first.value='';exampleSelect.appendChild(first);
    ((session&&session.examples)||[]).forEach(function(ex){var opt=el('option','',String(ex.label)+' · '+(ex.display||ex.id));opt.value=String(ex.id);exampleSelect.appendChild(opt);});
    exampleSelect.addEventListener('change',function(){dispatch({type:'setExample',id:exampleSelect.value||null});});
    tryRow.appendChild(exampleSelect);tryRow.hidden=!session||!session.examples.length;controls.appendChild(tryRow);
    var reset=el('button','labreset',tOf('lab.reset'));reset.type='button';reset.addEventListener('click',function(){dispatch({type:'reset'});});controls.appendChild(reset);
  }

  /**
   * Mutate the existing shell to match `panelState`. Never touches the IDENTITY of `kIn`/`sel`/
   * `canvasEl`/`closeBtn` — only their content/attributes — so a drag or an open dropdown survive
   * every dispatch. Safe to call as often as needed (dispatch() calls it after every action).
   */
  function update() {
    if (!root) return;
    var info=profile();
    root.setAttribute('aria-label',word('title'));
    introEl.textContent=word('how');
    legendEl.textContent=word('legend');
    experimentEl.textContent=word('try')+' '+tOf('lab.experimentScope');
    var inputInfo=session ? session.inputFor(panelState) : null;
    queryEl.textContent='';queryEl.appendChild(el('div','peyebrow',tOf(panelState.exampleId?'lab.knownInput':'lab.original')));
    var preview=session&&(panelState.exampleId?safeCall(panelDeps.thumbOf,panelState.exampleId):session.originalPreview);
    if(preview){var previewCanvas=document.createElement('canvas');previewCanvas.width=160;previewCanvas.height=120;previewCanvas.setAttribute('role','img');previewCanvas.setAttribute('aria-label',tOf(panelState.exampleId?'lab.knownInput':'lab.original'));try{previewCanvas.getContext('2d').drawImage(preview,0,0,160,120);queryEl.appendChild(previewCanvas);}catch(_){/* the available feature description remains */}}
    if(session&&!panelState.exampleId&&session.originalText)queryEl.appendChild(el('p','labinputtext',session.originalText));
    if(inputInfo&&inputInfo.rows.length) inputInfo.rows.forEach(function(r){queryEl.appendChild(el('div','labmeasurement',r.name+': '+r.value));});
    else if(!preview&&!(session&&!panelState.exampleId&&session.originalText))queryEl.appendChild(el('p','hint',tOf('lab.featureInput',{n:panelState.vec.length})));
    var queryExample=session&&session.examples.find(function(e){return String(e.id)===String(panelState.exampleId);});
    if(queryExample)queryEl.appendChild(el('p','hint',String(queryExample.display||queryExample.id)));

    // Finding 8 (fix round 1): say OUT LOUD when the panel opened on a lower k than the machine
    // is actually wired to (the reader's own k widget has no max). Set once, at open() — turning
    // the panel's OWN k dial afterward is the child's deliberate choice, not a silent cap, so this
    // notice is not re-derived from panelState.k here.
    capNoticeEl.hidden = cappedFrom === null || info.control !== 'k' || !!panelState.locked;
    if (cappedFrom !== null) capNoticeEl.textContent = tOf('lab.capped', { from: cappedFrom, max: K_MAX });

    // The PICTURE — the panel budget of the SAME plan drawn on the face, re-answered under this
    // panel's own (possibly turned) k/brainId but the FROZEN vec (Ruling R: planFor re-answers
    // the frozen vec under state.k/state.brainId, never a fresh belt read).
    var plan = safeCall(panelDeps.planFor, panelState);
    currentPlan = plan;
    var hasPicture = !!(plan && !plan.empty && typeof window !== 'undefined' && window.WorkshopBrainViewArt);
    var network=plan&&plan.network;
    canvasEl.hidden = !hasPicture || (!!network&&!trainingView);
    canvasEl.setAttribute('aria-label',word('legend'));
    voterHintEl.hidden = !(hasPicture && plan.kind === 'orbit');
    voterHintEl.textContent=tOf('lab.inspectHint');
    networkEl.hidden=!network||trainingView;
    networkEl.setAttribute('aria-label',tOf(unitsView?'lab.neural.hidden':'lab.neural.outputs'));
    trainingBtn.hidden=!network;
    unitsBtn.hidden=!network;
    unitsBtn.textContent=tOf(unitsView?'lab.neural.showPrediction':'lab.neural.inspectUnits');
    unitsBtn.setAttribute('aria-pressed',String(unitsView));
    trainingBtn.textContent=tOf(trainingView?'lab.neural.showPrediction':'lab.neural.showTraining');
    networkEl.textContent='';
    if(network&&!trainingView) {
      if(!unitsView){
      networkEl.appendChild(el('div','peyebrow',tOf('lab.neural.outputs')));
      network.outputs.forEach(function(out){var row=el('div','laboutput');row.appendChild(el('span','',out.label));var meter=document.createElement('meter');meter.min=0;meter.max=1;meter.value=out.value;meter.setAttribute('aria-label',out.label);row.appendChild(meter);row.appendChild(el('strong','',pretty(out.value*100)+'%'));networkEl.appendChild(row);});
      }else{
      networkEl.appendChild(el('div','peyebrow',tOf('lab.neural.hidden')));
      networkEl.appendChild(el('p','hint',tOf('lab.neural.hiddenHelp')));
      var units=el('div','labunits');networkEl.appendChild(units);
      network.hidden.forEach(function(v,i){var unit=el('div','labunit'+(v>0?' active':''));unit.appendChild(el('span','',tOf('lab.neural.unit',{n:i+1})));unit.appendChild(el('strong','',pretty(v)));units.appendChild(unit);});
      }
    }
    if(network&&trainingView)legendEl.textContent=tOf('lab.neural.trainingHelp');
    // Finding 9 (fix round 1): no picture — an empty plan (nothing taught yet), a piece deleted
    // since the panel opened, or (corrected, final whole-branch review: no brain is view-less any
    // more after task 6) simply a throwing/misbehaving adapter — must not render an empty padded
    // box with no explanation. `lab.noPicture` says so in words instead, worded to what it really
    // means rather than naming a cause ("this algorithm") that is not always the true one.
    noPicEl.hidden = hasPicture;
    canvasEl.getContext('2d').clearRect(0,0,canvasEl.width,canvasEl.height);
    // The ANSWER, plainly, beside the picture — re-answered the same frozen-vec/turned-k way.
    var ans = safeCall(panelDeps.answerFor, panelState);
    answerCol.textContent = '';
    if (ans) {
      var val = Number.isFinite(ans.value) ? ans.value.toFixed(2) : '0.00';
      answerCol.appendChild(el('div', 'labsays', tOf('lab.answer', { label: ans.label })));
      answerCol.appendChild(el('div','labscore',tOf('lab.score.'+(info.score||'unknown'),{value:val})));
      answerCol.appendChild(el('p','hint',tOf('lab.scoreHelp.'+(info.score||'unknown'))));
      if(plan&&plan.kind==='orbit') {
        var voters=plan.points.filter(function(p){return p.voting;});
        var winning=voters.filter(function(p){return p.label===ans.label;}).length;
        answerCol.appendChild(el('p','labreason',tOf('lab.knn.reason',{n:winning,total:voters.length,label:ans.label})));
      }
      if(plan&&plan.kind==='piles')answerCol.appendChild(el('p','labreason',tOf('lab.grouper.reason',{n:plan.piles.length})));
      // I7 (final whole-branch review): the step's OWN recorded answer, side by side with the
      // re-answer above — a HISTORICAL step only (recordedLabel is null for a live face tap).
      // If shelves or k moved between the run and this inspection, the two lines can honestly
      // disagree; this is what stops that disagreement from being silent (fix round 1 already
      // closed the SAME gap for the runner-up — this closes it for the primary answer too).
      if (panelState.recordedLabel) {
        var rval = Number.isFinite(panelState.recordedValue) ? panelState.recordedValue.toFixed(2) : '0.00';
        answerCol.appendChild(el('div', 'labrecorded', tOf('lab.recorded', { label: panelState.recordedLabel, value: rval })));
      }
      // Evidence is shown WITH the picture, not instead of it. The orbit names only the voters
      // (everything else is a dot), so the list is where their distances are legible — and
      // gating it on !hasPicture left the whole reading column empty on a wide screen.
      if (Array.isArray(ans.evidence) && ans.evidence.length) {
        answerCol.appendChild(el('div', 'peyebrow', word('evidence')));
        for (var i = 0; i < ans.evidence.length; i++) {
          var v = ans.evidence[i];
          var dist = Number.isFinite(v.distance) ? tOf('lab.distance',{value:v.distance.toFixed(3)}) : '';
          var inspectable=v.id!==undefined;
          var row = el(inspectable?'button':'div', 'labvoter');
          if(inspectable){row.type='button';row.dataset.exampleId=String(v.id);(function(id){row.addEventListener('click',function(){selectedVoter=id;update();var replacement=Array.from(root.querySelectorAll('button.labvoter')).find(function(b){return b.dataset.exampleId===String(id);});if(replacement)replacement.focus();});})(v.id);}
          row.appendChild(el('span', '', (v.label&&v.display&&info.control==='k'&&panelState.brainId==='knn'?v.label+' · ':'')+(v.display || v.label || '')));
          if (dist) row.appendChild(el('span', '', String(dist).trim()));
          answerCol.appendChild(row);
        }
      }
      compareEl.textContent=baseline?tOf('lab.compare',{before:baseline.label,after:ans.label}):'';
    } else {
      answerCol.appendChild(el('div', 'hint', tOf(panelState.brainId==='number'||panelState.brainId==='line'?'lab.numericRequired':'lab.silent')));
      compareEl.textContent='';
    }

    // A tapped voter's photo — honestly empty when there is none to show (Ruling: a null plan/dep
    // must render an honest empty state, never throw).
    photoBox.textContent = '';
    photoBox.hidden = selectedVoter === null;
    if (selectedVoter !== null) {
      var selected=session&&session.examples.find(function(e){return String(e.id)===String(selectedVoter);});
      if(selected){photoBox.appendChild(el('strong','',selected.label+' · '+(selected.display||selected.id)));selected.rows.forEach(function(r){photoBox.appendChild(el('div','labmeasurement',r.name+': '+r.value));});}
      var img = safeCall(panelDeps.thumbOf, selectedVoter);
      if (img) {
        var pc = document.createElement('canvas');
        pc.width = 96; pc.height = 96;
        pc.setAttribute('role','img');
        pc.setAttribute('aria-label',selected ? selected.label+' · '+(selected.display||selected.id) : tOf('lab.knownInput'));
        var pctx = pc.getContext('2d');
        try { pctx.drawImage(img, 0, 0, 96, 96); } catch (e) { /* an unreadable frame stays blank, never throws */ }
        photoBox.appendChild(pc);
      } else if(!selected||!selected.rows.length) {
        photoBox.appendChild(el('div', 'hint', tOf('lab.noPhoto')));
      }
    }

    // Controls update IN PLACE (Finding 1): `.value`/text content only, never a
    // fresh node, so a finger mid-drag on `kIn` or an open `sel` dropdown is never interrupted.
    var kLabel = word('control', { k: panelState.k });
    kLabelText.data = kLabel;
    if (kIn.value !== String(panelState.k)) kIn.value = String(panelState.k);
    kIn.setAttribute('aria-label', kLabel);

    if (sel.value !== panelState.brainId) sel.value = panelState.brainId;
    kIn.closest('label').hidden=info.control!=='k'||!!panelState.locked;
    kIn.disabled = !!panelState.locked || info.control!=='k';
    sel.disabled=!!panelState.locked;
    sel.closest('label').hidden=!!panelState.locked;
    penaltyIn.closest('label').hidden=info.control!=='penalty'||!!panelState.locked;
    penaltyIn.disabled=info.control!=='penalty'||!!panelState.locked;
    penaltyIn.value=String(panelState.penalty===undefined?(session?session.initialOptions.penalty:0):panelState.penalty);
    penaltyIn.closest('label').firstChild.textContent=tOf('lab.line.penaltyValue',{value:penaltyIn.value});
    penaltyIn.setAttribute('aria-valuetext',tOf('lab.line.penaltyValue',{value:penaltyIn.value}));
    exampleSelect.value=panelState.exampleId===undefined||panelState.exampleId===null?'':String(panelState.exampleId);
    kIn.title = sel.title = panelState.locked ? tOf('library.fixed') : '';
    root.querySelector('.labtitle').textContent = word('title');
    if(panelState.locked)experimentEl.textContent=tOf('lab.fixedTry')+' '+tOf('lab.experimentScope');
    // All text/control changes must finish before measuring; otherwise an extra evidence row
    // can resize the flex layout after we drew and stretch the diagram unequally in x/y.
    if (hasPicture && !canvasEl.hidden) {
      fitCanvas();
      var ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      window.WorkshopBrainViewArt.draw(ctx, plan, { x: 0, y: 0, w: canvasEl.width, h: canvasEl.height }, { budget: 'panel' });
    }
  }

  /** Tab-trap (Finding 4): keep focus inside the lab while it is open — a keyboard/switch user
   *  must never tab straight through into the Floor's shelf sitting underneath this overlay. */
  function onTrapKey(ev) {
    if (ev.key !== 'Tab' || !root) return;
    var nodes = root.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])');
    var focusables = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.disabled && !n.hidden && n.getClientRects().length) focusables.push(n);
    }
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    var active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || !root.contains(active)) { ev.preventDefault(); last.focus(); }
    } else {
      if (active === last || !root.contains(active)) { ev.preventDefault(); first.focus(); }
    }
  }

  /**
   * Open the lab over `host` on `frozen` (Ruling P: the caller already read the frozen vec via
   * lastQueryVec — this file never does). `deps` are Ruling R's callbacks. Re-opening while
   * already open closes the old overlay first, so a second tap never stacks a duplicate DOM node.
   * @param {HTMLElement} host  the same container the Floor renders into — the lab is drawn OVER it
   * @param {{pieceId:string, vec:number[], brainId:string, k:number, tick:number}} frozen
   * @param {{planFor:Function, answerFor:Function, brains:Array, t:Function, thumbOf:Function}} deps
   */
  function open(host, frozen, deps, returnFocusTo) {
    if (!host || !frozen || !Array.isArray(frozen.vec)) return;
    close();
    panelDeps = deps || {};
    session=safeCall(panelDeps.sessionFor,frozen);
    if(session)panelDeps=Object.assign({},panelDeps,{planFor:session.planFor,answerFor:session.answerFor,brains:session.brains});
    // Route the incoming frozen decision through reduce()'s own k clamp — a caller that handed
    // in an out-of-range k (or none at all) must not silently open on it; this is the ONE
    // normalisation point, so nothing downstream has to re-check the invariant reduce() already
    // guarantees for every action after open.
    panelState = reduce(
      {
        pieceId: frozen.pieceId, vec: frozen.vec.slice(), brainId: frozen.brainId, k: frozen.k, tick: frozen.tick, locked: !!frozen.locked,
        // I7: only a HISTORICAL step (opened via the debugging walk) carries these — a live face
        // tap's `frozen` has no recordedLabel at all, so the subtitle simply never renders there.
        recordedLabel: frozen.recordedLabel !== undefined ? frozen.recordedLabel : null,
        recordedValue: frozen.recordedValue !== undefined ? frozen.recordedValue : null,
      },
      { type: 'setK', k: frozen.k }
    );
    if(session)panelState.penalty=session.initialOptions.penalty;
    originalState=Object.assign({},panelState,{vec:panelState.vec.slice()});
    baseline=safeCall(panelDeps.answerFor,originalState);
    trainingView=false;unitsView=false;
    // Finding 8: remember the PRE-clamp k, if clamping actually changed anything — a machine
    // wired to k=20 (the widget has no max) must not open the lab silently answering under 12.
    cappedFrom = Number.isFinite(Number(frozen.k)) && Number(frozen.k) > K_MAX ? Number(frozen.k) : null;
    selectedVoter = null;
    // WAI-ARIA APG dialog pattern: remember what had focus, so close() can put it back. The
    // FACE itself is not a focusable node (floor.js's canvas is aria-hidden by design — it
    // carries no accessible name to land keyboard focus on), so this restores whatever the
    // keyboard/switch user's focus actually was, not a literal "the tapped model" node — there
    // isn't one to give focus to without inventing a per-model proxy element, out of scope here.
    // floor.js captures this BEFORE the tap resolves and hands it in: a pointerdown on the
    // canvas has ALREADY blurred whatever had focus, so by the time open() runs
    // document.activeElement is <body> and restoring it on close would strand the user.
    previousFocus = (returnFocusTo && typeof returnFocusTo.focus === 'function') ? returnFocusTo : document.activeElement;
    buildShell();
    host.appendChild(root);
    update();
    closeBtn.focus(); // move focus INTO the lab — the other half of the trap in onTrapKey
    // The picture is measured, so a window resize changes it. Re-render rather than leave a
    // backing store that no longer matches the box it is stretched across.
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onResize);
  }

  /** Close back to live — remove the overlay, drop every reference (Ruling: closing returns to
   *  live rather than leaving a stale picture on screen), and restore focus to wherever it was
   *  before open() (Finding 4). Safe to call when nothing is open. */
  function close() {
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onResize);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    var toFocus = previousFocus;
    root = null; panelState = null; panelDeps = null; selectedVoter = null; currentPlan = null;
    closeBtn = null; pictureCol = null; canvasEl = null; voterHintEl = null; noPicEl = null;
    answerCol = null; photoBox = null; kLabelText = null; kIn = null; brainLabelText = null; sel = null;
    capNoticeEl = null; cappedFrom = null;
    previousFocus = null;
    session=null;originalState=null;baseline=null;trainingView=false;unitsView=false;
    if (toFocus && typeof toFocus.focus === 'function' && document.contains(toFocus)) {
      try { toFocus.focus(); } catch (e) { /* a detached or unfocusable node — nothing to do */ }
    }
  }

  /** Test seam only (mirrors floor.js's own `debug()`): the held frozen decision, or null when
   *  closed. Browser suites use this to assert the query never drifts while the belt keeps
   *  moving — the one invariant this whole file exists to hold. */
  function debug() { return { state: panelState }; }

  var BrainPanel = { reduce: reduce, K_MAX: K_MAX, open: open, close: close, debug: debug };
  if (typeof module !== 'undefined' && module.exports) module.exports = BrainPanel;
  if (typeof window !== 'undefined') window.BrainPanel = BrainPanel;
})();
