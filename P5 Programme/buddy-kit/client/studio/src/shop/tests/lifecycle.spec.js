import * as THREE from 'three';
import { createLoader } from '../loader.js';
import { createShopController } from '../controller.js';
import { SHOP_KEY, resetShopState } from '../store.js';

const scene = () => new THREE.Scene().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

export default async function checks(check) {
  let calls = 0, releases = [];
  const loader = createLoader({ importModel: () => { calls++; return new Promise(resolve => releases.push(resolve)); } });
  const a = loader.loadTemplate('one.glb'), b = loader.loadTemplate('one.glb');
  await tick(); releases.shift()({ scene: scene() });
  const [first, second] = await Promise.all([a, b]);
  check('loader: simultaneous consumers share one download but own independent resources', calls === 1 && first !== second && first.children[0].geometry !== second.children[0].geometry && first.children[0].material !== second.children[0].material);
  const stale = loader.loadTemplate('late.glb').catch(e => e);
  await tick(); loader.clear();
  check('loader: clear settles pending consumers immediately', /cancelled/.test((await stale).message));
  const late = scene(); let disposed = 0;
  late.children[0].geometry.addEventListener('dispose', () => disposed++);
  releases.shift()({ scene: late }); await tick();
  const fresh = loader.loadTemplate('late.glb'); await tick();
  check('loader: late completion after clear is disposed and cannot repopulate cache', disposed === 1 && calls === 3);
  releases.shift()({ scene: scene() }); await fresh; loader.clear();

  let releaseHang;
  const bounded = createLoader({ timeoutMs: 5, importModel: () => new Promise(resolve => { releaseHang = resolve; }) });
  const timed = await bounded.loadTemplate('hung.glb').catch(e => e);
  check('loader: shared download timeout covers preview and thumbnail consumers', /timed out/.test(timed.message));
  const lateTimeout = scene(); let lateDisposed = 0;
  lateTimeout.children[0].geometry.addEventListener('dispose', () => lateDisposed++);
  releaseHang({ scene: lateTimeout }); await tick();
  check('loader: timed-out completion is disposed', lateDisposed === 1);

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => stored.get(k) ?? null, setItem: (k, value) => stored.set(k, value), removeItem: k => stored.delete(k),
  } });
  try {
    resetShopState();
    const models = [{ id: 'a', unlock: { type: 'coins', coins: 40 } }, { id: 'b', unlock: { type: 'coins', coins: 80 } }];
    const catalog = { startingCoins: 120, startingLevel: 1, models };
    const tabA = createShopController(), tabB = createShopController();
    tabA.setCatalog(catalog); tabB.setCatalog(catalog);
    await Promise.all([tabA.purchase(models[0]), tabB.purchase(models[1])]);
    await tabA.setSidebarWidth(300);
    const saved = JSON.parse(stored.get(SHOP_KEY));
    check('shop: concurrent purchases and stale UI changes retain both ownership and exact spend', saved.coins === 0 && saved.owned.includes('a') && saved.owned.includes('b') && saved.sidebarWidth === 300);
    const future = JSON.stringify({ version: 2, coins: 999, owned: ['future-item'] });
    stored.set(SHOP_KEY, future);
    const reopened = createShopController(); reopened.setCatalog(catalog);
    const refused = await reopened.purchase(models[0]).catch(e => e);
    check('shop: boot and refused edits preserve unknown-version bytes', stored.get(SHOP_KEY) === future && /version/.test(refused.message));
  } finally {
    resetShopState();
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
}
