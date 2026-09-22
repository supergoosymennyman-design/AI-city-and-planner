import { createProjectStore } from '../city-common/project-store.js';
(async () => {
  const store = createProjectStore(); const project = await store.openActiveProject();
  document.querySelector('#name').textContent = project.name;
  const state = project.projects.city?.legacyState || {};
  try { const layout = JSON.parse(state.layout || '{}'); const count = layout.buildings?.length || 0; document.querySelector('#city-count').textContent = count ? `${count} buildings in your City.` : 'Your city is ready to grow.'; } catch {}
  const machines = project.projects.workshop?.champion?.machines || project.projects.workshop?.machines || [];
  document.querySelector('#machine-count').textContent = machines.length ? `${machines.length} Workshop machines saved.` : 'Build AI skills for your City.';
  const last = project.updatedAt ? new Date(project.updatedAt).toLocaleString() : null;
  document.querySelector('#summary').textContent = last ? `Last checkpoint: ${last}` : 'Open a workspace and keep creating.';
})().catch(error => { document.querySelector('#health').textContent = `Project could not be opened: ${error?.message || error}`; });
