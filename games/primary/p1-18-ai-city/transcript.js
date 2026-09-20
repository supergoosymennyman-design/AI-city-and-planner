/**
 * transcript.js — Conversation history storage
 */
const Transcript = (() => {
  'use strict';
  let entries = [];

  function add(who, text) {
    entries.push({ who, text, time: Date.now() });
    render();
  }

  function render() {
    const el = document.getElementById('transcript-list');
    if (!el) return;
    el.innerHTML = entries.map(e =>
      `<div class="t-entry"><span class="who ${e.who}">${e.who === 'nova' ? '🤖 Nova' : '🧑 You'}:</span> ${e.text}</div>`
    ).join('');
    el.scrollTop = el.scrollHeight;
  }

  function getAll() { return [...entries]; }
  function clear() { entries = []; render(); }

  return { add, getAll, clear };
})();
