// Headed check for the half of the texture round trip Node cannot reach: the canvas ENCODER and
// the image DECODER in material-ops.js, and the real Undo path through the real studio.
//
// The Node suite proves the descriptor is built, stored and read back. It cannot prove that the
// bytes survive being encoded to a data URL and decoded again, because neither a canvas nor an
// Image exists there — so a texture could round-trip as a valid-looking descriptor and still come
// back blank. This check paints a known colour, puts it through Undo, and reads the pixel back.
const path = require('node:path');
const { run } = require('./gen-browser.cjs');

run(async ({ p, base, out, assert }) => {
  await p.goto(base);
  await p.waitForFunction(() => window.__studio);
  const go = p.getByRole('button', { name: /LET'S GO/i });
  if (await go.isVisible().catch(() => false)) await go.click();

  // A generated model as the app would hold one: two painted regions, each with its own real
  // texture, on one editable mesh.
  const built = await p.evaluate(async () => {
    const { materialFromAppearance, describeAppearance } = await import('/src/edit/material-ops.js');
    const paint = (css) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = css; g.fillRect(0, 0, 64, 64);
      return c;
    };
    const url = (css) => paint(css).toDataURL('image/png');
    const made = [];
    for (const css of ['#ff0000', '#0000ff']) {
      const built = materialFromAppearance({
        materials: [{ color: 0xffffff, map: url(css), flipY: false, roughness: 0.6, metalness: 0.1 }],
        groups: [],
      });
      await built.ready;
      made.push(built.material);
    }
    const s = window.__studio;
    for (const m of [...s.shapes]) s.remove(m);
    const mesh = s.addPrimitive('box', 0xffffff, { silent: true });
    mesh.name = 'textured';
    mesh.material = made;
    mesh.geometry.clearGroups();
    mesh.geometry.addGroup(0, 18, 0);
    mesh.geometry.addGroup(18, 18, 1);
    Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
    s.emit('changed');

    // The ENCODER: a texture built straight from a canvas has no cached data URL, so
    // describeAppearance must encode it here and now. The material must be BUILT, never cloned
    // from one of the above — a clone carries the stashed source URL and would answer for it.
    const TextureCtor = made[0].map.constructor;
    const fresh = new TextureCtor(paint('#00ff00'));
    fresh.needsUpdate = true;
    const probeMat = new made[0].constructor({ color: 0xffffff, map: fresh });
    const probe = describeAppearance({ material: [probeMat], geometry: { groups: [] } });
    return {
      decoded: made.every((m) => m.map && m.map.image && m.map.image.width === 64),
      encoded: typeof probe.materials[0].map === 'string' && probe.materials[0].map.startsWith('data:image/'),
      encodedType: (probe.materials[0].map || '').slice(5, 15),
    };
  });
  assert.ok(built.decoded, 'both textures decoded before the round trip');
  assert.ok(built.encoded, `describeAppearance encoded a live canvas texture (got ${built.encodedType})`);

  // The real Undo path: snapshot WITH the model, change something, undo back to it.
  await p.evaluate(() => {
    const s = window.__studio;
    s.pushUndo();
    s.addPrimitive('sphere', 0x4dabf7, { silent: true });
    s.emit('changed');
    s.undo();
  });
  await p.waitForFunction(() => {
    const m = window.__studio.shapes.find((x) => x.userData.generated);
    const mats = Array.isArray(m && m.material) ? m.material : [];
    return mats.length === 2 && mats.every((x) => x.map && x.map.image && x.map.image.complete !== false);
  }, null, { timeout: 20000 });

  const after = await p.evaluate(async () => {
    const { takeSnapshot } = await import('/src/edit/snapshot.js');
    const mesh = window.__studio.shapes.find((x) => x.userData.generated);
    const read = (tex) => {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const g = c.getContext('2d');
      g.drawImage(tex.image, 0, 0, 8, 8);
      return [...g.getImageData(4, 4, 1, 1).data].slice(0, 3);
    };
    const snap = takeSnapshot(window.__studio).objects.find((o) => o.generated);
    return {
      materials: mesh.material.length,
      groups: mesh.geometry.groups.length,
      hasUv: !!mesh.geometry.attributes.uv,
      pixels: mesh.material.map((m) => read(m.map)),
      // A second snapshot must still carry both images, or the document drains one undo at a time.
      stillCarries: snap && snap.appearance
        ? snap.appearance.materials.filter((m) => typeof m.map === 'string').length : 0,
      jsonSafe: (() => { try { JSON.parse(JSON.stringify(snap)); return true; } catch (e) { return false; } })(),
    };
  });

  assert.equal(after.materials, 2, 'the restored model kept both materials');
  assert.equal(after.groups, 2, 'the restored model kept both geometry groups');
  assert.ok(after.hasUv, 'the restored model kept its UVs');
  assert.equal(after.stillCarries, 2, 'a further snapshot still carries both images');
  assert.ok(after.jsonSafe, 'the snapshot is still plain JSON');
  // The bytes, not just the wiring: red stays red and blue stays blue through encode + decode.
  const [red, blue] = after.pixels;
  assert.ok(red[0] > 200 && red[1] < 60 && red[2] < 60, `first region is still red (got ${red})`);
  assert.ok(blue[2] > 200 && blue[0] < 60 && blue[1] < 60, `second region is still blue (got ${blue})`);

  // The colour control is DOM wiring the Node suite can only pin by regex — click it for real.
  await p.evaluate(() => {
    const s = window.__studio;
    s.select(s.shapes.find((x) => x.userData.generated));
  });
  const swatch = p.locator('.swatches button').first();
  if (await swatch.isVisible().catch(() => false)) {
    const wanted = await swatch.evaluate((b) => b.title);
    await swatch.click();
    const tinted = await p.evaluate(() => {
      const m = window.__studio.shapes.find((x) => x.userData.generated);
      return m.material.map((x) => '#' + x.color.getHexString());
    });
    assert.deepEqual(tinted, [wanted, wanted], 'the swatch tinted every material of the model');
  } else {
    throw new Error('the colour swatches were not reachable for a selected generated model');
  }

  // A single material used to lose its saved image if another snapshot happened before Image
  // decoded. Run the history operations in one JS turn so this race is deterministic.
  const pendingSingleMap = await p.evaluate(async () => {
    const { takeSnapshot } = await import('/src/edit/snapshot.js');
    const s = window.__studio;
    const mesh = s.shapes.find((x) => x.userData.generated);
    mesh.material = mesh.material[0];
    mesh.geometry.clearGroups();
    s.pushUndo();
    s.addPrimitive('sphere', 0xffffff, { silent: true });
    s.undo();
    const pending = takeSnapshot(s).objects.find((o) => o.generated);
    s.redo();
    s.undo();
    return pending?.appearance?.materials[0]?.map;
  });
  assert.ok(pendingSingleMap?.startsWith('data:image/'), 'the pending single texture stays in history');
  await p.waitForFunction(() => {
    const mat = window.__studio.shapes.find((x) => x.userData.generated)?.material;
    return mat?.map?.image?.complete;
  }, null, { timeout: 20000 });
  const singlePixel = await p.evaluate(() => {
    const tex = window.__studio.shapes.find((x) => x.userData.generated).material.map;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tex.image, 0, 0, 8, 8);
    return [...ctx.getImageData(4, 4, 1, 1).data];
  });
  assert.ok(singlePixel[0] > 200 && singlePixel[1] < 60 && singlePixel[2] < 60,
    `the single texture stays red after rapid undo/redo/undo (got ${singlePixel})`);

  await p.screenshot({ path: path.join(out, 'texture-round-trip.png') });
});
