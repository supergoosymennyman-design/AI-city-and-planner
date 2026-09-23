(function () {
  'use strict';
  // Classic local scripts work over file://. Decode one 32-image chunk at a time; no ML runtime,
  // camera permission or eager image decoding. Raw buffers are released after registration.
  const L = window.WorkshopModelLibrary;
  window.WorkshopLibraryChunks = {};
  const pending = new Map();
  function chunk(index, wanted) {
    if (pending.has(index)) return pending.get(index);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('Photo features did not load. Try again.')), 15000);
      let done = false;
      function finish(error) { if (done) return; done = true; clearTimeout(timer); script.remove(); if (error) reject(error); else resolve(); }
      script.src = 'assets/library/features-' + String(index).padStart(3, '0') + '.js';
      script.onerror = () => finish(new Error('Photo features are missing. Restore the library assets and try again.'));
      script.onload = () => {
        try {
          const raw = atob(window.WorkshopLibraryChunks[index]);
          delete window.WorkshopLibraryChunks[index];
          const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          const view = new DataView(bytes.buffer);
          const selected = L.rows('trashnet-v1').filter((r) => r.chunk === index);
          if (bytes.length !== selected.length * 1024 * 4) throw new Error('Damaged photo features.');
          for (const r of selected.filter(r => wanted.has(r.id))) {
            const values = Array.from({length:1024}, (_, i) => view.getFloat32((r.offset*1024+i)*4, true));
            L.register(r.id, values);
          }
          finish();
        } catch (e) { finish(e); }
      };
      document.head.appendChild(script);
    });
    pending.set(index, promise);
    promise.then(() => pending.delete(index), () => pending.delete(index));
    return promise;
  }
  /** A stopped job never commits a partial selection; the caller owns the final atomic swap. */
  async function load(id, selected, job, progress) {
    if (id === 'iris-v1') return;
    const chunks = [...new Set(selected.map((r) => r.chunk))];
    for (let i = 0; i < chunks.length; i++) {
      if (job.stop) throw new Error('Loading stopped. Your previous data and model are unchanged.');
      const needed = selected.filter(r => r.chunk === chunks[i]);
      // Concurrent callers can want different rows of one chunk. Wait for the active decode,
      // then fetch its browser-cached script again only if our own rows are still missing.
      while (!L.ready(id,needed)) {
        if (job.stop) throw new Error('Loading stopped. Your previous data and model are unchanged.');
        try { await Promise.race([chunk(chunks[i],new Set(needed.map(r=>r.id))), new Promise((_, reject) => {
          job.cancel = () => reject(new Error('Loading stopped. Your previous data and model are unchanged.'));
        })]); } finally { delete job.cancel; }
      }
      if (progress) progress(i+1, chunks.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (job.stop) throw new Error('Loading stopped. Your previous data and model are unchanged.');
  }
  const thumbs = new Map();
  /**
   * The catalogue picture for a 'library:<id>' handle once it has decoded, else null.
   * `onReady(img)` (optional) is called once when a picture that was not ready finishes loading,
   * so a caller can copy it into its own small canvas instead of asking again and again: this
   * cache keeps only a small window of decoded pictures, and a shelf of filed photos is larger.
   */
  function thumbnail(handle, onReady) {
    if (typeof handle !== 'string' || !handle.startsWith('library:')) return null;
    const id = handle.slice(8);
    const row = L.refRow({ dataset: 'trashnet-v1', id });
    if (!row) return null;
    if (!thumbs.has(id)) {
      const img = new Image(); img.src = row.src; thumbs.set(id, img);
      // Only a small visible window of source pictures lives decoded at once.
      if (thumbs.size > 48) thumbs.delete(thumbs.keys().next().value);
    }
    const img = thumbs.get(id);
    if (img.complete && img.naturalWidth) return img;
    if (typeof onReady === 'function') img.addEventListener('load', () => { if (img.naturalWidth) onReady(img); }, { once: true });
    return null;
  }
  window.WorkshopLibraryLoader = { load, thumbnail };
})();
