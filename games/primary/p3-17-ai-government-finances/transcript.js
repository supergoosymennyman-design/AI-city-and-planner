/**
 * transcript.js — Conversation history storage & display
 * Stores child ↔ Nova conversation pairs.
 * Accessible via the 📝 button in the top bar.
 */
const Transcript = (() => {
  'use strict';

  let entries = [];
  const MAX_ENTRIES = 200;

  let drawerEl = null;
  let listEl = null;

  function init() {
    drawerEl = document.getElementById('transcript-drawer');
    listEl = document.getElementById('transcript-list');

    if (!drawerEl || !listEl) return;

    // Close button
    const closeBtn = drawerEl.querySelector('.drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Toggle button in top bar
    const toggleBtn = document.getElementById('transcript-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  }

  function addEntry(role, text) {
    if (!text || !text.trim()) return;
    entries.push({
      role: role,
      text: text.trim(),
      timestamp: Date.now()
    });
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
    }
    // If drawer is open, append the new entry live
    if (drawerEl && drawerEl.classList.contains('open')) {
      renderEntry(entries[entries.length - 1]);
    }
  }

  function renderEntry(entry) {
    if (!listEl) return;
    const div = document.createElement('div');
    div.className = 'transcript-entry ' + entry.role;

    const speaker = document.createElement('div');
    speaker.className = 'speaker';
    speaker.textContent = entry.role === 'child' ? 'You' : 'Nova';

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = entry.text;

    div.appendChild(speaker);
    div.appendChild(text);
    listEl.appendChild(div);

    // Scroll to bottom
    listEl.scrollTop = listEl.scrollHeight;
  }

  function renderAll() {
    if (!listEl) return;
    listEl.innerHTML = '';
    entries.forEach(e => renderEntry(e));
  }

  function toggle() {
    if (!drawerEl) return;
    if (drawerEl.classList.contains('open')) {
      close();
    } else {
      open();
    }
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
