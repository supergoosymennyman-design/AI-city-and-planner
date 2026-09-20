/* =========================================================================
   transcript.js — conversation history store + drawer rendering.
   Holds child <-> Flux message pairs for the session (in-memory, no PII sent).
   ========================================================================= */
const Transcript = (() => {
  'use strict';

  const messages = [];       // { who: 'child'|'flux', text, time }
  let listEl = null;

  function bind() {
    listEl = document.getElementById('transcriptList');
    render();
  }

  function add(who, text) {
    if (!text) return;
    messages.push({ who, text, time: Date.now() });
    render();
  }

  function render() {
    if (!listEl) return;
    if (messages.length === 0) {
      listEl.innerHTML = '<p class="drawer-empty">No conversation yet. Say “Flux” or type below to chat.</p>';
      return;
    }
    listEl.innerHTML = '';
    messages.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'msg ' + (m.who === 'child' ? 'child' : 'flux');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = m.who === 'child' ? 'You' : '🤖 Flux';
      const body = document.createElement('span');
      body.textContent = m.text;
      div.appendChild(who);
      div.appendChild(body);
      listEl.appendChild(div);
    });
    listEl.scrollTop = listEl.scrollHeight;
  }

  function clear() {
    messages.length = 0;
    render();
  }

  return { bind, add, clear, render, get count() { return messages.length; } };
})();
