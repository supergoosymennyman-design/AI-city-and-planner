import { attachArchiveAsset, createProjectStore, importProjectEnvelope } from './project-store.js';
import { loadCustomSkinBlob, loadCustomSkinMetadata, saveCustomSkin } from '../champion-city/custom-skin.js';

export async function mountProjectBar({ workspace = 'city' } = {}) {
  const store = createProjectStore(); const project = await store.openActiveProject();
  const bar = document.createElement('nav'); bar.className = 'passiona-project-bar'; bar.setAttribute('aria-label', 'My Passiona project');
  const routes = { planner: '../planner/', city: '../city-builder/', studio: '../studio/', workshop: '../workshop/' };
  bar.innerHTML = `<strong class="project-name">${escapeHtml(project.name)}</strong><span class="project-context">${workspace[0].toUpperCase() + workspace.slice(1)}</span><span class="project-save" aria-live="polite">Saved on this device</span><span class="project-links">${Object.entries(routes).map(([key, href]) => `<a${key === workspace ? ' aria-current="page"' : ''} href="${href}">${key[0].toUpperCase() + key.slice(1)}</a>`).join('')}</span><button type="button" class="project-download">Download project</button><label class="project-upload">Open project<input type="file" accept=".passiona,application/json" hidden></label>`;
  bar.querySelector('.project-download').addEventListener('click', async () => {
    const result = await store.exportProject(); if (!result.ok) return;
    const [champion, metadata] = await Promise.all([loadCustomSkinBlob(), loadCustomSkinMetadata()]);
    if (champion) attachArchiveAsset(result.archive, { bytes: await champion.arrayBuffer(), role: 'champion-glb', name: 'champion.glb' });
    if (metadata) result.archive.manifest.champion = metadata;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(result.archive)], { type: 'application/json' })); a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'my-passiona-project'}.passiona`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  bar.querySelector('.project-upload input').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const archive = JSON.parse(await file.text());
      const parsed = importProjectEnvelope(archive);
      if (!parsed.ok) throw new Error(parsed.error);
      const restored = await store.importProject(archive);
      if (!restored.ok) throw new Error(restored.error || 'The project could not be saved.');
      const champion = Object.values(parsed.assets || {}).find(asset => asset.role === 'champion-glb');
      if (champion) await saveCustomSkin(new Blob([champion.bytes], { type: champion.mediaType }), archive.manifest?.champion || null);
      location.reload();
    } catch (error) { bar.querySelector('.project-save').textContent = error?.message || 'That project could not be opened.'; }
  });
  document.body.prepend(bar); return store;
}
function escapeHtml(value) { const d = document.createElement('div'); d.textContent = value; return d.innerHTML; }
