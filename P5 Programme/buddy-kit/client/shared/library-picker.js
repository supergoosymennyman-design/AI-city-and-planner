// library-picker.js — shared model-library picker (dark dashboard style).
// A modal thumbnail grid with category tabs. Any app (lab, ship, station,
// workshop…) calls openLibraryPicker({ onSelect }) to let a student pick a
// model from the shared library. Thumbnails come from /library/thumbnails/.
import { LIBRARY, LIBRARY_CATEGORIES, libraryByCategory } from '../city-common/library.js';

const CATEGORY_LABELS = {
  buildings: 'Buildings', nature: 'Nature', props: 'Props', vehicles: 'Vehicles',
  characters: 'Characters', accessories: 'Accessories', scenarios: 'Themed',
};

let _open = false;

export function openLibraryPicker({ onSelect, title = 'Pick something to add' } = {}) {
  if (_open) return;
  _open = true;

  // ── container ────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'lp-overlay';
  const panel = document.createElement('div');
  panel.className = 'lp-panel';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); _open = false; };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // ── header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'lp-header';
  const hTitle = document.createElement('div');
  hTitle.className = 'lp-title';
  hTitle.textContent = title;
  const hClose = document.createElement('button');
  hClose.className = 'lp-close';
  hClose.setAttribute('aria-label', 'Close');
  hClose.textContent = '✕';
  hClose.addEventListener('click', close);
  header.appendChild(hTitle);
  header.appendChild(hClose);
  panel.appendChild(header);

  // ── tabs ─────────────────────────────────────────────────────────────────
  const tabs = document.createElement('div');
  tabs.className = 'lp-tabs';
  const nonEmpty = LIBRARY_CATEGORIES.filter((c) => libraryByCategory(c).length);
  const activeCats = ['all', ...nonEmpty];
  // With a large catalog (1000+ entries) defaulting to 'all' renders every card at
  // once — pick the first non-empty category so the grid is small and snappy.
  const defaultCat = nonEmpty.length ? nonEmpty[0] : 'all';
  let current = defaultCat;
  for (const cat of activeCats) {
    const tab = document.createElement('button');
    tab.className = 'lp-tab' + (cat === current ? ' active' : '');
    tab.textContent = cat === 'all' ? 'All' : (CATEGORY_LABELS[cat] || cat);
    tab.dataset.cat = cat;
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('.lp-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      current = cat;
      render(cat);
    });
    tabs.appendChild(tab);
  }
  panel.appendChild(tabs);

  // ── grid ─────────────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'lp-grid';
  panel.appendChild(grid);

  function render(cat) {
    grid.innerHTML = '';
    const all = cat === 'all' ? LIBRARY : libraryByCategory(cat);
    const items = all.filter((i) => i.picker !== false);
    for (const item of items) {
      const card = document.createElement('button');
      card.className = 'lp-card';
      card.innerHTML = `
        <img class="lp-thumb" src="../library/thumbnails/${item.id}.png" alt="${item.name}" loading="lazy">
        <span class="lp-name">${item.name}</span>
      `;
      card.addEventListener('click', () => {
        onSelect && onSelect(item);
        close();
      });
      grid.appendChild(card);
    }
  }
  render(current);

  // ── style (self-contained, dark dashboard look) ──────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .lp-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(8, 12, 22, 0.72);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .lp-panel {
      width: min(720px, 94vw);
      max-height: 84vh;
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 14px;
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .lp-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px;
      border-bottom: 1px solid #334155;
    }
    .lp-title { font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 600; font-size: 17px; color: #F8FAFC; }
    .lp-close {
      background: #334155; color: #94A3B8; border: none; border-radius: 8px;
      width: 34px; height: 34px; font-size: 14px; cursor: pointer;
    }
    .lp-close:hover { color: #F8FAFC; }
    .lp-tabs {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 12px 18px 4px;
    }
    .lp-tab {
      background: #0F172A; color: #94A3B8; border: 1px solid #334155;
      border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700;
      cursor: pointer; letter-spacing: 0.4px;
    }
    .lp-tab.active { color: #F8FAFC; border-color: #00E5FF; }
    .lp-grid {
      padding: 12px 18px 18px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 12px;
    }
    .lp-card {
      background: #0F172A; border: 1px solid #334155; border-radius: 10px;
      padding: 10px 6px 8px; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      transition: transform 80ms linear, border-color 80ms linear;
      content-visibility: auto; contain-intrinsic-size: 110px;
    }
    .lp-card:hover { transform: translateY(-2px); border-color: #00E5FF; }
    .lp-thumb {
      width: 64px; height: 64px; border-radius: 8px;
      background: #0B1220; object-fit: contain;
    }
    .lp-name {
      font-size: 11px; font-weight: 600; color: #E2E8F0;
      text-align: center; line-height: 1.2;
      max-width: 100%; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
  `;
  document.head.appendChild(style);
  return { close };
}
