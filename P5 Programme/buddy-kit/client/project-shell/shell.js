import { mountProjectBar } from '../city-common/project-bar.js';
import { WORKSHOP_URL, FIT_STUDIO_URL } from '../shared/links.js';
const type = location.pathname.includes('studio') ? 'studio' : 'workshop';
const url = type === 'studio' ? FIT_STUDIO_URL : WORKSHOP_URL;
document.title = type === 'studio' ? 'Passiona — 3D Studio' : 'Passiona — AI Workshop';
document.querySelector('#title').textContent = type === 'studio' ? '3D Studio' : 'AI Workshop';
document.querySelector('#message').textContent = type === 'studio' ? 'The live Studio opens in its established editor. A selected City object is retained in this project when that editor is adopted here.' : 'The live Workshop opens in its established editor. Its Champion File remains compatible while its source is moved into this project.';
const open = document.querySelector('#open'); open.href = url; open.textContent = type === 'studio' ? 'Open 3D Studio' : 'Open AI Workshop';
(async () => {
  const store = await mountProjectBar({ workspace: type });
  if (type !== 'workshop') return;
  const project = await store.openActiveProject();
  const target = new URL(url);
  target.searchParams.set('passionaProject', project.id);
  target.searchParams.set('publishTarget', 'city');
  target.searchParams.set('returnTo', new URL('../city-builder/?workshop=published', location.href).href);
  open.href = target.href;
  document.querySelector('#message').textContent = 'Build and publish a machine revision. City installs that exact revision and marks it live only after its self-tests pass.';
})().catch(() => { /* the established Workshop link remains usable */ });
