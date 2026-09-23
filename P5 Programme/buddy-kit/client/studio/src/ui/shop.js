import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createLoader } from '../shop/loader.js';
import { createShopController } from '../shop/controller.js';
import { insertShopModel } from '../shop/placement.js';
import { categoriesFromCatalog } from '../shop/search.js';
import { nodeState } from '../shop/skill-progress.js';
import { disposeModel } from '../ai/gen-place.js';
import { ShopPanel } from './shop-panel.js';
import { ShopPreview } from './shop-preview.js';
import { createThumbnailProvider } from './shop-thumbnail.js';
import { attachShopResize, measureShopAvailableWidth } from './shop-resize.js';
import { attachPreviewDrag } from './ai-drag.js';
import { SHOP_KEY } from '../shop/store.js';

/** Wire the PR's shop UI to the current Studio document, without owning its save lifecycle. */
export function createShop({ studio, viewport, toast, raycastToWorld, confirm, champion }) {
  const host = document.getElementById('shop-sidebar');
  const body = host.querySelector('#shop-body');
  const previewHost = document.createElement('div');
  previewHost.id = 'shop-preview';
  previewHost.className = 'is-empty';
  host.querySelector('.shop-tools').appendChild(previewHost);
  const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const loader = createLoader({
    baseUrl: import.meta.env.BASE_URL,
    fetchImpl: (url) => fetch(url, { signal: AbortSignal.timeout(15000) }),
    importModel: (url) => gltf.loadAsync(url),
  });
  const controller = createShopController({
    loader, dispose: disposeModel, champion,
    insert: (object, model, point) => insertShopModel(studio, object, model, point),
  });
  const preview = new ShopPreview(previewHost, { loadTemplate: loader.loadTemplate });
  const thumbs = createThumbnailProvider({ loadTemplate: loader.loadTemplate });
  let catalog = null;
  let tree = null;
  let errors = [];
  let fetchError = null;
  let skillFail = null;
  let loading = false;
  let selected = null;
  let dragged = null;
  let disposed = false;
  let loadSerial = 0;
  const perform = work => Promise.resolve().then(work).catch(error => { toast.show(error.message); });
  function paint(extra = {}) {
    if (disposed) return;
    const progress = controller.getProgress();
    const states = new Map();
    for (const branch of tree?.branches || []) {
      for (const node of branch.nodes) states.set(node.id, nodeState(progress, tree, node.id));
    }
    panel.render({ state: controller.getState(), catalog, categories: categoriesFromCatalog(catalog?.models),
      skillTree: tree, nodeStates: states, errors, fetchError, skillFail, loading, resolved: !loading, ...extra });
  }
  function hidePreview() { preview.hide(); previewHost.classList.add('is-empty'); }
  function select(model) {
    selected = model;
    previewHost.classList.remove('is-empty');
    preview.show(model).catch((error) => toast.show(error.message));
  }
  async function place(model, point) {
    if (!window.__studioReady) return;
    try {
      const object = await controller.placeModel(model, point);
      if (object) { viewport.frameContents(studio.group); toast.show(`Added ${model.name}. Undo removes it.`); }
    } catch (error) { toast.show(error.message); }
  }
  const panel = new ShopPanel(host, {
    onPlace: place,
    onBuy(model) { void perform(async () => { const result = await controller.purchase(model); if (!result.ok) toast.show(result.reason); }); },
    onSelectModel: select,
    onDragStart(model) { dragged = model; },
    onGrantCoins: () => perform(() => controller.grantCoins(50)),
    onGrantLevel: () => perform(() => controller.grantLevel(1)),
    onReset: () => confirm('Reset demo credits and skill progress? Your scene will be kept.', () => perform(() => controller.reset())),
    onToggleCollapse(value) { void perform(() => controller.setCollapsed(value)); if (value) hidePreview(); else if (selected) select(selected); },
    onViewChange(view) { if (view === 'tree') hidePreview(); else if (selected) select(selected); },
    onRetry: () => start(),
    onToast: (message) => toast.show(message),
    getThumbnail: (id) => thumbs.get(id),
  });
  controller.subscribe(() => paint());
  champion?.subscribe(() => controller.refresh());
  const debug = host.querySelector('#shop-debug');
  debug.hidden = !!champion || !import.meta.env.DEV;
  debug.addEventListener('click', (event) => {
    if (!event.target.closest('[data-debug="achieve-next"]')) return;
    const next = tree?.branches.flatMap((branch) => branch.nodes)
      .find((node) => !controller.getProgress().achieved.includes(node.id));
    if (next) void perform(() => report([next.id]));
  });
  async function report(ids) {
    const result = await controller.applyAchieved(ids);
    paint({ newlyUnlocked: result.newlyUnlocked });
    return result;
  }
  const stopResize = attachShopResize({
    handleEl: host.querySelector('#shop-resize'), sidebarEl: host,
    getWidth: () => controller.getState()?.sidebarWidth || 280,
    getAvailableWidth: () => measureShopAvailableWidth({ mainEl: document.getElementById('main'),
      rightSidebarEl: document.getElementById('sidebar'), shopSidebarEl: host, viewportEl: document.getElementById('viewport') }),
    onCommit: (width) => perform(() => controller.setSidebarWidth(width)),
  });
  const restrictDrag = (event) => { if (!event.target.closest('[data-drag-handle]')) event.stopPropagation(); };
  body.addEventListener('pointerdown', restrictDrag, true);
  const stopDrag = attachPreviewDrag({ canvasEl: body, viewportEl: document.getElementById('viewport'),
    raycastToWorld, ghostLabel: 'Drop to place', onDrop(point) { const model = dragged; dragged = null; if (model) void place(model, point); } });
  body.style.removeProperty('touch-action');
  async function start() {
    const serial = ++loadSerial;
    loading = true; paint();
    // A missing skill tree must not hold catalogue browsing or the Studio's boot hostage.
    const [models, skills] = await Promise.all([loader.loadCatalog(), loader.loadSkillTree()]);
    if (disposed || serial !== loadSerial) return;
    catalog = models.catalog; errors = models.errors; fetchError = models.fetchError;
    tree = skills.config; skillFail = skills.fetchError || skills.errors.join('\n') || null;
    loading = false;
    if (!fetchError) {
      controller.setCatalog(catalog);
      if (controller.storageIssue()) toast.show(controller.storageIssue());
      controller.setSkillTree(tree);
      host.style.setProperty('--shop-w', `${controller.getState().sidebarWidth || 280}px`);
    }
    paint();
    if (!fetchError) { await thumbs.warm(catalog.models); paint(); }
  }
  // Explicit developer/next-integration seams. No lesson producer is connected here.
  window.__shop = controller;
  const syncStorage = event => { if (event.key === SHOP_KEY || event.key === null) controller.refresh(); };
  window.addEventListener('storage', syncStorage);
  window.__shopPanel = panel;
  window.__skillTree = { applyAchieved: report, getAchieved: () => controller.getProgress().achieved,
    getUnlocked: () => controller.getProgress().unlockedNodes };
  window.addEventListener('pagehide', () => {
    // Keep the UI usable if restored from the browser's back-forward cache.
    hidePreview();
  });
  return { start, invalidate: () => controller.invalidate(),
    dispose() { disposed = true; window.removeEventListener('storage', syncStorage); controller.invalidate(); stopDrag(); stopResize(); preview.dispose(); thumbs.dispose(); panel.destroy(); draco.dispose(); loader.clear(); } };
}
