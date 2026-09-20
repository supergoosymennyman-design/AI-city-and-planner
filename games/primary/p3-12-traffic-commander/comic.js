/* comic.js — lightweight cinematic intro for the AI City mini-games.
 *
 * A 3-panel tappable comic that sets the world before gameplay: art emoji,
 * title, main text, optional subtext, a TTS line, and an accent color.
 * Fully self-contained — injects its own styles, needs no edits to a game's
 * CSS. Usage:
 *
 *   window.COMIC_PANELS = [ {art,title,text,subtext,tts,color}, x3 ];
 *   ComicIntro.play(window.COMIC_PANELS, function(){ startGame(); });
 *
 * Panel flow: tap anywhere to speak the next panel / advance. After the last
 * panel, tap to call onComplete(). TTS is polite — a player who taps quickly
 * is never blocked by audio.
 */
(function () {
  'use strict';

  var STYLE = '' +
    '.comic-overlay{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;' +
    '  background:linear-gradient(160deg,rgba(8,12,22,0.96),rgba(13,20,38,0.96));cursor:pointer;-webkit-user-select:none;user-select:none;}' +
    '.comic-panel{width:min(480px,90vw);text-align:center;padding:30px 26px;border-radius:22px;' +
    '  background:rgba(20,30,52,0.9);border:2px solid var(--comic-color,#22C55E);box-shadow:0 0 60px color-mix(in srgb,var(--comic-color,#22C55E) 35%,transparent);' +
    '  animation:comic-in 0.45s ease;}' +
    '@keyframes comic-in{from{opacity:0;transform:scale(0.92) translateY(12px);}to{opacity:1;transform:none;}}' +
    '.comic-art{font-size:74px;line-height:1;margin-bottom:14px;filter:drop-shadow(0 4px 18px rgba(0,0,0,0.5));}' +
    '.comic-title{font-size:22px;font-weight:900;letter-spacing:0.5px;margin-bottom:12px;color:var(--comic-color,#fff);}' +
    '.comic-text{font-size:17px;font-weight:700;line-height:1.45;margin-bottom:8px;color:#eaf2f8;}' +
    '.comic-sub{font-size:14px;line-height:1.55;color:#9fb0c7;}' +
    '.comic-dots{display:flex;gap:8px;justify-content:center;margin-top:18px;}' +
    '.comic-dot{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,0.18);transition:background 0.2s;}' +
    '.comic-dot.on{background:var(--comic-color,#22C55E);}' +
    '.comic-tap{margin-top:16px;font-size:12px;letter-spacing:1px;color:rgba(255,255,255,0.45);text-transform:uppercase;}';

  function injectStyle() {
    var s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85; u.volume = 0.85;
    var voices = window.speechSynthesis.getVoices();
    var v = voices.find(function (x) {
      return /Google UK|Samantha|Female|Karen|Moira|Tessa/i.test(x.name);
    }) || null;
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }

  /**
   * Play a comic intro.
   * @param {Array} panels - [{art,title,text,subtext,tts,color}]
   * @param {Function} onComplete - called after the last panel is tapped
   */
  function play(panels, onComplete) {
    injectStyle();
    if (!panels || !panels.length) { if (onComplete) onComplete(); return; }

    var idx = 0;
    var overlay = document.createElement('div');
    overlay.className = 'comic-overlay';
    overlay.setAttribute('aria-label', 'Story intro — tap to continue');

    var panelEl = document.createElement('div');
    panelEl.className = 'comic-panel';
    overlay.appendChild(panelEl);

    function render(i) {
      var p = panels[i];
      panelEl.style.setProperty('--comic-color', p.color || '#22C55E');
      var dots = panels.map(function (_, d) {
        return '<span class="comic-dot' + (d === i ? ' on' : '') + '"></span>';
      }).join('');
      panelEl.innerHTML =
        '<div class="comic-art">' + (p.art || '🤖') + '</div>' +
        '<div class="comic-title">' + p.title + '</div>' +
        '<div class="comic-text">' + p.text + '</div>' +
        (p.subtext ? '<div class="comic-sub">' + p.subtext + '</div>' : '') +
        '<div class="comic-dots">' + dots + '</div>' +
        '<div class="comic-tap">Tap to continue ▸</div>';
      if (p.tts) speak(p.tts);
    }

    overlay.addEventListener('pointerdown', function () {
      if (idx < panels.length - 1) {
        idx++;
        render(idx);
      } else {
        window.speechSynthesis && window.speechSynthesis.cancel();
        overlay.remove();
        if (onComplete) onComplete();
      }
    });

    render(0);
    document.body.appendChild(overlay);
  }

  window.ComicIntro = { play: play };
})();
