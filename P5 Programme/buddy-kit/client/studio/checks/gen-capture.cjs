// Headed check: captureViews() renders four clean views + a 1024 grid from the real studio (no network).
const path = require('path');
const { run } = require('./gen-browser.cjs');
run(async ({ p, base, out, assert }) => {
  await p.goto(base);
  await p.waitForFunction(() => window.__studio);
  const go = p.getByRole('button', { name: /LET'S GO/i });
  if (await go.isVisible().catch(() => false)) await go.click();
  await p.evaluate(() => {
    const s = window.__studio;
    for (const m of [...s.shapes]) s.remove(m);
    // An octopus: a round head, six arms tapering to the floor, two eyes. Deliberately NOT
    // left-right-and-front-back identical, so the four captured views must actually differ.
    const head = s.addPrimitive('sphere', 0x9775fa, { silent: true });
    head.scale.set(1.6, 1.75, 1.6); head.position.set(0, 2.1, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = s.addPrimitive('cone', 0xf06595, { silent: true });
      arm.scale.set(0.38, 1.7, 0.38);
      arm.position.set(Math.sin(a) * 0.72, 0.85, Math.cos(a) * 0.72);
      arm.rotateY(a); arm.rotateX(Math.PI - 0.5); // apex down, leaning outward
    }
    for (const dx of [-0.34, 0.34]) {
      const eye = s.addPrimitive('sphere', 0xfcc419, { silent: true });
      eye.scale.setScalar(0.34); eye.position.set(dx, 2.35, 0.66);
    }
    s.emit('changed');
  });
  const r = await p.evaluate(async () => {
    const m = await import('/src/ai/gen-snapshot.js');
    const snap = await m.captureViews(window.__studio.shapes);
    const bmp = await createImageBitmap(snap.grid);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    const px = (X, Y) => Array.from(x.getImageData(X, Y, 1, 1).data.slice(0, 3));
    const bg = [(snap.background >> 16) & 255, (snap.background >> 8) & 255, snap.background & 255];
    const differs = (a) => Math.hypot(a[0] - bg[0], a[1] - bg[1], a[2] - bg[2]) > 30;
    const cellHasBuild = {};
    for (const [v, [cx, cy]] of Object.entries(m.GRID_CELLS)) {
      cellHasBuild[v] = false;
      for (let yy = cy + 16; yy < cy + 496 && !cellHasBuild[v]; yy += 16) {
        for (let xx = cx + 16; xx < cx + 496; xx += 16) if (differs(px(xx, yy))) { cellHasBuild[v] = true; break; }
      }
    }
    const split = await m.splitGridBlob(snap.grid);
    const splitSizes = await Promise.all(Object.values(split).map(async (blob) => { const i = await createImageBitmap(blob); return `${i.width}x${i.height}`; }));
    const img = document.createElement('img');
    img.src = URL.createObjectURL(snap.grid);
    img.style.cssText = 'position:fixed;right:10px;top:70px;width:420px;z-index:999;border:2px solid #0ff';
    document.body.appendChild(img);
    return { size: `${bmp.width}x${bmp.height}`, corner: px(2, 2), bg, cellHasBuild, colours: snap.colours.length, splitSizes };
  });
  // Does the angle actually reach the renderer? An angle control that moves nothing passes every
  // value assertion ever written, so this compares real pixels from the real studio.
  const angles = await p.evaluate(async () => {
    const m = await import('/src/ai/gen-snapshot.js');
    const pixels = async (blob) => {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.drawImage(bmp, 0, 0, 128, 128);
      bmp.close();
      return x.getImageData(0, 0, 128, 128).data;
    };
    // Mean absolute difference per channel, 0 = identical.
    const diff = (a, b) => {
      let total = 0;
      for (let i = 0; i < a.length; i += 4) total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      return total / ((a.length / 4) * 3);
    };
    const shapes = window.__studio.shapes;
    const square = await m.captureViews(shapes, { turn: 0, tilt: 0 });
    const turned45 = await m.captureViews(shapes, { turn: 45, tilt: 0 });
    const turned90 = await m.captureViews(shapes, { turn: 90, tilt: 0 });
    const tilted = await m.captureViews(shapes, { turn: 0, tilt: 25 });
    const head = shapes.filter((sh) => sh.geometry?.type === 'SphereGeometry');
    const headOnly = await m.captureViews(head, { turn: 0, tilt: 0 });

    const [sqFront, sqLeft] = [await pixels(square.views.front), await pixels(square.views.left)];
    return {
      turnMoves: diff(sqFront, await pixels(turned45.views.front)),
      tiltMoves: diff(sqFront, await pixels(tilted.views.front)),
      // A quarter turn is rigid: the new front must land where left was.
      quarterTurnIsRigid: diff(await pixels(turned90.views.front), sqLeft),
      // ...and must NOT simply equal the old front, which is what a dead control would give.
      quarterTurnIsNotIdentity: diff(await pixels(turned90.views.front), sqFront),
      scopeDropsArms: diff(sqFront, await pixels(headOnly.views.front)),
      headShapes: head.length,
      allShapes: shapes.length,
      reportedTurn: turned45.turn,
      reportedTilt: tilted.tilt,
      clampedTilt: (await m.captureViews(head, { turn: 0, tilt: 90 })).tilt,
      countReported: headOnly.shapeCount,
    };
  });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(out, 'capture-check.png') });
  assert.ok(angles.turnMoves > 3, `turning must change the picture (got ${angles.turnMoves.toFixed(2)})`);
  assert.ok(angles.tiltMoves > 3, `tilting must change the picture (got ${angles.tiltMoves.toFixed(2)})`);
  assert.ok(angles.quarterTurnIsRigid < 1.5,
    `a quarter turn must put front where left was (got ${angles.quarterTurnIsRigid.toFixed(2)})`);
  assert.ok(angles.quarterTurnIsNotIdentity > 3,
    `a quarter turn must not leave front unchanged (got ${angles.quarterTurnIsNotIdentity.toFixed(2)})`);
  assert.ok(angles.headShapes > 0 && angles.headShapes < angles.allShapes);
  assert.ok(angles.scopeDropsArms > 3,
    `photographing only the selection must drop the rest of the build (got ${angles.scopeDropsArms.toFixed(2)})`);
  assert.equal(angles.countReported, angles.headShapes);
  assert.equal(angles.reportedTurn, 45);
  assert.equal(angles.reportedTilt, 25);
  assert.equal(angles.clampedTilt, 30, 'the renderer clamps tilt, not just the UI');
  assert.equal(r.size, '1024x1024');
  assert.ok(r.corner.every((v, i) => Math.abs(v - r.bg[i]) <= 3));
  assert.deepEqual(Object.values(r.cellHasBuild), [true, true, true, true]);
  assert.equal(r.colours, 3);
  assert.deepEqual(r.splitSizes, ['512x512', '512x512', '512x512', '512x512']);
}).catch((err) => { console.error(err); process.exitCode = 1; });
