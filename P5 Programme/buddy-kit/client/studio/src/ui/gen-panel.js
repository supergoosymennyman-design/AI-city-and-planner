/**
 * gen-panel.js — the "Make it real" / "Make from words" overlay (design doc §3 and §7).
 *
 * It renders the pure state from `ai/gen-flow.js` and runs the effect that state names; every button
 * only dispatches an event. The child's words are only ever set with textContent / value (never
 * innerHTML). Nothing is sent until an adult has saved a key: without one the flow opens on Settings.
 */
import * as THREE from 'three';
import { initialState, reduce, FIRST_STEP, SECOND_STEP, TEXTURE_STEP } from '../ai/gen-flow.js';
import { buildEditPrompt, buildWordsPrompt, colourList, splitAroundWords } from '../ai/gen-prompt.js';
import {
  routeWeights, STEP_WORDS, EXPECTED_MS, overallFraction, estimatedFraction, reportedFraction, detailText,
} from '../ai/gen-progress.js';
import { ERROR_TEXT, GenError, safeGenError, redact } from '../ai/gen-service.js';
import { GEN_STEPS, credentialValues, loadGenConfig, saveGenConfig, isRouteReady } from '../ai/gen-config.js';
import { anglesFromDirection, MAX_TILT } from '../ai/gen-angles.js';
import { shapesToPicture, scopeLabel } from '../ai/gen-scope.js';
import {
  MODEL_CATALOGUE, PROVIDER_CATALOGUE, capabilityLabel, modelById, modelsForStep, resolveModelControls,
} from '../ai/gen-models.js';
import { importGLBFile } from '../io/gltf.js';
import { bakeAndPlace, disposeModel, replacementShapes } from '../ai/gen-place.js';

const STEP_NAMES = {
  edit: 'Redesign the four views', views3d: 'Four views to 3D', picture: 'Words to picture',
  picture3d: 'Picture to 3D', texture: 'Texture the 3D mesh',
};
const VIEW_LABELS = { front: 'Front', left: 'Left', back: 'Back', right: 'Right' };

/** el('button', {class, onclick, ...}, 'text' | Node, ...). Strings become text nodes (never HTML). */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * Any thrown thing → {code, message, detail} for the error view.
 *
 * The child reads `message`, which is always one of ERROR_TEXT's fixed public sentences. The adult
 * beside them reads `detail`, which says WHICH thing broke. Dropping detail here (as this did until
 * 09-20) left "Something went wrong" as the only evidence of a live failure, which made a real bug
 * — the 3D Space's gr.update wrapper — undiagnosable from the screen.
 *
 * Detail is redacted HERE against the saved keys, not merely trusted: raw errors arrive from
 * injected deps, settings, parsers and provider setup, and a GenError's detail could be built by an
 * injected service. Redacting an already-redacted string is a no-op, so this costs nothing.
 */
function toGenError(err) {
  try {
    let keys = [];
    try { keys = credentialValues(loadGenConfig()); } catch (e) { /* settings unreadable */ }
    if (err instanceof GenError) return new GenError(err.code, redact(err.detail, keys));
    return safeGenError(err, keys, true);
  } catch (e) {
    return new GenError('failed');
  }
}

export class GenPanel {
  /**
   * @param {HTMLElement} overlay the #gen-overlay element (contains #gen-root)
   * @param {{service: {runStep: Function, checkAll: Function}, capture: Function, splitGrid: Function,
   *   prepareModel: Function, commitModel: Function, disposeModel: Function,
   *   loadSample: Function, studio: Function, cameraDirection: Function, toast: object}} deps
   */
  constructor(overlay, deps) {
    this.overlay = overlay;
    this.root = overlay.querySelector('#gen-root');
    this.deps = deps;
    this.state = null;
    this.urls = [];
    this.session = null;
    this.operation = null;
    this.preview = null;
    this.status = {};
    this.runStartedAt = null;
    this.lastFraction = 0;
    this.editingPrompt = false;
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  /** Debug/test seam (window.__gen): swap the service, e.g. for a fake that needs no GPU. */
  setService(service) {
    this.deps.service = service;
  }

  isOpen() {
    return !!this.state;
  }

  /** @param {'A'|'B'} route A = Make it real (the build), B = Make from words */
  open(route) {
    this.close();
    this.session = {};
    this.editingPrompt = false;
    const cfg = loadGenConfig();
    this.state = initialState(route, isRouteReady(cfg, route), cfg.models.texture !== 'none', this.detailLevelFor(route, cfg));
    this.overlay.classList.add('show');
    this.render();
    this.runEffect();
  }

  close() {
    this.cancelOperation();
    this.session = null;
    this.stopPreview();
    this.revokeUrls();
    this.state = null;
    this.overlay.classList.remove('show');
    this.root.replaceChildren();
  }

  /** Apply an event; `render: false` for keystrokes, so the words box keeps its focus and caret. */
  dispatch(event, { render = true } = {}) {
    if (!this.state) return;
    if (['open-settings', 'settings-saved', 'back', 'cancelled'].includes(event.type)) this.cancelOperation();
    this.state = reduce(this.state, event);
    if (render) this.render();
    this.runEffect();
  }

  current(op) {
    return !!this.state && this.session === op.session && this.operation === op && !op.ctrl.signal.aborted;
  }

  beginOperation(kind) {
    this.cancelOperation();
    const op = { kind, session: this.session, ctrl: new AbortController(), ticker: null, status: {}, fraction: 0, runStartedAt: null };
    this.operation = op;
    return op;
  }

  cancelOperation() {
    const op = this.operation;
    this.operation = null; // invalidate first, before abort callbacks can run
    if (op) { this.stopTicker(op); op.ctrl.abort(); }
  }

  cancelActive() {
    this.cancelOperation();
    this.dispatch({ type: 'cancelled' }); // immediate even if a dependency ignores abort
  }

  async runEffect() {
    const s = this.state;
    if (!s || !s.effect) return;
    this.state = { ...s, effect: null }; // consume once BEFORE starting any async work
    if (s.effect === 'close') { this.close(); return; }
    const op = this.beginOperation(s.effect);
    try {
      if (s.effect === 'capture') {
        // The scope is worked out ONCE and travels with the pictures, so the line under them
        // always describes the sheet on screen rather than whatever is selected by the time it
        // renders — the child can click away in the studio while a capture is in flight.
        const scope = shapesToPicture(this.deps.studio(), s.wholeBuild);
        const snapshot = await this.deps.capture(scope.list, {
          turn: s.turn, tilt: s.tilt, signal: op.ctrl.signal,
        });
        if (this.current(op)) this.dispatch({ type: 'captured', snapshot: { ...snapshot, scope } });
      } else if (s.effect === 'run') {
        await this.runStep(s, op);
      } else if (s.effect === 'add') {
        const replace = s.route === 'A' && Array.isArray(s.snapshot?.scope?.list)
          ? s.snapshot.scope.list
          : null;
        const model = await this.deps.prepareModel(s.result, { words: s.words, sample: s.sample, replace }, { signal: op.ctrl.signal });
        if (!this.current(op)) { this.deps.disposeModel(model); return; }
        try {
          // No await between identity check and commit. Repeated clicks have no add effect.
          this.deps.commitModel(model, { replace });
        } catch (err) {
          if (!model.parent) this.deps.disposeModel(model);
          throw err;
        }
        if (this.current(op)) this.dispatch({ type: 'added' });
      } else if (s.effect === 'sample') {
        const sample = await this.deps.loadSample({ signal: op.ctrl.signal });
        if (this.current(op)) this.dispatch({ type: 'sample-loaded', picture: sample.grid, model: sample.model });
      }
    } catch (err) {
      if (this.current(op)) this.dispatch({ type: 'failed', error: toGenError(err) });
    } finally {
      this.stopTicker(op); // only this operation's timer, never a newer one
      if (this.operation === op) this.operation = null;
    }
  }

  async runStep(s, op) {
    const { route, step } = s;
    this.startTicker(route, step, op);
    const input = await this.inputFor(s);
    if (!this.current(op)) return;
    const result = await this.deps.service.runStep(step, input, {
      signal: op.ctrl.signal,
      onProgress: (p) => {
        if (!this.current(op)) return;
        op.status = p || {};
        if (p?.warning) op.warning = p.warning;
        if (op.status.stage === 'running' && op.runStartedAt == null) op.runStartedAt = performance.now();
      },
    });
    if (this.current(op)) this.dispatch({ type: 'step-done', result, warning: op.warning || null });
  }

  async inputFor(s) {
    if (s.step === 'edit') return { grid: s.snapshot.grid, prompt: s.prompt };
    if (s.step === 'views3d') return { ...await this.deps.splitGrid(s.firstResult), detailLevel: s.detailLevel };
    if (s.step === 'picture') return { prompt: s.prompt };
    if (s.step === 'picture3d') return { picture: s.firstResult, detailLevel: s.detailLevel };
    if (s.step === TEXTURE_STEP) return { mesh: s.shapeResult };
    throw new Error(`inputFor: unknown step "${s.step}"`);
  }

  /** Match the adult's raw values to a named child preset; null means a real custom value. */
  detailLevelFor(route, cfg = loadGenConfig()) {
    const model = modelById(cfg.models?.[SECOND_STEP[route]]);
    if (!model?.controls?.detail) return null;
    const values = resolveModelControls(model, cfg.controls?.[model.id]);
    return model.controls.detail.levels.find((level) =>
      Object.entries(level.values).every(([name, value]) => values[name] === value))?.id || null;
  }

  /** Show only native named presets; models without them use independent settings controls. */
  renderDetail(s) {
    const cfg = loadGenConfig();
    const model = modelById(cfg.models?.[SECOND_STEP[s.route]]);
    const detail = model?.controls?.detail;
    if (!detail) return model?.controls ? el('p', { class: 'gen-small' },
      `${model.name} uses its own model options. Adjust them in Settings; no shared Low/High face-count presets are applied.`) : null;
    const display = detail.displayParameter;
    const raw = resolveModelControls(model, cfg.controls?.[model.id]);
    const number = (value) => Number(value).toLocaleString('en-US');
    const unit = detail.unit;
    return el('fieldset', { class: 'gen-detail-control' },
      el('legend', {}, detail.label),
      el('div', { class: 'gen-detail-levels' }, ...detail.levels.map((level) => el('label', {
        class: s.detailLevel === level.id ? 'selected' : '',
      }, el('input', {
        type: 'radio', name: 'gen-detail', value: level.id, checked: s.detailLevel === level.id,
        onchange: () => this.dispatch({ type: 'set-detail', level: level.id }),
      }), el('span', {}, `${level.label} · ${number(level.values[display])} ${unit}`)))),
      s.detailLevel == null
        ? el('p', { class: 'gen-small' }, `Adult custom setting · ${number(raw[display])} ${unit}`)
        : null);
  }

  // ---- progress bar ----

  startTicker(route, step, op) {
    this.stopTicker(op);
    const started = performance.now();
    const tick = () => {
      if (!this.current(op)) return;
      const bar = this.root.querySelector('.gen-bar');
      const fill = this.root.querySelector('.gen-bar .fill');
      const detail = this.root.querySelector('.gen-detail');
      if (!bar || !fill || !detail) return;
      const now = performance.now();
      const expectedMs = EXPECTED_MS[step];
      const queued = op.status.stage === 'queued';
      const base = op.runStartedAt ?? (queued ? null : started);
      const reported = reportedFraction(op.status.progressData);
      const stepFraction = base == null ? 0 : (reported ?? estimatedFraction(now - base, expectedMs));
      // Never move backwards (a late "queued" status must not shrink the bar).
      op.fraction = Math.max(op.fraction, overallFraction(route, step, stepFraction, false, this.state.textureEnabled));
      fill.style.width = `${(op.fraction * 100).toFixed(1)}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(op.fraction * 100)));
      detail.textContent = detailText({
        queuePosition: op.status.queuePosition,
        progressData: op.status.progressData,
        elapsedMs: now - started,
        expectedMs,
      });
    };
    tick();
    op.ticker = setInterval(tick, 250);
  }

  stopTicker(op) {
    if (op?.ticker != null) clearInterval(op.ticker);
    if (op) op.ticker = null;
  }

  // ---- 3D turntable preview ----

  async startPreview(canvas, glb) {
    this.stopPreview();
    const token = {};
    this.preview = token;
    const gltf = await importGLBFile(new File([glb], 'preview.glb', { type: 'model/gltf-binary' }));
    if (this.preview !== token) { disposeModel(gltf.scene); return; }
    const meshes = []; gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    try { token.model = bakeAndPlace(meshes, null); }
    // Spare the material the preview just adopted, or the turntable shows an untextured shell.
    finally { disposeModel(gltf.scene, token.model?.material); }
    token.model.position.y -= 0.85;
    try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    token.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.width, canvas.height, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1e33);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    scene.add(token.model);
    const camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.05, 50);
    camera.position.set(0, 0.6, 4.2);
    camera.lookAt(0, 0, 0);
    token.renderer = renderer;
    const spin = () => {
      if (this.preview !== token) return;
      token.model.rotation.y += 0.01;
      renderer.render(scene, camera);
      token.raf = requestAnimationFrame(spin);
    };
    token.raf = requestAnimationFrame(spin);
    } catch (err) {
      if (this.preview === token) this.stopPreview();
      throw err;
    }
  }

  stopPreview() {
    const t = this.preview;
    this.preview = null;
    if (t && t.raf) cancelAnimationFrame(t.raf);
    if (t && t.renderer) {
      t.renderer.dispose();
      t.renderer.forceContextLoss();
    }
    if (t?.model) disposeModel(t.model);
  }

  // ---- rendering ----

  url(blob) {
    const u = URL.createObjectURL(blob);
    this.urls.push(u);
    return u;
  }

  revokeUrls() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  render() {
    this.stopPreview();
    this.revokeUrls();
    const s = this.state;
    if (!s) return;
    const views = {
      settings: () => this.renderSettings(s),
      check: () => this.renderCheck(s),
      words: () => this.renderWords(s),
      running: () => this.renderRunning(s),
      result: () => this.renderResult(s),
      adding: () => [el('h2', { id: 'gen-title' }, 'Adding your model…'),
        el('button', { disabled: true }, 'Adding…'), el('button', { onclick: () => this.close() }, 'Cancel')],
      error: () => this.renderError(s),
    };
    this.root.replaceChildren(...views[s.view]().filter(Boolean));
    const focus = this.root.querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }

  /** The words box and the prompt box, shared by both routes. Keystrokes do not re-render. */
  wordsAndPrompt(s) {
    const build = (words) => {
      if (!String(words).trim()) return '';
      return this.state.route === 'A'
        ? buildEditPrompt(words, colourList((this.state.snapshot && this.state.snapshot.colours) || []))
        : buildWordsPrompt(words);
    };
    const promptBox = el('div', {});
    const drawPrompt = () => {
      const st = this.state;
      promptBox.replaceChildren();
      if (this.editingPrompt) {
        promptBox.append(el('textarea', {
          class: 'gen-prompt-edit',
          value: st.prompt,
          'aria-label': 'The prompt that will be sent',
          oninput: (e) => this.dispatch({ type: 'prompt-edited', prompt: e.target.value }, { render: false }),
        }));
        return;
      }
      const parts = splitAroundWords(st.prompt, st.words);
      const content = !st.prompt
        ? ['Type what it is, and the prompt appears here.']
        : parts
          ? [parts.before, el('mark', {}, parts.words), parts.after]
          : [st.prompt];
      promptBox.append(el('p', { class: 'gen-prompt' }, ...content));
    };
    drawPrompt();
    const words = el('input', {
      type: 'text',
      maxLength: 120,
      value: s.words,
      'data-autofocus': true,
      'aria-label': s.route === 'A' ? 'What is it?' : 'What should the AI make?',
      placeholder: s.route === 'A' ? 'a dinosaur with spikes on its back' : 'a blue dragon with big wings',
      oninput: (e) => {
        this.dispatch({ type: 'words', words: e.target.value, prompt: build(e.target.value) }, { render: false });
        drawPrompt();
      },
    });
    const editBtn = el('button', {
      onclick: () => {
        this.editingPrompt = !this.editingPrompt;
        editBtn.textContent = this.editingPrompt ? 'Done editing' : 'Edit the prompt';
        drawPrompt();
      },
    }, this.editingPrompt ? 'Done editing' : 'Edit the prompt');
    const resetBtn = el('button', {
      onclick: () => {
        this.editingPrompt = false;
        editBtn.textContent = 'Edit the prompt';
        this.dispatch({ type: 'prompt-reset', prompt: build(this.state.words) }, { render: false });
        drawPrompt();
      },
    }, 'Reset');
    return [
      el('label', { class: 'gen-field' }, el('span', {}, s.route === 'A' ? 'What is it?' : 'What should the AI make?'), words),
      s.error === 'words-required' ? el('p', { class: 'gen-error' }, 'Type what it is first.') : null,
      el('div', { class: 'gen-field' },
        el('span', {}, 'The prompt that will be sent'),
        promptBox,
        el('div', { class: 'gen-prompt-actions' }, editBtn, resetBtn)),
    ];
  }

  /**
   * The Turn / Tilt sliders, "use my view" and the scope line.
   *
   * Sliders commit on `change` (mouse up / key release), not `input`: a dispatch re-renders the
   * whole view, so committing on every pixel of a drag would tear the slider out from under the
   * finger holding it AND fire a capture per pixel. The readout follows the drag live so it still
   * feels connected.
   */
  renderFraming(s) {
    const snap = s.snapshot;
    const slider = (label, key, min, max, suffix) => {
      const readout = el('output', { class: 'gen-angle-value' }, `${Math.round(s[key])}${suffix}`);
      const input = el('input', {
        type: 'range', min, max, step: 1, value: Math.round(s[key]), class: 'gen-angle-slider',
        'aria-label': label,
        oninput: (e) => { readout.textContent = `${Math.round(Number(e.target.value))}${suffix}`; },
        onchange: (e) => this.dispatch({
          type: 'set-angles',
          turn: key === 'turn' ? Number(e.target.value) : s.turn,
          tilt: key === 'tilt' ? Number(e.target.value) : s.tilt,
        }),
      });
      return el('label', { class: 'gen-angle' }, el('span', {}, label), input, readout);
    };
    const square = s.turn === 0 && s.tilt === 0;
    return el('div', { class: 'gen-framing' },
      snap ? el('p', { class: 'gen-small gen-scope' }, scopeLabel(snap.scope)) : null,
      el('div', { class: 'gen-angle-actions' },
        el('button', {
          onclick: () => {
            const angles = anglesFromDirection(this.deps.cameraDirection());
            this.dispatch({ type: 'set-angles', turn: angles.turn, tilt: angles.tilt });
          },
        }, 'Use my view as the front'),
        el('button', { disabled: square, onclick: () => this.dispatch({ type: 'reset-angles' }) }, 'Reset angle')),
      slider('Turn', 'turn', 0, 359, '°'),
      slider('Tilt', 'tilt', -MAX_TILT, MAX_TILT, '°'),
      el('label', { class: 'gen-scope-toggle' },
        el('input', {
          type: 'checkbox', checked: !!s.wholeBuild,
          onchange: (e) => this.dispatch({ type: 'set-scope', wholeBuild: e.target.checked }),
        }),
        el('span', {}, 'Send my whole build, not just what I picked')));
  }

  renderCheck(s) {
    const snap = s.snapshot;
    const views = snap
      ? el('div', { class: 'gen-views' }, ...['front', 'left', 'back', 'right'].map((v) => el('figure', {},
        el('img', { src: this.url(snap.views[v]), alt: `${VIEW_LABELS[v]} of your build` }),
        el('figcaption', {}, VIEW_LABELS[v]))))
      : el('p', { class: 'gen-small' }, 'Taking pictures of your build…');
    return [
      el('h2', { id: 'gen-title' }, 'Make it real'),
      el('p', { class: 'gen-small' }, 'These four pictures will be sent. Turn them so the AI sees the front of your model, then press Send.'),
      views,
      this.renderFraming(s),
      this.renderDetail(s),
      ...this.wordsAndPrompt(s),
      el('div', { class: 'gen-actions' },
        el('button', { onclick: () => this.dispatch({ type: 'open-settings' }) }, 'Settings'),
        el('button', { onclick: () => this.close() }, 'Cancel'),
        el('button', { onclick: () => this.dispatch({ type: 'retake' }) }, 'Retake'),
        el('button', { class: 'primary', disabled: !snap, onclick: () => this.dispatch({ type: 'send' }) }, 'Send')),
    ];
  }

  renderWords(s) {
    return [
      el('h2', { id: 'gen-title' }, 'Make from words'),
      this.renderDetail(s),
      ...this.wordsAndPrompt(s),
      el('div', { class: 'gen-actions' },
        el('button', { onclick: () => this.dispatch({ type: 'open-settings' }) }, 'Settings'),
        el('button', { onclick: () => this.close() }, 'Cancel'),
        el('button', { class: 'primary', onclick: () => this.dispatch({ type: 'send' }) }, 'Send')),
    ];
  }

  renderRunning(s) {
    const weights = routeWeights(s.route, s.textureEnabled);
    const part = s.step === FIRST_STEP[s.route] ? 1 : s.step === SECOND_STEP[s.route] ? 2 : 3;
    const total = s.textureEnabled ? 3 : 2;
    return [
      el('h2', { id: 'gen-title' }, STEP_WORDS[s.step]),
      el('p', { class: 'gen-small' }, `Part ${part} of ${total}`),
      el('div', {
        class: 'gen-bar', role: 'progressbar', 'aria-label': STEP_WORDS[s.step],
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      },
      ...Object.keys(weights).map((step) => el('div', { class: 'seg', style: `flex:${weights[step]}` })),
      el('div', { class: 'fill' })),
      el('p', { class: 'gen-detail', 'aria-live': 'polite' }, ''),
      el('div', { class: 'gen-actions' },
        el('button', { onclick: () => this.cancelActive() }, 'Cancel')),
    ];
  }

  renderResult(s) {
    const first = s.step === FIRST_STEP[s.route];
    const out = [el('h2', { id: 'gen-title' }, first ? (s.route === 'A' ? 'Here is the redesign' : 'Here is the picture') : 'Here is your 3D model')];
    if (s.sample) out.push(el('p', {}, el('span', { class: 'gen-tag' }, 'Sample'), ' This is a ready-made example, not made from your build.'));
    if (first) {
      out.push(el('div', { class: 'gen-result' }, el('img', { src: this.url(s.result), alt: 'What the AI drew' })));
      out.push(el('div', { class: 'gen-actions' },
        el('button', { onclick: () => this.dispatch({ type: 'back' }) }, 'Back'),
        el('button', { onclick: () => this.dispatch({ type: 'try-again' }) }, 'Try again'),
        el('button', { class: 'primary', onclick: () => this.dispatch({ type: 'use-this' }) }, 'Use this')));
      return out;
    }
    const canvas = el('canvas', { class: 'gen-preview', width: 480, height: 360, 'aria-label': 'Your 3D model, turning' });
    if (s.warning) out.push(el('p', { class: 'gen-small', role: 'status' }, s.warning));
    const willReplace = s.route === 'A' && replacementShapes(this.deps.studio(), s.snapshot?.scope?.list).length > 0;
    out.push(el('div', { class: 'gen-result-row' }, canvas,
      s.firstResult ? el('img', { class: 'gen-thumb', src: this.url(s.firstResult), alt: 'The picture it was made from' }) : null));
    out.push(el('div', { class: 'gen-actions' },
      el('button', { onclick: () => this.dispatch({ type: 'back' }) }, s.sample ? 'Back to my build' : 'Back'),
      s.sample ? null : el('button', { onclick: () => this.dispatch({ type: 'try-again' }) }, 'Try again'),
      el('button', { class: 'primary', onclick: () => this.dispatch({ type: 'use-this' }) },
        willReplace ? 'Replace my blocks' : s.sample ? 'Add the sample' : 'Add to my studio')));
    this.startPreview(canvas, s.result).catch(() => {
      canvas.replaceWith(el('p', { class: 'gen-small' }, 'The preview could not be shown, but the model is ready.'));
    });
    return out;
  }

  renderError(s) {
    const e = s.error || { code: 'failed', message: ERROR_TEXT.failed };
    const needsAdult = e.code === 'no-key' || e.code === 'bad-key';
    return [
      el('h2', { id: 'gen-title' }, 'That did not work'),
      el('p', { class: 'gen-error' }, e.message),
      e.detail ? el('p', { class: 'gen-small' }, e.detail) : null,
      el('div', { class: 'gen-actions' },
        needsAdult ? el('button', { onclick: () => this.dispatch({ type: 'open-settings' }) }, 'Settings') : null,
        el('button', { onclick: () => this.dispatch({ type: 'back' }) }, 'Back to my build'),
        el('button', { onclick: () => this.dispatch({ type: 'show-sample' }) }, 'Show the sample'),
        s.step ? el('button', { class: 'primary', onclick: () => this.dispatch({ type: 'try-again' }) }, 'Try again') : null),
    ];
  }

  renderSettings(s) {
    const cfg = loadGenConfig();
    const selects = {};
    const describe = (model) => {
      const status = model.available ? '' : ' · Not connected';
      const provider = model.provider ? (PROVIDER_CATALOGUE[model.provider]?.name || model.provider) : 'None';
      return `Provider: ${provider} · Multiview: ${capabilityLabel(model.capabilities.multiview)} · Texture: ${capabilityLabel(model.capabilities.texture)} · Licence: ${model.licence}${status}. ${model.note}`;
    };
    const rows = GEN_STEPS.map((step) => {
      const choices = modelsForStep(step);
      const sel = el('select', { 'aria-label': `Model for: ${STEP_NAMES[step]}` },
        ...choices.map((model) => el('option', {
          value: model.id, selected: cfg.models[step] === model.id, disabled: !model.available,
        }, `${model.name}${model.available ? '' : ' (not connected)'}`)));
      selects[step] = sel;
      const chosen = () => modelById(sel.value) || choices[0];
      const description = el('span', { class: 'gen-model-meta' }, describe(chosen()));
      sel.addEventListener('change', () => { description.textContent = describe(chosen()); });
      return el('label', { class: 'gen-field gen-model-row' },
        el('span', {}, STEP_NAMES[step]), sel, description);
    });
    const controlInputs = {};
    const controlCards = MODEL_CATALOGUE.filter((model) => model.available && model.controls).map((model) => {
      controlInputs[model.id] = {};
      const fields = Object.entries(model.controls.parameters).map(([name, parameter]) => {
        let input;
        if (parameter.options) {
          input = el('select', { 'aria-label': `${model.name} ${parameter.label}` },
            ...parameter.options.map((value) => el('option', {
              value: String(value), selected: (cfg.controls?.[model.id]?.[name] ?? parameter.default) === value,
            }, typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value))));
        } else {
          input = el('input', {
            type: 'number', min: parameter.min, max: parameter.max, step: parameter.step,
            value: cfg.controls?.[model.id]?.[name] ?? parameter.default,
            'aria-label': `${model.name} ${parameter.label}`,
          });
        }
        controlInputs[model.id][name] = input;
        const preset = parameter.levels ? el('select', {
          'aria-label': `${model.name} ${parameter.label} preset`,
          onchange: (event) => {
            const level = parameter.levels.find((entry) => entry.id === event.target.value);
            if (level) { input.value = level.value; input.dispatchEvent(new Event('change')); }
          },
        }, el('option', { value: '' }, 'Custom'), ...parameter.levels.map((level) => el('option', {
          value: level.id, selected: Number(input.value) === level.value,
        }, `${level.label} (${level.value})`))) : null;
        if (preset) input.addEventListener('change', () => {
          preset.value = parameter.levels.find((level) => level.value === Number(input.value))?.id || '';
        });
        const range = parameter.options
          ? `Allowed: ${parameter.options.join(', ')}`
          : `Range: ${parameter.min.toLocaleString('en-US')}–${parameter.max.toLocaleString('en-US')}`;
        const levels = parameter.levels
          ? ` · ${parameter.levels.map((level) => `${level.label} ${level.value}`).join(' · ')}`
          : '';
        const condition = parameter.when ? ` · Used when ${Object.entries(parameter.when).map(([k, v]) => `${k}=${v}`).join(', ')}` : '';
        const stage = parameter.stage === 'export' ? ' · Export call only' : '';
        return el('label', { class: 'gen-field gen-control-field' }, el('span', {}, parameter.label), preset, input,
          el('small', { class: 'gen-model-meta' }, `${name} · ${range} · Default ${parameter.default}${levels}${condition}${stage}`));
      });
      const refreshConditions = () => {
        for (const [name, parameter] of Object.entries(model.controls.parameters)) {
          controlInputs[model.id][name].disabled = !!parameter.when && !Object.entries(parameter.when)
            .every(([key, value]) => controlInputs[model.id][key]?.value === String(value));
        }
      };
      for (const input of Object.values(controlInputs[model.id])) input.addEventListener('change', refreshConditions);
      refreshConditions();
      const card = el('article', { class: 'gen-connection-card gen-control-card' }, el('h4', {}, model.name), ...fields,
        el('button', { type: 'button', onclick: () => {
          for (const [name, parameter] of Object.entries(model.controls.parameters)) {
            const input = controlInputs[model.id][name];
            input.value = String(parameter.default);
            input.dispatchEvent(new Event('change'));
          }
        } }, 'Use model defaults'));
      const showSelected = () => { card.hidden = !Object.values(selects).some((select) => select.value === model.id); };
      Object.values(selects).forEach((select) => select.addEventListener('change', showSelected));
      showSelected();
      return card;
    });
    const inputs = {};
    const providerIds = Object.keys(PROVIDER_CATALOGUE);
    const connections = providerIds.map((id) => {
      const provider = PROVIDER_CATALOGUE[id];
      inputs[id] = {};
      const fields = provider.fields.map((field) => {
        const input = el('input', {
          type: field.type, autocomplete: 'off', spellcheck: false,
          value: cfg.connections?.[id]?.[field.id] || '', placeholder: field.placeholder,
          'aria-label': `${provider.name} ${field.label}`,
        });
        inputs[id][field.id] = input;
        const qualifier = field.required ? '' : provider.requiredAny?.includes(field.id) ? ' (one required)' : ' (optional)';
        return el('label', { class: 'gen-field gen-connection-field' },
          el('span', {}, `${field.label}${qualifier}`), input);
      });
      return el('article', { class: 'gen-connection-card' }, el('h4', {}, provider.name),
        provider.note ? el('p', { class: 'gen-small' }, provider.note) : null, ...fields);
    });
    const checks = el('ul', { class: 'gen-checks', 'aria-live': 'polite' });
    const persist = () => {
      const models = {};
      for (const step of GEN_STEPS) models[step] = selects[step].value;
      const connectionsOut = {};
      for (const id of providerIds) {
        connectionsOut[id] = {};
        for (const field of PROVIDER_CATALOGUE[id].fields) {
          connectionsOut[id][field.id] = inputs[id][field.id].value;
        }
      }
      const controlsOut = {};
      for (const [modelId, fields] of Object.entries(controlInputs)) {
        controlsOut[modelId] = {};
        for (const [name, input] of Object.entries(fields)) {
          const parameter = modelById(modelId).controls.parameters[name];
          controlsOut[modelId][name] = parameter.options
            ? parameter.options.find((value) => String(value) === input.value)
            : Number(input.value);
        }
      }
      return saveGenConfig({ models, connections: connectionsOut, controls: controlsOut });
    };
    const test = async (e) => {
      const op = this.beginOperation('check-services');
      const button = e.currentTarget;
      try {
        const saved = persist();
        button.disabled = true;
        checks.replaceChildren(el('li', {}, 'Checking…'));
        const rowsOut = await this.deps.service.checkAll({ signal: op.ctrl.signal });
        if (!this.current(op)) return;
        // Treat even injected services' returned detail as untrusted; redact against saved keys.
        const keys = credentialValues(saved);
        checks.replaceChildren(...rowsOut.map((r) => el('li', { class: r.ok ? 'ok' : 'bad' },
          `${STEP_NAMES[r.step]}: ${r.ok ? 'ready' : 'not ready'}${r.detail ? ` (${redact(r.detail, keys)})` : ''}`)));
      } catch (err) {
        if (this.current(op)) checks.replaceChildren(el('li', { class: 'bad' }, toGenError(err).message));
      } finally {
        if (this.current(op)) { button.disabled = false; this.operation = null; }
      }
    };
    const saveAndClose = () => {
      try {
        const next = persist();
        this.dispatch({ type: 'settings-saved', ready: isRouteReady(next, this.state.route),
          textureEnabled: next.models.texture !== 'none', detailLevel: this.detailLevelFor(this.state.route, next) });
      } catch (err) { this.dispatch({ type: 'failed', error: toGenError(err) }); }
    };
    return [
      // The form is much taller than a tablet. Keep both exits in view so entering a key never
      // leaves the adult hunting below several provider cards for the only Close/Save controls.
      el('div', { class: 'gen-settings-header' },
        el('h2', { id: 'gen-title' }, 'Settings (for adults)'),
        el('div', { class: 'gen-settings-header-actions' },
          el('button', { onclick: () => this.close(), 'aria-label': 'Close settings' }, 'Close'),
          el('button', { class: 'primary', onclick: saveAndClose }, 'Save & close'))),
      s.notice === 'no-key' ? el('p', { class: 'gen-error' }, ERROR_TEXT['no-key']) : null,
      el('h3', { class: 'gen-settings-heading' }, 'Models for each step'),
      el('p', { class: 'gen-small' }, 'Choose a model for each step. Capabilities and licence limits are shown because models are not interchangeable.'),
      ...rows,
      el('section', { class: 'gen-connection-section gen-control-section', 'aria-labelledby': 'gen-control-title' },
        el('h3', { id: 'gen-control-title' }, 'Model controls'),
        el('p', { class: 'gen-small' }, 'Options for the selected models, using each provider’s supported ranges, choices and defaults. Hunyuan shape-detail presets change voxel resolution, not face count. Mesh simplification is optional.'),
        el('div', { class: 'gen-connection-grid' }, ...controlCards)),
      el('section', { class: 'gen-connection-section', 'aria-labelledby': 'gen-connection-title' },
        el('h3', { id: 'gen-connection-title' }, 'Connections'),
        el('p', { class: 'gen-small' }, "Add each provider once; every selected model from that provider reuses this connection. Settings are stored in localStorage on this device and sent only to that provider. A server URL must speak that provider's protocol."),
        el('div', { class: 'gen-connection-grid' }, ...connections),
        el('p', { class: 'gen-small' }, 'Use restricted test keys in this browser-only demo. Put keys behind a server proxy before production.')),
      checks,
      el('div', { class: 'gen-actions' },
        el('button', { onclick: () => this.close() }, 'Close'),
        el('button', { onclick: test }, 'Test the AI services'),
        el('button', { class: 'primary', onclick: saveAndClose }, 'Save')),
    ];
  }
}
