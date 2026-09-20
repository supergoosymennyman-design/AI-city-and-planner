/* spark.js — Spark, the AI grid companion for Cool Grid Architect.
 *
 * A lightweight AI character: an SVG lightning-bot with a speech bubble and a
 * state badge (🟡 Learning → 🟢 Confident → ⭐ Expert). Spark comments on the
 * player's grid placements and reacts to level outcomes. TTS is optional and
 * polite — the speech bubble always shows the line as text.
 *
 * Self-contained: injects its own styles, needs no edits to a game's CSS.
 * Usage:  Spark.say('Ooh, that mountain keeps me cool!')
 *         Spark.setState('confident')   // 'learning' | 'confident' | 'expert'
 */
(function () {
  'use strict';

  var STYLE = '' +
    '#spark{position:fixed;left:16px;bottom:16px;z-index:400;display:flex;align-items:flex-end;gap:10px;' +
    '  -webkit-user-select:none;user-select:none;pointer-events:none;max-width:min(340px,78vw);}' +
    '#spark .spark-bubble{background:rgba(15,26,44,0.96);border:2px solid #22C55E;border-radius:14px;' +
    '  padding:10px 14px;font-size:13px;line-height:1.45;color:#eaf2f8;box-shadow:0 6px 24px rgba(0,0,0,0.5);' +
    '  opacity:0;transform:translateY(8px);transition:opacity 0.25s,transform 0.25s;max-width:280px;}' +
    '#spark .spark-bubble.show{opacity:1;transform:none;}' +
    '#spark .spark-bubble .spark-badge{display:inline-block;font-size:10px;font-weight:800;letter-spacing:1px;' +
    '  text-transform:uppercase;border-radius:999px;padding:2px 8px;margin-bottom:6px;color:#0b1220;}' +
    '#spark svg{width:58px;height:58px;flex-shrink:0;filter:drop-shadow(0 4px 14px rgba(34,197,94,0.4));}' +
    '#spark .spark-tail{width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;' +
    '  border-top:10px solid rgba(15,26,44,0.96);margin-bottom:14px;}';

  function injectStyle() {
    var s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  var el = null, bubble = null, badge = null, hideTimer = null;

  var SVG = '' +
    '<svg viewBox="0 0 60 60" aria-hidden="true">' +
    '  <line x1="30" y1="8" x2="30" y2="2" stroke="#F5B301" stroke-width="3" stroke-linecap="round"/>' +
    '  <polygon points="30,1 34,7 26,7" fill="#F5B301"/>' +
    '  <circle cx="30" cy="14" r="4" fill="#F5B301"/>' +
    '  <rect x="12" y="18" width="36" height="30" rx="12" fill="#1E293B" stroke="#334155" stroke-width="2"/>' +
    '  <circle cx="23" cy="31" r="4.5" fill="#22C55E"/>' +
    '  <circle cx="37" cy="31" r="4.5" fill="#22C55E"/>' +
    '  <circle cx="24.5" cy="29.5" r="1.6" fill="#0b1220"/>' +
    '  <circle cx="38.5" cy="29.5" r="1.6" fill="#0b1220"/>' +
    '  <path d="M23 41 Q30 47 37 41" stroke="#22C55E" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '  <rect x="22" y="48" width="4" height="6" rx="2" fill="#334155"/>' +
    '  <rect x="34" y="48" width="4" height="6" rx="2" fill="#334155"/>' +
    '</svg>';

  var STATE = {
    learning: { label: '🟡 Learning', bg: '#F5B301', color: '#0b1220' },
    confident: { label: '🟢 Confident', bg: '#22C55E', color: '#0b1220' },
    expert: { label: '⭐ Expert', bg: '#F59E0B', color: '#0b1220' },
  };

  function mount() {
    injectStyle();
    el = document.createElement('div');
    el.id = 'spark';
    el.innerHTML = '<div class="spark-bubble"><span class="spark-badge">🟡 Learning</span><div class="spark-line"></div></div>' + SVG;
    document.body.appendChild(el);
    bubble = el.querySelector('.spark-bubble');
    badge = el.querySelector('.spark-badge');
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9; u.volume = 0.8;
    var voices = window.speechSynthesis.getVoices();
    var v = voices.find(function (x) { return /Google UK|Samantha|Female|Karen|Moira/i.test(x.name); }) || null;
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }

  function say(text, opts) {
    opts = opts || {};
    if (!el) mount();
    el.querySelector('.spark-line').textContent = text;
    bubble.classList.add('show');
    if (opts.tts !== false) speak(text);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { bubble.classList.remove('show'); }, opts.hold || 4200);
  }

  function setState(mode) {
    if (!el) mount();
    var s = STATE[mode] || STATE.learning;
    badge.textContent = s.label;
    badge.style.background = s.bg;
    badge.style.color = s.color;
    el.querySelector('svg').style.filter = 'drop-shadow(0 4px 14px ' + s.bg + '66)';
  }

  window.Spark = { say: say, setState: setState, _mount: mount };
})();
