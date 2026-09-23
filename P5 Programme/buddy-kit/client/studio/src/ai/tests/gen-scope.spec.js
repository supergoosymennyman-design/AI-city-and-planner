/** gen-scope.spec.js — which shapes go into the four snapshots (src/ai/gen-scope.js), pure Node. */
import { shapesToPicture, scopeLabel } from '../gen-scope.js';

export default function genScopeTests(check) {
  const horse = { name: 'horse' };
  const cube = { name: 'cube' };
  const cone = { name: 'cone' };
  const bone = { name: 'joint', isBone: true };
  const studio = (selected) => ({ shapes: [horse, cube, cone], selection: new Set(selected) });

  // The defect this module exists for: a horse imported beside leftover blocks was sent as all four.
  const one = shapesToPicture(studio([horse]));
  check('gen-scope: a selected shape is photographed alone, not with the rest of the build',
    one.list.length === 1 && one.list[0] === horse && one.wholeBuild === false);
  check('gen-scope: it still reports how many of the build that was', one.selected === 1 && one.total === 3);

  const two = shapesToPicture(studio([horse, cone]));
  check('gen-scope: several selected shapes all go in, in build order',
    two.list.length === 2 && two.list[0] === horse && two.list[1] === cone);

  // Selecting nothing is the ordinary case for a single model; it must not be an error.
  const none = shapesToPicture(studio([]));
  check('gen-scope: selecting nothing photographs the whole build',
    none.list.length === 3 && none.wholeBuild === true && none.selected === 0);

  const forced = shapesToPicture(studio([horse]), true);
  check('gen-scope: asking for the whole build overrides a selection',
    forced.list.length === 3 && forced.wholeBuild === true && forced.selected === 1);

  // A joint ball is in the selection but is not part of the build. Photographing one would put a
  // marker in the picture the AI would faithfully model.
  const bonesOnly = shapesToPicture({ shapes: [horse, cube, cone], selection: new Set([bone]) });
  check('gen-scope: a selection of only joints falls back to the whole build, never to nothing',
    bonesOnly.list.length === 3 && bonesOnly.selected === 0 && bonesOnly.wholeBuild === true);
  const mixed = shapesToPicture({ shapes: [horse, cube, cone], selection: new Set([horse, bone]) });
  check('gen-scope: joints are dropped from a mixed selection', mixed.list.length === 1 && mixed.list[0] === horse);

  check('gen-scope: an empty studio yields an empty list rather than throwing',
    shapesToPicture({ shapes: [], selection: new Set() }).list.length === 0);
  check('gen-scope: a studio with no selection at all still works',
    shapesToPicture({ shapes: [horse] }).list.length === 1);
  check('gen-scope: rubbish input yields nothing rather than throwing',
    shapesToPicture(null).list.length === 0 && shapesToPicture(undefined).total === 0 &&
    shapesToPicture({ shapes: 'not an array' }).list.length === 0);

  // The label is the only thing on screen that can reveal a wrong scope before the request is paid
  // for, so each case must actually differ — not all collapse to one friendly sentence.
  const labels = [
    scopeLabel(shapesToPicture(studio([horse]))),
    scopeLabel(shapesToPicture(studio([]))),
    scopeLabel(shapesToPicture(studio([horse]), true)),
    scopeLabel(shapesToPicture({ shapes: [], selection: new Set() })),
  ];
  check('gen-scope: every scope gets a different sentence', new Set(labels).size === 4);
  check('gen-scope: picking one shape says one of three', labels[0] === 'Sending the 1 shape you picked, of 3.');
  check('gen-scope: picking several says the plural',
    scopeLabel(shapesToPicture(studio([horse, cone]))) === 'Sending the 2 shapes you picked, of 3.');
  check('gen-scope: the whole build says so with its count', /all 3 shapes/.test(labels[1]));
  check('gen-scope: overriding a selection says the selection is being ignored', /not just the 1 you picked/.test(labels[2]));
  check('gen-scope: an empty build says there is nothing to photograph', /nothing to photograph/.test(labels[3]));
  check('gen-scope: a one-shape build is not called "1 shapes"',
    scopeLabel(shapesToPicture({ shapes: [horse], selection: new Set() })) === 'Sending your whole build — all 1 shape.');
}
