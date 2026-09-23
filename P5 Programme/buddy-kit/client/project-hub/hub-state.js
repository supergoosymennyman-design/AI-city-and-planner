import { validateLayout } from '../city-common/layout.js';
import { FIT_STUDIO_URL, WORKSHOP_URL } from '../shared/links.js';

const ROUTES = Object.freeze({ planner: '/planner/', city: '/city-builder/?resume=1', studio: FIT_STUDIO_URL, workshop: WORKSHOP_URL });
const WORKSPACES = Object.keys(ROUTES);

function objectHasContent(value) {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

export function parseCityLayout(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const layout = JSON.parse(raw);
    return validateLayout(layout).ok ? layout : null;
  } catch { return null; }
}

export function readCityLayout(project) {
  return parseCityLayout(project?.projects?.city?.legacyState?.layout);
}

export function workshopMachines(project) {
  const workshop = project?.projects?.workshop || {};
  return [workshop.champion?.machines, workshop.machines].find(Array.isArray) || [];
}

export function chooseResumeWorkspace(project) {
  const hasSavedCity = !!readCityLayout(project);
  const preferred = [project?.progress?.lastWorkspace, project?.progress?.resumeWorkspace, project?.lastWorkspace]
    .find(value => WORKSPACES.includes(value));
  if (preferred && (preferred !== 'city' || hasSavedCity)) return preferred;
  const sections = project?.projects || {};
  const dated = WORKSPACES.map(name => ({ name, time: Date.parse(sections[name]?.updatedAt || sections[name]?.savedAt || '') }))
    .filter(item => (item.name !== 'city' || hasSavedCity) && Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  if (dated.length) return dated[0].name;
  if (hasSavedCity) return 'city';
  if (objectHasContent(sections.studio)) return 'studio';
  if (workshopMachines(project).length || objectHasContent(sections.workshop)) return 'workshop';
  if (objectHasContent(sections.planner)) return 'planner';
  return 'planner';
}

export function projectHubView(project, checkpointCount = 0) {
  const layout = readCityLayout(project);
  const sections = project?.projects || {};
  const workspace = chooseResumeWorkspace(project);
  const studioRevision = Number(sections.studio?.revision || sections.studio?.document?.revision || 0);
  return {
    name: String(project?.name || 'My AI City'),
    projectRevision: Number(project?.revision || 0),
    checkpointCount: Math.max(0, Number(checkpointCount) || 0),
    updatedAt: project?.updatedAt || null,
    buildingCount: Array.isArray(layout?.buildings) ? layout.buildings.length : 0,
    hasSavedCity: !!layout,
    machineCount: workshopMachines(project).length,
    studioRevision,
    revisions: Object.fromEntries(WORKSPACES.map(name => [name, Number(sections[name]?.revision || 0)])),
    resumeWorkspace: workspace,
    resumeRoute: ROUTES[workspace],
  };
}

export { ROUTES };
