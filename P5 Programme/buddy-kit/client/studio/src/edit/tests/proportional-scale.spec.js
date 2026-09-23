import { scaleWithProportions } from '../proportional-scale.js';

export default function (check) {
  const scaled = scaleWithProportions(
    { x: 2, y: 1.5, z: 0.5 },
    { x: 2, y: 1, z: 0.5 },
  );
  check('proportional scale: the most-changed axis drives every axis by the same ratio',
    scaled.x === 3 && scaled.y === 1.5 && scaled.z === 0.75);

  const flat = scaleWithProportions(
    { x: 4, y: 2, z: 0 },
    { x: 2, y: 2, z: 0 },
  );
  check('proportional scale: a flat axis stays flat without dividing by zero',
    flat.x === 4 && flat.y === 4 && flat.z === 0);
}
