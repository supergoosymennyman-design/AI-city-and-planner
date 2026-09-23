/**
 * gen-prompt.js — the words sent to the image models (design doc §5). Pure: no DOM, no network.
 *
 * Refine the build's finish without replacing its identity or structure. Calling every subject a
 * cartoon character and discarding primitive shapes biased objects toward invented anatomy.
 */

export const EDIT_TEMPLATE =
  'Refine the model shown in all four panels into a polished, professionally designed stylized 3D ' +
  'asset. The child says it is: {words}. Use the screenshots as the structural reference: preserve ' +
  'the overall silhouette, proportions, pose, orientation, and the number, placement and connections ' +
  'of its major parts. Preserve distinctive features and the colour scheme ({colours}). Use the ' +
  "child's description to interpret the build, not to replace it with a generic example. Improve " +
  'surface quality, materials, edges and small details while keeping that structure recognizable. ' +
  'Retain geometric or mechanical forms where appropriate; use organic forms only where the subject ' +
  'calls for them. Do not invent extra parts or add a face, arms, legs, human anatomy or an upright ' +
  'human pose unless shown in the screenshots or explicitly requested. Keep the 2x2 turnaround layout: ' +
  'front view top-left, side view facing left top-right, back view bottom-left, side view facing ' +
  'right bottom-right, the same subject with consistent parts, proportions and colours in every panel ' +
  'at the same size. Plain flat light grey ' +
  'background, no floor, no shadow, no text, no logos.';

export const WORDS_TEMPLATE =
  'Create a polished, professionally designed stylized 3D asset of: {words}. Follow the described ' +
  'subject, proportions and parts. Use geometric, mechanical or organic forms as appropriate to ' +
  'that subject. Do not turn objects or animals into humanoid characters or add human anatomy, ' +
  'a face or an upright human pose unless explicitly requested. Show the entire subject in a front ' +
  'three-quarter view, plain light grey background, soft studio lighting, no text, no logos.';

/** Named colours: the studio's 10 palette colours (scene.js PALETTE) first, then common extras. */
export const COLOUR_NAMES = [
  [0xff6b6b, 'red'], [0xff922b, 'orange'], [0xfcc419, 'yellow'], [0x51cf66, 'green'],
  [0x22b8cf, 'teal'], [0x4dabf7, 'blue'], [0x9775fa, 'purple'], [0xf06595, 'pink'],
  [0xf8f9fa, 'white'], [0x495057, 'dark grey'],
  [0x000000, 'black'], [0x8d5524, 'brown'], [0x9e9e9e, 'grey'],
];

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** Straight-line distance between two colours in RGB (0..441). */
export function colourDistance(a, b) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** The nearest plain colour name for a hex colour. */
export function colourName(hex) {
  let best = COLOUR_NAMES[0];
  let bestDistance = Infinity;
  for (const entry of COLOUR_NAMES) {
    const d = colourDistance(hex, entry[0]);
    if (d < bestDistance) {
      bestDistance = d;
      best = entry;
    }
  }
  return best[1];
}

/**
 * Name a build's colours for the prompt: biggest total area first, each name once, at most `max`.
 * @param {{hex:number, area:number}[]} entries
 * @param {number} [max]
 * @returns {string[]}
 */
export function colourList(entries, max = 5) {
  const byName = new Map();
  for (const { hex, area } of entries || []) {
    if (!Number.isFinite(hex) || !(area > 0)) continue;
    const name = colourName(hex);
    byName.set(name, (byName.get(name) || 0) + area);
  }
  return [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([name]) => name);
}

/** Collapse whitespace; the child's words are free text. */
const tidy = (words) => String(words ?? '').replace(/\s+/g, ' ').trim();

/**
 * Route A prompt. Function replacers keep "$&" and friends in the child's words literal.
 * @param {string} words the child's own words (required)
 * @param {string[]} colours from colourList()
 */
export function buildEditPrompt(words, colours) {
  const w = tidy(words);
  if (!w) throw new Error("buildEditPrompt: the child's words are required");
  const c = colours && colours.length ? colours.join(', ') : 'its own colours';
  return EDIT_TEMPLATE.replace('{words}', () => w).replace('{colours}', () => c);
}

/** Route B prompt. @param {string} words the child's own words (required) */
export function buildWordsPrompt(words) {
  const w = tidy(words);
  if (!w) throw new Error("buildWordsPrompt: the child's words are required");
  return WORDS_TEMPLATE.replace('{words}', () => w);
}

/**
 * Split a prompt around the child's words so the check step can mark them. Null when not found
 * (e.g. an adult edited them out).
 */
export function splitAroundWords(prompt, words) {
  const w = tidy(words);
  const text = String(prompt ?? '');
  const i = w ? text.indexOf(w) : -1;
  return i < 0 ? null : { before: text.slice(0, i), words: w, after: text.slice(i + w.length) };
}
