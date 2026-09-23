/** gen-prompt.spec.js — the words sent to the image models (src/ai/gen-prompt.js), pure Node. */
import {
  EDIT_TEMPLATE, COLOUR_NAMES, colourDistance, colourName, colourList, buildEditPrompt, buildWordsPrompt,
  splitAroundWords,
} from '../gen-prompt.js';

export default function genPromptTests(check) {
  check('gen-prompt: screenshots constrain structure, not just colours', EDIT_TEMPLATE.includes('screenshots as the structural reference') && EDIT_TEMPLATE.includes('silhouette, proportions, pose, orientation') && EDIT_TEMPLATE.includes('number, placement and connections'));
  check('gen-prompt: mechanical geometry is allowed and unrequested anatomy is prohibited', EDIT_TEMPLATE.includes('Retain geometric or mechanical forms') && EDIT_TEMPLATE.includes('unless shown in the screenshots or explicitly requested'));
  check('gen-prompt: does not ask to replace the subject or discard its primitives', !/brand-new|Keep only the idea|do not keep any boxes|3D cartoon character/.test(EDIT_TEMPLATE));
  check('gen-prompt: it keeps the 2x2 layout in the tiling order', EDIT_TEMPLATE.includes(
    'front view top-left, side view facing left top-right, back view bottom-left, side view facing right bottom-right'));
  check('gen-prompt: no floor, shadow, text or logos', EDIT_TEMPLATE.endsWith('no floor, no shadow, no text, no logos.'));

  const p = buildEditPrompt('  a dinosaur   with spikes ', ['green', 'yellow', 'purple']);
  check('gen-prompt: the words go in, whitespace tidied', p.includes('The child says it is: a dinosaur with spikes.'));
  check('gen-prompt: the colours go in', p.includes('colour scheme (green, yellow, purple)'));
  check('gen-prompt: no placeholder left', !/\{words\}|\{colours\}/.test(p));
  check('gen-prompt: no colours → "its own colours"', buildEditPrompt('a car', []).includes('(its own colours)'));
  check('gen-prompt: "$&" in the words is taken literally', buildEditPrompt('a $& robot', ['red']).includes('a $& robot'));
  let threw = false;
  try {
    buildEditPrompt('   ', ['red']);
  } catch (err) {
    threw = /words are required/.test(err.message);
  }
  check('gen-prompt: empty words throw a clear error', threw);
  for (const subject of ['a blue dragon', 'a four-wheeled car', 'a house with two towers', 'a three-legged robot', 'a human astronaut']) {
    const words = buildWordsPrompt(subject);
    check(`gen-prompt: words route preserves subject and gates humanization (${subject})`, words.includes(`asset of: ${subject}.`) && words.includes('unless explicitly requested') && !words.includes('3D cartoon character, full body'));
  }

  check('gen-prompt: palette colours get their own names',
    colourName(0x51cf66) === 'green' && colourName(0x9775fa) === 'purple' && colourName(0xf06595) === 'pink');
  check('gen-prompt: near colours get the nearest name', colourName(0x50d060) === 'green' && colourName(0x010101) === 'black');
  check('gen-prompt: colour distance is symmetric and zero on itself',
    colourDistance(0xff0000, 0x00ff00) === colourDistance(0x00ff00, 0xff0000) && colourDistance(0x123456, 0x123456) === 0);
  const list = colourList([
    { hex: 0x51cf66, area: 10 }, { hex: 0xfcc419, area: 2 }, { hex: 0x50d060, area: 3 },
    { hex: 0x9775fa, area: 4 }, { hex: 0xff0000, area: 0 },
  ]);
  check('gen-prompt: colourList merges same names, biggest first, skips zero area', list.join() === 'green,purple,yellow');
  check('gen-prompt: colourList caps the count', colourList(COLOUR_NAMES.map(([hex], i) => ({ hex, area: i + 1 })), 5).length === 5);

  const s = splitAroundWords(p, 'a dinosaur with spikes');
  check('gen-prompt: split marks the words', !!s && s.words === 'a dinosaur with spikes' && s.before + s.words + s.after === p);
  check('gen-prompt: split returns null when the words are gone', splitAroundWords('edited prompt', 'a dinosaur') === null);
}
