/**
 * transcript.js — Conversation history storage & display
 *
 * Toggle-able side drawer showing child ↔ Nova message pairs.
 * Scrollable, newest at bottom, cleared on game reset.
 */
const Transcript = (() => {
  'use strict';

  let entries = [];
  const MAX_ENTRIES = 200;
  let drawerEl = null, listEl = null, toggleBtn = null;

  function init() {
    drawerEl = document.getElementById('transcript-drawer');
    listEl = document.getElementById('transcript-list');
    toggleBtn = document.getElementById('transcript-toggle');

    if (!drawerEl || !listEl) return;

    const closeBtn = drawerEl.querySelector('.drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    if (toggleBtn) toggleBtn.addEventListener('click', toggle);

    // Close drawer on overlay click
    drawerEl.addEventListener('click', (e) => {
      if (e.target === drawerEl) close();
    });
  }

  function addEntry(role, text) {
    if (!text || !text.trim()) return;
    entries.push({
      role,
      text: text.trim(),
      timestamp: Date.now(),
    });
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
    }
    // If drawer is open, render this entry
    if (drawerEl && drawerEl.classList.contains('open')) {
      renderEntry(entries[entries.length - 1]);
    }
  }

  function renderEntry(entry) {
    if (!listEl) return;
    const div = document.createElement('div');
    div.className = 'transcript-entry ' + entry.role;

    const speaker = document.createElement('div');
    speaker.className = 'transcript-speaker';
    speaker.textContent = entry.role === 'child' ? 'You' : 'Nova';
    div.appendChild(speaker);

    const text = document.createElement('div');
    text.className = 'transcript-text';
    text.textContent = entry.text;
    div.appendChild(text);

    listEl.appendChild(div);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function renderAll() {
    if (!listEl) return;
    listEl.innerHTML = '';
    entries.forEach(e => renderEntry(e));
  }

  function toggle() {
    if (!drawerEl) return;
    drawerEl.classList.contains('open') ? close() : open();
  }

  function open() {
    if (!drawerEl) return;
    drawerEl.classList.add('open');
    renderAll();
  }

  function close() {
    if (!drawerEl) return;
    drawerEl.classList.remove('open');
  }

  function getAll() {
    return [...entries];
  }

  function clear() {
    entries = [];
    if (listEl) listEl.innerHTML = '';
  }

  return { init, addEntry, getAll, clear, toggle, open, close };
})();
