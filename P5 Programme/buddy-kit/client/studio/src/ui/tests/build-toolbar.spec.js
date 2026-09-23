/**
 * build-toolbar.spec.js — Build mode's toolbar, the half of toolbar.js nothing reached.
 *
 * pose.spec.js already drives renderPose() (Rest, and the F2 hint states). renderBuild() had no
 * check at all, and it is where the studio's entry points live — including the two AI buttons a
 * stale template in task 11 would have deleted outright. A control that silently stops being
 * rendered, or stops being wired to its callback, is this repo's recorded defect class: it looks
 * operational and cannot act, and no green suite notices.
 *
 * The fake document is the same trick pose.spec.js uses; it works here because Toolbar and
 * Dropdown need nothing but `document`.
 */
import { StudioScene } from '../../scene.js';
import { Toolbar } from '../toolbar.js';
import { withFakeDom } from './fake-dom.js';

/** A transform-controls stand-in: the toolbar reads .mode and calls .setMode. */
function fakeControls(mode = 'translate') {
  return { mode, setMode(m) { this.mode = m; } };
}

export default function (check) {
  // --- every primitive is offered, and choosing one adds exactly that shape, undoably ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    new Toolbar(container, studio, fakeControls(), {});
    const labels = container.buttons().map((b) => b.textContent);
    const shapes = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'octahedron', 'plane'];
    check('build toolbar: every primitive the studio can make is offered',
      shapes.every((s) => labels.some((l) => l.includes(s))), labels);

    for (const shape of shapes) {
      const undos = studio.undoStack.length;
      container.buttons().find((b) => b.textContent.endsWith(` ${shape}`))?.click();
      check(`build toolbar: choosing ${shape} adds that shape and records one undo unit`,
        studio.shapes.length === 1
        && studio.shapes[0].geometry.type === `${shape[0].toUpperCase()}${shape.slice(1)}Geometry`
        && studio.undoStack.length === undos + 1);
      studio.undo();
      check(`build toolbar: Undo removes the added ${shape}`, studio.shapes.length === 0);
    }
  });

  // --- the gizmo dropdown shows the live mode and switches it ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    const tc = fakeControls('translate');
    new Toolbar(container, studio, tc, {});
    const toggle = () => container.walk().find((n) => n.classList.contains('select'))
      ?.childNodes.find((n) => n.classList.contains('dd-toggle'));
    check('build toolbar: the gizmo control shows the mode that is actually active',
      toggle()?.textContent === '✋ Move');
    container.buttons().find((b) => b.textContent === '🔄 Rotate')?.click();
    check('build toolbar: choosing Rotate switches the gizmo and the label follows',
      tc.mode === 'rotate' && toggle()?.textContent === '🔄 Rotate');
  });

  // --- Scale makes proportional scaling an explicit, persistent choice ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    const tc = fakeControls('scale');
    let keepProportions = false;
    const toolbar = new Toolbar(container, studio, tc, {
      proportionalScale: () => keepProportions,
      onProportionalScale: () => {
        keepProportions = !keepProportions;
        toolbar.render();
      },
    });
    const button = () => container.byText('Keep proportions');
    check('build toolbar: Scale exposes a Keep proportions button', !!button());
    button()?.click();
    check('build toolbar: Keep proportions reflects and controls the locked state',
      keepProportions === true
      && button()?.classList.contains('active') === true
      && button()?.ariaPressed === 'true');
  });

  // --- the AI entry points: present only when wired, and wired to their own callback ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    let real = 0;
    let words = 0;
    new Toolbar(container, studio, fakeControls(), {
      onMakeItReal: () => { real++; },
      onMakeFromWords: () => { words++; },
    });
    const realBtn = container.byText('Make it real');
    const wordsBtn = container.byText('Make from words');
    check('build toolbar: both AI entry points are rendered when wired', !!realBtn && !!wordsBtn);
    // Optional-chained on purpose: when a control goes missing this spec must keep REPORTING
    // (the next check names the real consequence) instead of throwing and taking its own
    // remaining checks down with it.
    realBtn?.click();
    check('build toolbar: Make it real calls only its own callback', real === 1 && words === 0);
    wordsBtn?.click();
    check('build toolbar: each AI button calls its OWN callback, not the other',
      real === 1 && words === 1);
  });

  // A toolbar built without those callbacks must not render dead buttons: a control that is
  // present and does nothing is worse than one that is absent.
  withFakeDom((container) => {
    new Toolbar(container, new StudioScene(), fakeControls(), {});
    check('build toolbar: no dead AI buttons when the callbacks are not wired',
      !container.byText('Make it real') && !container.byText('Make from words'));
  });

  // --- Import: rendered only when wired, and hands the chosen file straight to the callback ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    const imported = [];
    new Toolbar(container, studio, fakeControls(), { onImport: (f) => imported.push(f) });
    const input = container.walk().find((n) => n.type === 'file');
    check('build toolbar: Import renders a .glb/.gltf file input alongside its button',
      !!input && input.accept === '.glb,.gltf' && !!container.byText('📥 Import'));
    container.byText('📥 Import')?.click();
    check('build toolbar: Import opens the file picker', input?.clicked === 1);
    const file = { name: 'dino.glb' };
    if (input) {
      input.files = [file];
      input.value = 'C:\\fakepath\\dino.glb';
    }
    input?.dispatch('change');
    check('build toolbar: choosing a file hands that file to onImport and clears the input',
      imported.length === 1 && imported[0] === file && input.value === '');
  });

  withFakeDom((container) => {
    new Toolbar(container, new StudioScene(), fakeControls(), {});
    check('build toolbar: no Import button when nothing can receive the file',
      !container.byText('📥 Import'));
  });

  // --- Wireframe reflects the live flag rather than its own memory ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    let wireframe = false;
    const toolbar = new Toolbar(container, studio, fakeControls(), {
      wireframe: () => wireframe,
      onWireframe: () => { wireframe = !wireframe; toolbar.render(); },
    });
    const btn = () => container.byText('🔲 Wireframe');
    check('build toolbar: Wireframe starts unmarked when the flag is off',
      !!btn() && btn()?.classList.contains('active') === false);
    btn()?.click();
    check('build toolbar: pressing it flips the flag and the button shows as active',
      wireframe === true && btn()?.classList.contains('active') === true);
    btn()?.click();
    check('build toolbar: pressing it again flips back, so the button never lies about the view',
      wireframe === false && btn()?.classList.contains('active') === false);
  });

  // --- Build's controls belong to Build: Rig and Fit own the same container in their modes ---
  withFakeDom((container) => {
    const studio = new StudioScene();
    const toolbar = new Toolbar(container, studio, fakeControls(), { onImport: () => {} });
    check('build toolbar: Build mode fills the container', container.buttons().length > 0);
    for (const mode of ['rig', 'fit']) {
      studio.setMode(mode);
      // Stand in for the owning toolbar, then trigger the shared toolbar again as a selection
      // would. Checking only the button count let a fresh Build toolbar pass as "untouched".
      container.innerHTML = '';
      const owned = document.createElement('button');
      owned.textContent = `${mode} controls`;
      container.appendChild(owned);
      toolbar.render();
      studio.emit('select');
      check(`build toolbar: ${mode} mode leaves its owner's nodes untouched`,
        container.childNodes.length === 1 && container.childNodes[0] === owned);
    }
  });
}
