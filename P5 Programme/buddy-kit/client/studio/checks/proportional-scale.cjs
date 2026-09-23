const path = require('node:path');
const { run } = require('./gen-browser.cjs');
const { waitForBoot, assertStyled } = require('./page-state.cjs');

run(async ({ p, base, out, assert }) => {
  await p.goto(base);
  await waitForBoot(p);
  await assertStyled(p);

  await p.evaluate(() => {
    const studio = window.__studio;
    for (const shape of [...studio.shapes]) studio.remove(shape);
    const shape = studio.addPrimitive('box');
    shape.name = 'Ratio box';
    shape.scale.set(2, 1, 0.5);
    studio.select(shape);
  });

  await p.keyboard.press('s');
  const keep = p.getByRole('button', { name: 'Keep proportions' });
  await keep.waitFor();
  assert.equal(await keep.getAttribute('aria-pressed'), 'false');
  await keep.click();
  assert.equal(await keep.getAttribute('aria-pressed'), 'true');

  const scaled = await p.evaluate(() => {
    const controls = window.__transformControls;
    controls.dispatchEvent({ type: 'dragging-changed', value: true });
    controls.object.scale.y = 1.5;
    controls.dispatchEvent({ type: 'objectChange' });
    controls.dispatchEvent({ type: 'dragging-changed', value: false });
    return window.__studio.shapes[0].scale.toArray();
  });
  assert.deepEqual(scaled.map((n) => Number(n.toFixed(4))), [3, 1.5, 0.75]);

  assert.equal(await p.evaluate(() => window.__studio.undo()), true);
  const undone = await p.evaluate(() => window.__studio.shapes[0].scale.toArray());
  assert.deepEqual(undone.map((n) => Number(n.toFixed(4))), [2, 1, 0.5]);

  await p.screenshot({ path: path.join(out, 'proportional-scale.png') });
  console.log('PASS proportional scale: visible toggle, preserved 2:1:0.5 ratio, one-step Undo');
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
