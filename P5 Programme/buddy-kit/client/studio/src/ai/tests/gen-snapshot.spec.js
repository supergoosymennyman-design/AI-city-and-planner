/** gen-snapshot.spec.js — snapshot maths (src/ai/gen-snapshot.js pure part), pure Node. */
import {
  VIEW_ORDER, VIEW_DIRECTIONS, CELL, GRID_SIZE, GRID_CELLS, BACKGROUNDS, MIN_CONTRAST,
  fitOrtho, cameraPose, chooseBackground, colourAreas, hexToCss, FIT_MARGIN,
} from '../gen-snapshot.js';
import { colourDistance } from '../gen-prompt.js';

export default function genSnapshotTests(check) {
  check('gen-snapshot: four views in tiling order', VIEW_ORDER.join() === 'front,left,back,right');
  check('gen-snapshot: front camera on +Z (the studio FRONT)', VIEW_DIRECTIONS.front.join() === '0,0,1');
  check("gen-snapshot: 'left' camera on the model's own left (+X), as Hunyuan3D-2mv expects", VIEW_DIRECTIONS.left.join() === '1,0,0');
  check('gen-snapshot: back on -Z, right on -X', VIEW_DIRECTIONS.back.join() === '0,0,-1' && VIEW_DIRECTIONS.right.join() === '-1,0,0');
  check('gen-snapshot: 512 cells, 1024 grid', CELL === 512 && GRID_SIZE === 1024);
  check('gen-snapshot: grid cells match the prompt (front TL, left TR, back BL, right BR)',
    GRID_CELLS.front.join() === '0,0' && GRID_CELLS.left.join() === '512,0' &&
    GRID_CELLS.back.join() === '0,512' && GRID_CELLS.right.join() === '512,512');

  const f = fitOrtho([-1, 0, -2], [1, 3, 2]);
  check('gen-snapshot: fit centre is the box centre', f.center.join() === '0,1.5,0');
  check('gen-snapshot: one half-size for every view: largest extent / 2, plus the margin',
    Math.abs(f.halfSize - 2 * (1 + FIT_MARGIN)) < 1e-9);
  // The build must not touch the frame: background removal needs background, and Hunyuan3D-2mv's
  // own example sheets all leave clear space. At 0.1 the build filled 91% of the frame.
  const fill = 1 / (1 + FIT_MARGIN);
  check('gen-snapshot: the build fills between 70% and 85% of the frame, never the whole of it',
    fill > 0.7 && fill < 0.85);
  check('gen-snapshot: a bigger margin really does pull the camera frame out',
    fitOrtho([-1, 0, -2], [1, 3, 2], 0.5).halfSize > f.halfSize);
  let threw = false;
  try {
    fitOrtho([1, 1, 1], [1, 1, 1]);
  } catch (err) {
    threw = /empty/.test(err.message);
  }
  check('gen-snapshot: an empty build throws a clear error', threw);

  const pose = cameraPose('left', [0, 1.5, 0], 2);
  check('gen-snapshot: left camera sits 4 half-sizes out on +X', pose.position.join() === '8,1.5,0' && pose.up.join() === '0,1,0');
  let threw2 = false;
  try {
    cameraPose('top', [0, 0, 0], 1);
  } catch (err) {
    threw2 = /unknown view/.test(err.message);
  }
  check('gen-snapshot: unknown view throws', threw2);

  check('gen-snapshot: default background is the tested grey', chooseBackground([]) === 0xa0a4aa && BACKGROUNDS[0] === 0xa0a4aa);
  check('gen-snapshot: a grey build gets the next background', chooseBackground([0x51cf66, 0xa0a4aa]) === BACKGROUNDS[1]);
  check('gen-snapshot: backgrounds are never white or black', BACKGROUNDS.every(
    (b) => colourDistance(b, 0xffffff) > MIN_CONTRAST && colourDistance(b, 0x000000) > MIN_CONTRAST));
  check('gen-snapshot: when every candidate clashes, pick one of them', BACKGROUNDS.includes(chooseBackground([...BACKGROUNDS])));

  const areas = colourAreas([
    { hex: 0x51cf66, size: [1, 1, 1] }, { hex: 0x51cf66, size: [1, 2, 1] }, { hex: 0xfcc419, size: [0.5, 0.5, 0.5] },
  ]);
  check('gen-snapshot: colourAreas sums surface area per colour',
    areas.length === 2 && Math.abs(areas.find((a) => a.hex === 0x51cf66).area - 16) < 1e-9);
  check('gen-snapshot: hexToCss pads', hexToCss(0x0000ff) === '#0000ff');
}
