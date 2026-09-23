/**
 * CameraManager — game-owned <video> + getUserMedia. Crash-proof: start() resolves false, never throws.
 * Globals: window.CameraManager. CommonJS-exported for node --test.
 */
(function () {
  function CameraManager() { this._stream = null; this.active = false; }

  CameraManager.prototype.start = async function (videoEl, facingMode) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode || 'user' }, audio: false,
      });
      this._stream = stream;
      videoEl.srcObject = stream;
      videoEl.muted = true; videoEl.playsInline = true;
      try { await videoEl.play(); } catch (e) { /* autoplay may defer; the detect loop tolerates not-ready */ }
      this.active = true;
      return true;
    } catch (e) {
      try { console.warn('[camera] getUserMedia failed:', e && e.name, e && e.message || e); } catch (e2) {}
      this.active = false; return false;
    }
  };

  CameraManager.prototype.stop = function () {
    try { if (this._stream) this._stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    this._stream = null; this.active = false;
  };

  if (typeof window !== 'undefined') window.CameraManager = CameraManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CameraManager: CameraManager };
})();
