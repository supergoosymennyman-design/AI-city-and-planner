// skins.js — champion skin registry + selection sidebar.
// The sidebar has two tabs: "Presets" (full-body skins) and "Accessories"
// (modular items across head/face/back slots that students mix and match).
// All skins share the same Mixamo armature so the shared animation library
// works on every skin. Accessories attach to bones and survive skin swaps.
//
// Progression: skins can be locked behind quest completions. A skin with a
// `requiredMission` id is only equippable once the student has completed that
// quest. The currently-shipped 5 skins are all always-available; future
// mission-reward skins set `requiredMission` and appear with a 🔒 badge.
import { ACC_SLOTS, accessoriesForSlot, getAccessory, loadEquipped, saveEquipped } from './accessories.js';
import { loadQuestState } from '../hong-kong-real/quests.js';
import { clearCustomSkin, revokeObjectUrl } from './custom-skin.js';
import { t, initI18n } from './i18n.js';

// This module instance owns the skin sidebar's strings. The city-builder HUD
// toggles language through its OWN i18n module; both read the same LANG_KEY,
// so initialise here so the sidebar isn't frozen in English.
initI18n();

// Equipped skin persists across games (HK city ↔ capstone) so the student's
// champion looks the same everywhere. v2: default champion became the Pastel
// Bunny Bot — bumping the key discards pre-v2 saved choices so the new default
// actually shows (old `v1` picks would otherwise override it forever).
export const SKIN_STORAGE_KEY = 'hk_ai_city_skin_v2';
export const SKIN_UNLOCK_KEY = 'hk_ai_city_unlocked_skins_v1';
function loadSavedSkin() { try { return localStorage.getItem(SKIN_STORAGE_KEY) || null; } catch (e) { return null; } }
function saveSkin(id) { try { localStorage.setItem(SKIN_STORAGE_KEY, id); } catch (e) { /* ignore */ } }
function loadUnlocked() { try { return JSON.parse(localStorage.getItem(SKIN_UNLOCK_KEY)) || []; } catch (e) { return []; } }
function saveUnlocked(ids) { try { localStorage.setItem(SKIN_UNLOCK_KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ } }

// Mission-reward skins: questId -> skinId. Populated as new skins are created.
// A skin is unlocked if it has no `requiredMission` OR that mission is done.
export const SKIN_REWARDS = {};   // { questId: skinId, ... }

export const SKINS = [
  { id: 'crimson',    name: 'Crimson Guardian',  glb: 'clips/idle.glb' },
  { id: 'dragon',     name: 'Dragon Emperor',    glb: 'clips/idle_dragon.glb' },
  { id: 'neondragon', name: 'Neon Dragon Mech',  glb: 'clips/idle_neondragon.glb' },
  { id: 'bunny',      name: 'Pastel Bunny Bot',  glb: 'clips/idle_bunny.glb' },
  { id: 'sentinel',   name: 'Neon Sentinel',     glb: 'clips/idle_sentinel.glb' },
];

// Unlock a reward skin when a mission is completed (called by questComplete).
export function unlockSkinForQuest(questId) {
  const skinId = SKIN_REWARDS[questId];
  if (!skinId) return false;
  const unlocked = loadUnlocked();
  if (!unlocked.includes(skinId)) {
    unlocked.push(skinId);
    saveUnlocked(unlocked);
    return true;
  }
  return false;
}

// Is a skin equippable? (no requirement → yes; requirement → mission completed)
export function isSkinUnlocked(skin) {
  if (!skin.requiredMission) return true;
  const st = loadQuestState();
  return (st.completed || []).includes(skin.requiredMission);
}

/** The id used in SKIN_STORAGE_KEY for the uploaded "fitted champion". */
export const CUSTOM_SKIN_ID = '__custom__';

/** Called right after a successful upload so the custom skin is the default. */
export function equipCustomDefault() {
  saveSkin(CUSTOM_SKIN_ID);
}

export function mountSkinSidebar(assetBase, champion, onSwap, customSkin) {
  const btn = document.getElementById('skin-toggle');
  const panel = document.getElementById('skin-panel');
  const list = document.getElementById('skin-list');
  if (!btn || !panel || !list) return null;

  const saved = loadSavedSkin();
  const savedIsPreset = saved && SKINS.some(s => s.id === saved);
  // A saved preset wins; otherwise the uploaded champion is the default; bunny last.
  let current = savedIsPreset ? saved : (customSkin && customSkin.url ? CUSTOM_SKIN_ID : 'bunny');
  if (saved === CUSTOM_SKIN_ID && !(customSkin && customSkin.url)) { saveSkin('bunny'); current = 'bunny'; }
  const state = {
    current,
    busy: false,
    equipped: loadEquipped(),
    custom: (customSkin && customSkin.url) ? customSkin : null,
  };

  // ---- Tab bar: Presets | Accessories ----
  const tabs = document.createElement('div');
  tabs.className = 'skin-tabs';
  tabs.innerHTML = `
    <button class="skin-tab active" data-tab="presets">${t('skins.presets')}</button>
    <button class="skin-tab" data-tab="acc">${t('skins.accessories')}</button>`;
  panel.insertBefore(tabs, list);

  const accList = document.createElement('div');
  accList.className = 'acc-list hidden';
  panel.appendChild(accList);

  function showTab(tab) {
    tabs.querySelectorAll('.skin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    list.classList.toggle('hidden', tab !== 'presets');
    accList.classList.toggle('hidden', tab !== 'acc');
    if (tab === 'acc') renderAccessories();
  }
  tabs.querySelectorAll('.skin-tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---- Presets tab (full-body skins) ----
  function render() {
    list.innerHTML = '';
    // Uploaded "fitted champion" card (Fit Studio) — always shown first when present.
    if (state.custom && state.custom.url) {
      const skin = { id: CUSTOM_SKIN_ID, name: state.custom.name || 'My Champion', glb: state.custom.url };
      const card = document.createElement('div');
      card.className = 'skin-card custom-skin' + (state.current === CUSTOM_SKIN_ID ? ' equipped' : '');
      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = skin.name;
      const btn2 = document.createElement('button');
      btn2.className = 'skin-equip';
      if (state.current === CUSTOM_SKIN_ID) {
        btn2.textContent = t('skins.equipped');
        btn2.disabled = true;
      } else {
        btn2.textContent = t('skins.equip');
        btn2.addEventListener('click', async () => {
          if (state.busy) return;
          state.busy = true;
          btn2.textContent = 'Loading…';
          try {
            await champion.swapSkin(skin.glb, CUSTOM_SKIN_ID);
            state.current = CUSTOM_SKIN_ID;
            saveSkin(CUSTOM_SKIN_ID);
            onSwap && onSwap(skin);
          } catch (e) {
            console.warn('custom skin swap failed:', e);
          } finally {
            state.busy = false;
            render();
          }
        });
      }
      // Remove — discard the uploaded file (IndexedDB) and revert to the bunny.
      const rm = document.createElement('button');
      rm.className = 'skin-remove';
      rm.textContent = '✕';
      rm.setAttribute('aria-label', t('skins.removeCustom') || 'Remove uploaded champion');
      rm.addEventListener('click', async () => {
        await clearCustomSkin();
        if (state.custom.url) revokeObjectUrl(state.custom.url);
        state.custom = null;
        saveSkin('bunny');
        state.current = 'bunny';
        try { await champion.swapSkin(assetBase + 'clips/idle_bunny.glb', 'bunny'); }
        catch (e) { console.warn('revert to bunny failed:', e); }
        render();
      });
      card.append(name, btn2, rm);
      list.appendChild(card);
    }
    for (const skin of SKINS) {
      const unlocked = isSkinUnlocked(skin);
      const card = document.createElement('div');
      card.className = 'skin-card' + (skin.id === state.current ? ' equipped' : '') + (unlocked ? '' : ' locked');
      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = unlocked ? skin.name : `🔒 ${skin.name}`;
      const btn2 = document.createElement('button');
      btn2.className = 'skin-equip';
      if (!unlocked) {
        btn2.textContent = t('skins.locked');
        btn2.disabled = true;
      } else if (skin.id === state.current) {
        btn2.textContent = t('skins.equipped');
        btn2.disabled = true;
      } else {
        btn2.textContent = t('skins.equip');
        btn2.addEventListener('click', async () => {
          if (state.busy) return;
          state.busy = true;
          btn2.textContent = 'Loading…';
          try {
            await champion.swapSkin(assetBase + skin.glb, skin.id);
            state.current = skin.id;
            saveSkin(skin.id);
            onSwap && onSwap(skin);
          } catch (e) {
            console.warn('skin swap failed:', skin.id, e);
          } finally {
            state.busy = false;
            render();
          }
        });
      }
      card.append(name, btn2);
      list.appendChild(card);
    }
  }

  // ---- Accessories tab (modular slots) ----
  function equip(item) {
    if (champion.equipAccessory(item)) {
      state.equipped[item.slot] = item.id;
      saveEquipped(state.equipped);
      renderAccessories();
    }
  }
  function unequip(slot) {
    champion.unequipAccessory(slot);
    delete state.equipped[slot];
    saveEquipped(state.equipped);
    renderAccessories();
  }

  function renderAccessories() {
    accList.innerHTML = '';
    for (const slot of ACC_SLOTS) {
      const items = accessoriesForSlot(slot.id);
      if (!items.length) continue;

      const slotHeader = document.createElement('div');
      slotHeader.className = 'acc-slot-title';
      slotHeader.textContent = `${slot.icon} ${slot.label}`;
      accList.appendChild(slotHeader);

      for (const item of items) {
        const isOn = state.equipped[slot.id] === item.id;
        const card = document.createElement('div');
        card.className = 'skin-card acc-card' + (isOn ? ' equipped' : '');
        const name = document.createElement('div');
        name.className = 'skin-name';
        name.textContent = item.name;
        const btn2 = document.createElement('button');
        btn2.className = 'skin-equip';
        if (isOn) {
          btn2.textContent = t('skins.on');
          btn2.addEventListener('click', () => unequip(slot.id));
        } else {
          btn2.textContent = t('skins.wear');
          btn2.addEventListener('click', () => equip(item));
        }
        card.append(name, btn2);
        accList.appendChild(card);
      }
    }
    if (!accList.children.length) {
      const empty = document.createElement('div');
      empty.className = 'acc-empty';
      empty.textContent = t('skins.empty');
      accList.appendChild(empty);
    }
  }

  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
    btn.classList.toggle('active');
  });

  // Re-localize the sidebar when the app-wide language changes.
  window.addEventListener('i18n:change', () => {
    tabs.querySelectorAll('.skin-tab').forEach((tb) => {
      tb.textContent = tb.dataset.tab === 'presets' ? t('skins.presets') : t('skins.accessories');
    });
    render();
    if (accList && !accList.classList.contains('hidden')) renderAccessories();
  });

  // Restore persisted accessories on load.
  for (const [slot, id] of Object.entries(state.equipped)) {
    const item = getAccessory(id);
    if (item && item.slot === slot) champion.equipAccessory(item);
  }

  // Restore persisted skin (if it differs from the default already loaded).
  if (state.current !== 'bunny' && champion.skinId !== state.current) {
    const skin = SKINS.find(s => s.id === state.current);
    if (skin) {
      champion.swapSkin(assetBase + skin.glb, skin.id).catch(e => console.warn('saved skin restore failed:', e));
    } else if (state.current === CUSTOM_SKIN_ID && state.custom) {
      champion.swapSkin(state.custom.url, CUSTOM_SKIN_ID).catch(e => console.warn('custom skin restore failed:', e));
    }
  }

  render();
  return state;
}
