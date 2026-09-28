import { buildDrivingBundle, prepareDrivingBundle } from './driving-bundle.js';

// Caller runs this inside project-store.mutate: publishing both halves and
// installing their revision is a single IndexedDB commit. Archives already keep
// opaque workspace sections, including these bundles and bounded evidence.
export function publishDrivingRevision(project, machineId, models) {
  const section = project.projects.driving || { bundles: {}, installed: null, attempts: [] };
  const prior = Object.values(section.bundles).filter(b => b.machineId === machineId);
  const revision = Math.max(0, ...prior.map(b => b.revision)) + 1;
  const built = buildDrivingBundle({ machineId, revision, models });
  if (!built.ok) throw new Error(built.error);
  const key = `${machineId}@${revision}`;
  const duplicate = prior.find(b => JSON.stringify(b.models) === JSON.stringify(built.bundle.models));
  const installed = duplicate ? `${machineId}@${duplicate.revision}` : key;
  project.projects.driving = { ...section, bundles: { ...section.bundles, ...(duplicate ? {} : { [key]: built.bundle }) }, installed };
  return { key: installed, revision: duplicate?.revision || revision };
}

export function installedDrivingPair(section) {
  return prepareDrivingBundle(section?.bundles?.[section?.installed]);
}

export function recordDrivingAttempt(project, evidence) {
  const section = project.projects.driving;
  const key = `${evidence.machineId}@${evidence.revision}`;
  if (!section?.bundles?.[key] || !evidence.outcome || !Array.isArray(evidence.records) || evidence.records.length > 2400) throw new Error('Invalid driving evidence');
  section.attempts = [...(section.attempts || []).slice(-2), JSON.parse(JSON.stringify(evidence))];
  return project;
}
