import { attachArchiveAsset, createProjectStore, importProjectEnvelope } from './project-store.js';
import { loadCustomSkinBlob, loadCustomSkinMetadata, saveCustomSkin } from '../champion-city/custom-skin.js';

export async function mountProjectBar({ workspace = 'city' } = {}) {
  const store = createProjectStore(); const project = await store.openActiveProject();
  const bar = document.createElement('nav'); bar.className = 'passiona-project-bar'; bar.setAttribute('aria-label', 'My Passiona project');
  const routes = [
    ['hub', '../hub/', 'Hub'],
    ['academy', '../pregame/', 'Academy'],
    ['planner', '../planner/', 'Planner'],
    ['city', '../city-builder/', 'City'],
    ['market', '../market/', 'Market'],
    ['studio', '../studio/', 'Studio'],
    ['workshop', '../workshop/', 'Workshop'],
  ];
  const context = routes.find(([key]) => key === workspace)?.[2] || workspace;
  bar.innerHTML = `<strong class="project-name">${escapeHtml(project.name)}</strong><span class="project-context">${escapeHtml(context)}</span><span class="project-save" aria-live="polite">Saved on this device</span><span class="project-links">${routes.map(([key, href, label]) => `<a${key === workspace ? ' aria-current="page"' : ''} href="${href}">${label}</a>`).join('')}</span><select class="project-switch" aria-label="Switch project"></select><button type="button" class="project-copy">Copy project</button><button type="button" class="project-download">Download project</button><label class="project-upload">Open project<input type="file" accept=".passiona,application/json" hidden></label>`;

  // Project switching: swaps the COMPLETE wallet and progress. Copy carries the
  // same claimed rewards, so it can never re-earn them (plan §2).
  const select = bar.querySelector('.project-switch');
  const note = (message) => { bar.querySelector('.project-save').textContent = message; };
  try {
    const projects = await store.listProjects();
    select.innerHTML = projects.map((p) => `<option value="${escapeHtml(p.id)}"${p.active ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    select.addEventListener('change', async () => {
      const result = await store.switchProject(select.value);
      if (result.ok) location.reload();
      else note(result.error || 'That project could not be opened.');
    });
  } catch { select.remove(); }
  bar.querySelector('.project-copy').addEventListener('click', async () => {
    const result = await store.copyProject(project.id, `${project.name} copy`);
    if (!result.ok) { note(result.error || 'That project could not be copied.'); return; }
    await store.switchProject(result.project.id);
    location.reload();
  });
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
