/**
 * SpeechManager — Web Speech STT (listenOnce) + TTS (speak). Crash-proof: always settles.
 * Globals: window.SpeechManager. CommonJS-exported for node --test (inject _RecognitionCtor).
 */
(function () {
  function pickRecognition() {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function SpeechManager() { this._RecognitionCtor = pickRecognition(); }

  SpeechManager.prototype.probe = function () {
    return {
      listen: !!this._RecognitionCtor,
      speak: typeof window !== 'undefined' && 'speechSynthesis' in window,
    };
  };

  SpeechManager.prototype.listenOnce = function (opts) {
    opts = opts || {};
    var Ctor = this._RecognitionCtor;
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 6000;
    // opts.signal (AbortSignal): aborting STOPS the open recognition, so the caller can shut the mic
    // the instant the AI starts speaking — otherwise an already-open listen window keeps hearing the
    // AI's own TTS (a feedback loop). micPaused only blocks the NEXT arm, never the in-flight one.
    var signal = opts.signal || null;
    return new Promise(function (resolve) {
      if (!Ctor) return resolve(null);
      if (signal && signal.aborted) return resolve(null); // already cancelled — never open the mic
      var done = false, rec = null, onAbort = null;
      var finish = function (r) {
        if (done) return; done = true; clearTimeout(timer);
        if (signal && onAbort) { try { signal.removeEventListener('abort', onAbort); } catch (e) {} }
        // Detach handlers BEFORE stopping so a stop/abort-triggered 'aborted' error or onend can't
        // reach opts.onError — that would look like a device failure and wrongly demote the mic.
        if (rec) { rec.onresult = rec.onerror = rec.onend = null; try { (rec.abort || rec.stop).call(rec); } catch (e) {} }
        resolve(r);
      };
      var timer = setTimeout(function () { finish(null); }, timeoutMs);
      if (signal) { onAbort = function () { finish(null); }; try { signal.addEventListener('abort', onAbort); } catch (e) {} }
      try {
        rec = new Ctor();
        rec.lang = opts.lang || 'en-US';
        rec.interimResults = false; rec.maxAlternatives = 1;
        rec.onresult = function (e) {
          finish(e && e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : null);
        };
        rec.onerror = function (e) {
          try { if (e && e.error && opts.onError) opts.onError(e.error); } catch (x) {}
          finish(null);
        };
        rec.onend = function () { finish(null); };
        rec.start();
      } catch (e) { finish(null); }
    });
  };

  SpeechManager.prototype.speak = function (text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      try {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return resolve();
        if (opts.interrupt !== false) window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.9;
        u.onend = function () { resolve(); };
        u.onerror = function () { resolve(); };
        window.speechSynthesis.speak(u);
      } catch (e) { resolve(); }
    });
  };

  /** Whether this device can actually voice text — the Speaker's honest-face check. */
  SpeechManager.prototype.canSpeak = function () {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  };

  if (typeof window !== 'undefined') window.SpeechManager = SpeechManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = { SpeechManager: SpeechManager };
})();
