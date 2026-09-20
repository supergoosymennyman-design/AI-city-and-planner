/**
 * nova-comic.js — Nova's opening comic intro (Level 0)
 *
 * 5-panel story in Nova's voice: arrives at data center,
 * learns about real people who need help, the two pricing levers,
 * City Council's challenge, and asks the player to be her teacher.
 * Each panel is spoken aloud via TTS. Tap to advance.
 */
const NovaComic = (() => {
  'use strict';

/** Pre-warm speechSynthesis engine */
function warmSpeech() {
  if (!window.speechSynthesis) return;
  // Some browsers need an early getVoices() call to initialise
  window.speechSynthesis.getVoices();
}

/** Speak a line of Nova dialogue via TTS */
function speakLine(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85; u.volume = 0.85;
  var voices = window.speechSynthesis.getVoices();
  var v = voices.find(function(v){return v.name.includes('Google UK')||v.name.includes('Samantha')||v.name.includes('Female')}) || null;
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

/** Track whether user has interacted (tapped) yet */
var _hasInteracted = false;

  let currentPanel = 0;
  let overlayEl = null;
  let panelEl = null;
  let onComplete = null;
  /* Track whether panel 0's audio has been started (for 2-click pattern) */
  let _panel0Spoken = false;

  const PANELS = [
    {
      art: '🏢',
      title: 'Nova\'s First Day',
      text: 'Hi! I\'m Nova. It\'s my first day at the City Data Center.',
      subtext: 'I just sat down at my new desk. Parks, hospitals, schools — everyone sends their files through here. I really hope I don\'t mess up...',
      tts: 'Hi! I am Nova. It is my first day at the City Data Center. I just sat down at my new desk. Parks, hospitals, schools — everyone sends their files through here. I really hope I do not mess up!',
      color: '#7C8BFF',
    },
    {
      art: '👥',
      title: 'Real People Need Help',
      text: 'Every file comes from someone real in the city.',
      subtext: '🏗️ A playground to build. 🏥 A doctor with test results. 🧁 A bakery to run. Real people, real needs — and they all need me to price their files correctly!',
      tts: 'Every file comes from a real person in the city! A playground that needs building. A doctor waiting for test results. A bakery that needs to run. Real people, real needs — and they all need me to price their files correctly!',
      color: '#FFB74D',
    },
    {
      art: '🎚️',
      title: 'The Two Levers',
      text: 'We have two levers to set the right price:',
      subtext: '📄 Page Lever: more pages = higher price. 💾 RAM Lever: more complex = higher price. Charge too little? Server crashes! Charge too much? Not fair on small businesses!',
      tts: 'We have two levers to set the right price! The Page Lever: more pages means a higher price. The RAM Lever: more complex files cost more to process. Charge too little? The server overheats and crashes! Charge too much? That is not fair to small businesses!',
      color: '#8899FF',
    },
    {
      art: '🏛️',
      title: 'The City Council',
      text: '"Nova — we\'re giving you ONE WEEK to prove yourself."',
      subtext: '"Price files fairly. Keep the server running. Help everyone. Or we outsource to a big corporation that overcharges everyone." The Council is watching!',
      tts: 'Then the City Council spoke to me. Nova! We are giving you one week to prove yourself. Price files fairly. Keep the server running. Help everyone who comes to you. Or we outsource to a big corporation that overcharges everyone. The Council is watching me!',
      color: '#FF7043',
    },
    {
      art: '🌟',
      title: 'You. Yes, You!',
      text: 'I\'ve never done this before. But YOU can teach me!',
      subtext: 'Every level = one more day. Each lesson = I learn more. By Day 6, I\'ll show the Council what we can do together. Ready to be my teacher? 🚀',
      tip: 'Start Day 1!',
      tts: 'I have never done this before. But YOU can teach me! Every level is one more day of learning. By Day Six, I will show the Council what we can do together. Ready to be my teacher? Let us go!',
      color: '#4CAF50',
    },
  ];

  function init() {
    overlayEl = document.getElementById('comic-intro');
    panelEl = document.getElementById('comic-panel-0');
  }

  function show(callback) {
    if (!overlayEl || !panelEl) return;
    onComplete = callback || null;
    currentPanel = 0;
    _panel0Spoken = false;
    if (window.NovaSVG) NovaSVG.setExpression('nervous');
    renderPanel();
    overlayEl.classList.add('show');
    // Pre-warm speechSynthesis so it's ready on first tap
    warmSpeech();
  }

  function renderPanel() {
    if (currentPanel >= PANELS.length) {
      finish();
      return;
    }
    const panel = PANELS[currentPanel];
    const total = PANELS.length;
    const isLast = currentPanel === total - 1;
    const tipHtml = panel.tip ? '<div class="comic-tip">' + panel.tip + '</div>' : '';
    const subHtml = panel.subtext ? '<div class="comic-subtext">' + panel.subtext + '</div>' : '';

    panelEl.innerHTML =
      '<div class="comic-panel-inner" style="--panel-color:' + panel.color + '">' +
      '<div class="comic-art">' + panel.art + '</div>' +
      '<div class="comic-title">' + panel.title + '</div>' +
      '<div class="comic-text">' + panel.text + '</div>' +
      subHtml + tipHtml +
      '<div class="comic-progress">' +
      '<div class="comic-dots">' +
      Array.from({ length: total }, (_, i) =>
        '<span class="comic-dot' + (i < currentPanel ? ' done' : '') + (i === currentPanel ? ' current' : '') + '"></span>'
      ).join('') +
      '</div>' +
      '<span class="comic-tap">' + (isLast ? 'Teach Nova! 🚀' : 'Tap to continue →') + '</span>' +
      '</div>' +
      '</div>';

    // (Speech is triggered by handleClick on tap, not here)
  }

  function next() {
    // Don't cancel speech — let it play out
    currentPanel++;
    if (currentPanel >= PANELS.length) {
      finish();
    } else {
      if (window.NovaSVG) {
        const expressions = ['nervous', 'curious', 'curious', 'thinking', 'excited'];
        NovaSVG.setExpression(expressions[currentPanel] || 'curious');
      }
      renderPanel();
    }
  }

  function finish() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (overlayEl) overlayEl.classList.remove('show');
    if (window.NovaSVG) NovaSVG.setExpression('confident');
    if (onComplete) setTimeout(onComplete, 200);
  }

  function handleClick() {
    if (!overlayEl || !overlayEl.classList.contains('show')) return;
    // First page (panel 0): first click plays audio, second click advances
    if (currentPanel === 0 && !_panel0Spoken) {
      _panel0Spoken = true;
      var panel = PANELS[0];
      if (panel && panel.tts) speakLine(panel.tts);
      return;
    }
    // Speak current panel, then advance so next panel is visible while audio plays
    var panel = PANELS[currentPanel];
    if (!_hasInteracted) _hasInteracted = true;
    if (panel && panel.tts) speakLine(panel.tts);
    next();
  }

  const api = { init, show, next, finish, handleClick };
  window.NovaComic = api;
  return api;
})();
