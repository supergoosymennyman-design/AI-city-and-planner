/** Session-only Explore / Decorate UI and one-major-panel ownership. */
export function mountFocusedCityUI({ propLibrary, myWork, onModeChange = () => {} } = {}) {
  let mode = 'explore';
  let lastModeButton = null;
  const root = document.body;
  const buttons = [...document.querySelectorAll('[data-city-mode]')];
  const minimap = () => document.getElementById('minimap');

  function closePanel(name) {
    if (name !== 'library') propLibrary?.close?.();
    if (name !== 'my-work') myWork?.close?.();
    if (name !== 'buddy') window.dispatchEvent(new Event('buddy:minimise'));
    if (name !== 'skin') {
      const skin = document.getElementById('skin-panel');
      skin?.classList.remove('open');
      skin?.setAttribute('aria-hidden','true');
      document.getElementById('skin-toggle')?.setAttribute('aria-expanded','false');
    }
    if (name !== 'plan') document.getElementById('plan-modal')?.classList.add('hidden');
    document.getElementById('city-more')?.removeAttribute('open');
  }

  function setMode(next, { openLibrary = true } = {}) {
    if (!['explore','decorate'].includes(next)) return;
    mode = next;
    root.dataset.cityMode = next;
    buttons.forEach(button => {
      const active = button.dataset.cityMode === next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    closePanel(next === 'decorate' && openLibrary ? 'library' : null);
    if (next === 'decorate' && openLibrary) propLibrary?.open?.();
    else propLibrary?.close?.();
    onModeChange(next);
    window.dispatchEvent(new CustomEvent('city:mode-change',{detail:{mode:next}}));
  }

  buttons.forEach(button => button.addEventListener('click',()=>{
    lastModeButton=button;
    setMode(button.dataset.cityMode);
  }));

  const onPanelOpen = event => {
    const panel=event.detail?.panel;
    closePanel(panel);
    root.classList.add('major-panel-open');
    minimap()?.setAttribute('aria-hidden','true');
  };
  const onPanelClose = () => {
    queueMicrotask(()=>{
      const anyOpen=propLibrary?.isOpen?.()||myWork?.isOpen?.()||!document.querySelector('.bw-panel')?.hidden||document.getElementById('skin-panel')?.classList.contains('open');
      root.classList.toggle('major-panel-open',!!anyOpen);
      minimap()?.setAttribute('aria-hidden',String(!!anyOpen));
    });
  };
  window.addEventListener('city:panel-open',onPanelOpen);
  window.addEventListener('city:panel-close',onPanelClose);

  document.getElementById('more-home')?.addEventListener('click',()=>document.getElementById('btn-home')?.click());
  document.getElementById('more-camera')?.addEventListener('click',()=>document.getElementById('orbit-toggle')?.click());
  document.getElementById('more-hub')?.addEventListener('click',()=>document.getElementById('btn-hub')?.click());
  document.getElementById('more-drive')?.addEventListener('click',()=>document.getElementById('btn-drive')?.click());
  // Time is a scene control rather than secondary navigation. Keep its
  // established one-tap button on the canvas so the four moods stay
  // discoverable and keyboard/touch users do not need to open a menu first.

  const onKey = event => {
    if (event.key !== 'Escape') return;
    if (propLibrary?.isOpen?.() || myWork?.isOpen?.()) {
      closePanel(null); onPanelClose(); lastModeButton?.focus?.(); return;
    }
    if (mode === 'decorate') setMode('explore');
  };
  document.addEventListener('keydown',onKey);
  setMode('explore',{openLibrary:false});
  return {
    get mode(){return mode;}, setMode,
    dispose(){document.removeEventListener('keydown',onKey);window.removeEventListener('city:panel-open',onPanelOpen);window.removeEventListener('city:panel-close',onPanelClose);delete root.dataset.cityMode;}
  };
}
