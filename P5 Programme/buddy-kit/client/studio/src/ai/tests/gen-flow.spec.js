/** gen-flow.spec.js — the Make-it-real flow state machine (src/ai/gen-flow.js), pure Node. */
import { FIRST_STEP, SECOND_STEP, TEXTURE_STEP, initialState, reduce } from '../gen-flow.js';
import { MAX_TILT } from '../gen-angles.js';

export default function genFlowTests(check) {
  const a = initialState('A', true);
  check('gen-flow: route A opens on the check step and takes pictures', a.view === 'check' && a.effect === 'capture');
  const b = initialState('B', true);
  check('gen-flow: route B opens on the words step', b.view === 'words' && b.effect === null);
  check('gen-flow: the model-driven Detail choice starts Standard', b.detailLevel === 'standard');
  const detailed = reduce(b, { type: 'set-detail', level: 'high' });
  check('gen-flow: the child can choose one named Detail level without starting work',
    detailed.detailLevel === 'high' && detailed.effect === null && detailed.view === 'words');
  const nk = initialState('A', false);
  check('gen-flow: without a key it opens on Settings and sends nothing', nk.view === 'settings' && nk.effect === null && nk.notice === 'no-key');
  let threw = false;
  try {
    initialState('C', true);
  } catch (err) {
    threw = /unknown route/.test(err.message);
  }
  check('gen-flow: unknown route throws', threw);

  let s = reduce(a, { type: 'captured', snapshot: { grid: 'g' } });
  check('gen-flow: captured shows the check step', s.view === 'check' && s.snapshot.grid === 'g' && s.effect === null);
  const noWords = reduce(s, { type: 'send' });
  check('gen-flow: sending without words asks for them', noWords.view === 'check' && noWords.error === 'words-required' && noWords.effect === null);
  s = reduce(s, { type: 'words', words: 'a dino', prompt: 'P(a dino)' });
  check('gen-flow: words rebuild the prompt', s.prompt === 'P(a dino)');
  s = reduce(s, { type: 'prompt-edited', prompt: 'my own prompt' });
  s = reduce(s, { type: 'words', words: 'a big dino', prompt: 'P(a big dino)' });
  check('gen-flow: an edited prompt is not overwritten by new words', s.prompt === 'my own prompt' && s.words === 'a big dino');
  s = reduce(s, { type: 'prompt-reset', prompt: 'P(a big dino)' });
  check('gen-flow: Reset restores the template prompt', s.prompt === 'P(a big dino)' && !s.promptEdited);
  s = reduce(s, { type: 'send' });
  check('gen-flow: Send runs the first step', s.view === 'running' && s.step === FIRST_STEP.A && s.effect === 'run');
  s = reduce(s, { type: 'step-done', result: 'edited' });
  check('gen-flow: the first result is shown', s.view === 'result' && s.result === 'edited' && s.effect === null);
  const again = reduce(s, { type: 'try-again' });
  check('gen-flow: Try again reruns the same step', again.view === 'running' && again.step === 'edit' && again.effect === 'run');
  s = reduce(s, { type: 'use-this' });
  check('gen-flow: Use this runs the second step with the first result',
    s.view === 'running' && s.step === SECOND_STEP.A && s.firstResult === 'edited' && s.effect === 'run');
  s = reduce(s, { type: 'step-done', result: 'glb' });
  const back = reduce(s, { type: 'back' });
  check('gen-flow: Back from the 3D goes back to the redesign', back.view === 'result' && back.step === 'edit' && back.result === 'edited');
  const add = reduce(s, { type: 'use-this' });
  check('gen-flow: Use this locks the panel while preparing an addition', add.effect === 'add' && add.view === 'adding');
  check('gen-flow: a second Use this cannot schedule another addition', reduce(add, { type: 'use-this' }).effect === null);
  check('gen-flow: added closes the panel', reduce(add, { type: 'added' }).effect === 'close');

  let textured = initialState('B', true, true);
  textured = reduce(textured, { type: 'words', words: 'cat', prompt: 'cat' });
  textured = reduce(textured, { type: 'send' });
  textured = reduce(textured, { type: 'step-done', result: 'picture' });
  textured = reduce(textured, { type: 'use-this' });
  textured = reduce(textured, { type: 'step-done', result: 'plain-glb' });
  check('gen-flow: an enabled texture model runs automatically after shape generation',
    textured.view === 'running' && textured.step === TEXTURE_STEP && textured.shapeResult === 'plain-glb' && textured.effect === 'run');
  textured = reduce(textured, { type: 'step-done', result: 'painted-glb' });
  check('gen-flow: texture result becomes the one editable model result',
    textured.view === 'result' && textured.step === 'texture' && textured.result === 'painted-glb');
  check('gen-flow: retrying texture keeps the untextured mesh seam',
    reduce(textured, { type: 'try-again' }).shapeResult === 'plain-glb');

  const failed = reduce({ ...s, view: 'running' }, { type: 'failed', error: { code: 'busy' } });
  check('gen-flow: a failure shows the error view', failed.view === 'error' && failed.error.code === 'busy');
  check('gen-flow: Try again after a failure reruns that step', reduce(failed, { type: 'try-again' }).effect === 'run');
  const home = reduce(failed, { type: 'back' });
  check('gen-flow: Back to my build returns to the check step', home.view === 'check' && home.step === null && home.result === null);
  const cancelled = reduce({ ...s, view: 'running' }, { type: 'cancelled' });
  check('gen-flow: Cancel returns to the check step', cancelled.view === 'check' && cancelled.step === null);

  const smp = reduce(reduce(failed, { type: 'show-sample' }), { type: 'sample-loaded', picture: 'sgrid', model: 'sglb' });
  check('gen-flow: the sample is shown as a labelled 3D result',
    smp.view === 'result' && smp.sample === true && smp.result === 'sglb' && smp.firstResult === 'sgrid');
  check('gen-flow: Back from the sample goes to my build, not the redesign', reduce(smp, { type: 'back' }).view === 'check');
  const addSample = reduce(smp, { type: 'use-this' });
  check('gen-flow: adding the sample keeps the sample flag', addSample.effect === 'add' && addSample.sample === true);
  check('gen-flow: going back clears the sample flag', reduce(smp, { type: 'back' }).sample === false);

  const saved = reduce(nk, { type: 'settings-saved', ready: true });
  check('gen-flow: saving a key moves on to the check step', saved.view === 'check' && saved.effect === 'capture');
  check('gen-flow: saving without a key stays on Settings', reduce(nk, { type: 'settings-saved', ready: false }).view === 'settings');
  let threw2 = false;
  try {
    reduce(a, { type: 'nope' });
  } catch (err) {
    threw2 = /unknown event/.test(err.message);
  }
  check('gen-flow: unknown events throw', threw2);
  check('gen-flow: reduce never mutates the state', a.view === 'check' && a.effect === 'capture');

  // --- snapshot framing: angles and what goes in the picture ---
  const shot = { ...a, snapshot: { views: {} }, effect: null };
  check('gen-flow: route A starts square on, eye level, and on the selection',
    a.turn === 0 && a.tilt === 0 && a.wholeBuild === false);

  const turned = reduce(shot, { type: 'set-angles', turn: 120, tilt: 15 });
  check('gen-flow: setting an angle re-captures', turned.effect === 'capture' && turned.turn === 120 && turned.tilt === 15);
  check('gen-flow: setting an angle drops the pictures that no longer match it', turned.snapshot === null);
  check('gen-flow: angles are normalised on the way in, not trusted',
    reduce(shot, { type: 'set-angles', turn: 400, tilt: 90 }).turn === 40 &&
    reduce(shot, { type: 'set-angles', turn: -10, tilt: 90 }).tilt === MAX_TILT);
  check('gen-flow: a rubbish angle cannot reach the camera',
    reduce(shot, { type: 'set-angles', turn: NaN, tilt: undefined }).turn === 0);

  const reset = reduce(turned, { type: 'reset-angles' });
  check('gen-flow: reset puts the cameras back square on and re-captures',
    reset.turn === 0 && reset.tilt === 0 && reset.effect === 'capture' && reset.snapshot === null);

  const whole = reduce(shot, { type: 'set-scope', wholeBuild: true });
  check('gen-flow: switching to the whole build re-captures', whole.wholeBuild === true && whole.effect === 'capture' && whole.snapshot === null);
  check('gen-flow: switching back to the selection re-captures',
    reduce(whole, { type: 'set-scope', wholeBuild: false }).wholeBuild === false);

  // Route B never takes a snapshot, so these must be inert there rather than queue a capture that
  // has nothing to photograph.
  const bReady = initialState('B', true);
  check('gen-flow: route B ignores the framing events',
    reduce(bReady, { type: 'set-angles', turn: 90, tilt: 0 }).effect === null &&
    reduce(bReady, { type: 'set-scope', wholeBuild: true }).effect === null &&
    reduce(bReady, { type: 'reset-angles' }).effect === null);

  // The framing is the child's choice; a trip through Settings or Back is not a reason to lose it.
  const framed = reduce(shot, { type: 'set-angles', turn: 210, tilt: -12 });
  const afterSettings = reduce(reduce(framed, { type: 'open-settings' }), { type: 'settings-saved', ready: true });
  check('gen-flow: saving settings keeps the angle the child had set',
    afterSettings.turn === 210 && afterSettings.tilt === -12);
  const afterScope = reduce(reduce(whole, { type: 'open-settings' }), { type: 'settings-saved', ready: true });
  check('gen-flow: saving settings keeps the whole-build choice', afterScope.wholeBuild === true);
  const afterBack = reduce({ ...framed, view: 'result', step: 'edit', effect: null, snapshot: null }, { type: 'back' });
  check('gen-flow: going back keeps the angle the child had set', afterBack.turn === 210 && afterBack.tilt === -12);

  // While a model is being added nothing may queue another capture underneath it.
  const adding = { ...shot, view: 'adding' };
  check('gen-flow: framing events are ignored while a model is being added',
    reduce(adding, { type: 'set-angles', turn: 90, tilt: 0 }).effect === null &&
    reduce(adding, { type: 'set-scope', wholeBuild: true }).effect === null);
}
