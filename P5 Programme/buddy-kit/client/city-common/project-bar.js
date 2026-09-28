import { downloadProject, restoreProjectBackup, switchWorkspaceProject, captureProject } from './backup-coordinator.js';
import { createProjectStore } from './project-store.js';

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
      try { await switchWorkspaceProject(store, select.value); location.reload(); }
      catch (error) { select.value = project.id; note(error.message); }
    });
  } catch { select.remove(); }
  bar.querySelector('.project-copy').addEventListener('click', async () => {
    try {
      await captureProject(store);
      const result = await store.copyProject(project.id, `${project.name} copy`);
      if (!result.ok) throw Error(result.error || 'That project could not be copied.');
      await switchWorkspaceProject(store, result.project.id);
      location.reload();
    } catch (error) { note(error.message); }
  });
  bar.querySelector('.project-download').addEventListener('click', async () => {
    try { await downloadProject({ store }); note('Complete project downloaded / 已下載完整專案'); }
    catch (error) { note(error.message); }
  });
  bar.querySelector('.project-upload input').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const archive = JSON.parse(await file.text());
      await restoreProjectBackup(archive, { store });
      location.reload();
    } catch (error) { bar.querySelector('.project-save').textContent = error?.message || 'That project could not be opened.'; }
  });
  document.body.prepend(bar); return store;
}
function escapeHtml(value) { const d = document.createElement('div'); d.textContent = value; return d.innerHTML; }
