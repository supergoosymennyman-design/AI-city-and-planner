/**
 * transcript.js — Conversation history storage for K3-03 AI Architect
 *
 * Stores child→AI message pairs in memory with optional timestamp.
 * Provides methods to add entries, retrieve history, and render drawer.
 */

var GameTranscript = (() => {
  'use strict';

  /** @type {Array<{role: string, text: string, timestamp: number}>} */
  let entries = [];
  const MAX_ENTRIES = 200;
  let onUpdate = null;

  /**
   * Add an entry to the transcript.
   * @param {string} role - 'child' or 'ai'
   * @param {string} text - The message text
   */
  function add(role, text) {
    if (!text || text.trim().length === 0) return;
    entries.push({
      role,
      text: text.trim(),
      timestamp: Date.now()
    });
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(-MAX_ENTRIES);
    }
    if (onUpdate) onUpdate(getAll());
  }

  /**
   * Get all transcript entries.
   */
  function getAll(includeTimestamps = false) {
    if (includeTimestamps) {
      return entries.map(e => ({ ...e }));
    }
    return entries.map(e => ({ role: e.role, text: e.text }));
  }

  /**
   * Get the transcript formatted as a display string.
   */
  function getFormatted() {
    return entries.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const label = e.role === 'child' ? 'You' : 'Botly';
      return `[${time}] ${label}: ${e.text}`;
    }).join('\n');
  }

  /**
   * Get the last N entries.
   */
  function getLast(n = 5) {
    return entries.slice(-n);
  }

  /**
   * Get entry count.
   */
  function count() {
    return entries.length;
  }

  /**
   * Clear all entries.
   */
  function clear() {
    entries = [];
    if (onUpdate) onUpdate(getAll());
  }

  /**
   * Register callback for updates.
   */
  function onChange(callback) {
    onUpdate = callback;
  }

  /**
   * Render the transcript drawer.
   * @param {HTMLElement} container
   */
  function renderDrawer(container) {
    const drawer = document.createElement('div');
    drawer.id = 'transcript-drawer';
    drawer.className = 'transcript-drawer';
    drawer.setAttribute('role', 'region');
    drawer.setAttribute('aria-label', 'Conversation transcript');
    drawer.style.display = 'none';
    drawer.innerHTML = `
      <div class="transcript-header">
        <h2>Conversation</h2>
        <button class="transcript-close-btn" aria-label="Close transcript">&times;</button>
      </div>
      <div class="transcript-list" role="log" aria-live="polite">
        <p class="transcript-empty">No conversation yet.</p>
      </div>
      <div class="transcript-footer">
        <button class="transcript-clear-btn" aria-label="Clear conversation history">Clear</button>
      </div>
    `;
    container.appendChild(drawer);

    const list = drawer.querySelector('.transcript-list');
    const closeBtn = drawer.querySelector('.transcript-close-btn');
    const clearBtn = drawer.querySelector('.transcript-clear-btn');

    closeBtn.addEventListener('click', hide);
    clearBtn.addEventListener('click', () => {
      clear();
      renderList(list);
    });

    onUpdate = () => { renderList(list); };

    return drawer;
  }

  function renderList(listEl) {
    if (entries.length === 0) {
      listEl.innerHTML = '<p class="transcript-empty">No conversation yet.</p>';
      return;
    }
    listEl.innerHTML = entries.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const cls = e.role === 'child' ? 'transcript-child' : 'transcript-ai';
      const label = e.role === 'child' ? 'You' : 'Botly';
      return `<div class="transcript-entry ${cls}">
        <span class="transcript-time">${time}</span>
        <span class="transcript-label">${label}:</span>
        <span class="transcript-text">${escapeHtml(e.text)}</span>
      </div>`;
    }).join('');
    listEl.scrollTop = listEl.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Show the transcript drawer.
   */
  function show() {
    const drawer = document.getElementById('transcript-drawer');
    if (drawer) {
      drawer.style.display = 'flex';
      const list = drawer.querySelector('.transcript-list');
      if (list) renderList(list);
    }
  }

  /**
   * Hide the transcript drawer.
   */
  function hide() {
    const drawer = document.getElementById('transcript-drawer');
    if (drawer) drawer.style.display = 'none';
  }

  return {
    add,
    getAll,
    getFormatted,
    getLast,
    count,
    clear,
    onChange,
    renderDrawer,
    show,
    hide
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameTranscript };
}
