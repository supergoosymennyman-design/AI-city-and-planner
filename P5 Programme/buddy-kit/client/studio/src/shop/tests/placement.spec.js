import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';
import { createShopController } from '../controller.js';
import { insertShopModel } from '../placement.js';

const model = { id: 'cube', name: 'Shop cube', file: 'cube.glb', unlock: { type: 'free' } };
const catalog = { models: [model], startingCoins: 120, startingLevel: 1 };
function cube() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xff8800 })));
  return group;
}

export default async function checks(check) {
  const studio = new StudioScene();
  studio.addPrimitive('sphere');
  const initialUndo = studio.undoStack.length;
  const shop = createShopController({ loader: { loadTemplate: cube }, insert: (obj, entry, point) => insertShopModel(studio, obj, entry, point) });
  shop.setCatalog(catalog);
  await shop.placeModel(model, [3, 0, 2]);
  const placed = studio.shapes[1];
  placed.updateWorldMatrix(true, false);
  placed.geometry.computeBoundingBox();
  // Selection adds a slightly inflated outline child: measure the actual surface.
  const bounds = placed.geometry.boundingBox.clone().applyMatrix4(placed.matrixWorld);
  check('shop: Add is one snapshot undo unit with floor seating', studio.shapes.length === 2 && studio.undoStack.length === initialUndo + 1 && Math.abs(bounds.min.y) < 1e-6);
  studio.undo();
  check('shop: undo removes placement while preserving existing build', studio.shapes.length === 1);
  studio.redo();
  check('shop: redo restores placement and its appearance once', studio.shapes.length === 2 && studio.shapes[1].material.color.getHex() === 0xff8800);
  const restored = new StudioScene();
  restoreSnapshot(restored, structuredClone(takeSnapshot(studio)));
  const reopened = createShopController({ loader: { loadTemplate: cube }, insert: (obj, entry) => insertShopModel(restored, obj, entry) });
  reopened.setCatalog(catalog);
  check('shop: reload initializes economy without replaying meshes', restored.shapes.length === 2 && reopened.getState().placed.length === 0);
  await shop.reset();
  check('shop: resetting demo progress preserves scene', studio.shapes.length === 2);
  studio.pushUndo(); studio.remove(studio.shapes[1]);
  check('shop: deleting a model does not respawn it', studio.shapes.length === 1);
  studio.undo();
  check('shop: deletion can be undone', studio.shapes.length === 2);

  let resolve;
  let insertions = 0;
  let disposals = 0;
  const delayed = createShopController({ loader: { loadTemplate: () => new Promise((r) => { resolve = r; }) },
    insert: () => { insertions++; }, dispose: () => { disposals++; } });
  delayed.setCatalog(catalog);
  const pending = delayed.placeModel(model);
  await Promise.resolve(); delayed.invalidate(); resolve(cube()); await pending;
  check('shop: a model resolving after New scene is discarded', insertions === 0 && disposals === 1);
  const timed = createShopController({ timeoutMs: 5, loader: { loadTemplate: () => new Promise((r) => { resolve = r; }) },
    insert: () => { insertions++; }, dispose: () => { disposals++; } });
  timed.setCatalog(catalog);
  let timeout = false;
  try { await timed.placeModel(model); } catch (e) { timeout = /timed out/.test(e.message); }
  resolve(cube()); await Promise.resolve(); await Promise.resolve();
  check('shop: hung load times out and late response never mutates scene', timeout && insertions === 0 && disposals === 2);
  const before = studio.undoStack.length;
  let rejected = false;
  try { insertShopModel(studio, new THREE.Group(), model); } catch { rejected = true; }
  check('shop: invalid model creates no undo entry', rejected && studio.undoStack.length === before);
  let forged = false;
  try { await shop.placeModel({ id: 'invented', unlock: { type: 'free' } }); } catch { forged = true; }
  check('shop: only catalogued models can be placed', forged);
}
