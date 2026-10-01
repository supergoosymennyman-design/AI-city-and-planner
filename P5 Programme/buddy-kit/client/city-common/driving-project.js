import { compileDrivingMachine, drivingStarter } from './driving-machine.js';
import { buildDrivingBundle, prepareDrivingBundle } from './driving-bundle.js';

// Caller runs this inside project-store.mutate: publishing both halves and
// installing their revision is a single IndexedDB commit. Archives already keep
// opaque workspace sections, including these bundles and bounded evidence.
export function publishDrivingRevision(project, machineId, models) {
  const section = project.projects.driving || { bundles: {}, installed: null, attempts: [] };
  const prior = Object.values(section.bundles || {}).filter(b => b.machineId === machineId);
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

// Called in the project's mutation queue: save the executable and its attempt
// reference together, using the machine visible in that same transaction.
export function latestDrivingRevision(project, { attemptId, scenario } = {}) {
  const projects=project.projects;
  let machineId=projects.workshopSkills?.driving?.machineId;
  const section=projects.driving || {bundles:{},installed:null,attempts:[]};
  machineId ||= section.bundles?.[section.installed]?.machineId;
  if(!machineId && section.installed)throw Error('The saved driving revision is missing. Restore or repair the driving machine.');
  if (!machineId) {
    const workshop=projects.workshop?.champion?.projects?.workshop;
    const paired=Object.entries(workshop?.machines || {}).filter(([,m])=>m.driving || m.pieces?.some(p=>p.drivingRole));
    machineId=paired.find(([id])=>id===workshop.current)?.[0] || paired.at(-1)?.[0];
    if(machineId)projects.workshopSkills={...projects.workshopSkills,driving:{machineId}};
  }
  let champion=projects.workshop?.champion;
  if (!machineId) {
    machineId='drive-'+crypto.randomUUID();
    champion ||= {kind:'ai-champion',version:1,champion:{name:'Champion',parts:{}},projects:{}};
    champion.projects ||= {};
    const workshop=champion.projects.workshop ||= {v:1,machines:{}};
    workshop.machines ||= {};
    workshop.machines[machineId]=drivingStarter();
    projects.workshop={...projects.workshop,champion};
    projects.workshopSkills={...projects.workshopSkills,driving:{machineId}};
  }
  const machine=champion?.projects?.workshop?.machines?.[machineId];
  // Installed v1 pairs with no editable source remain readable.
  if (!machine && !projects.workshopSkills?.driving?.machineId && section.installed) {
    const legacy=installedDrivingPair(section);if(!legacy.ok)throw Error(legacy.error);
    if(attemptId)section.currentAttempt={id:attemptId,modelRef:section.installed,scenario:structuredClone(scenario)};
    return {key:section.installed,prepared:legacy};
  }
  const built=compileDrivingMachine(machine,machineId);
  if(!built.ok)throw Error(built.error);
  const published=publishDrivingRevision(project,machineId,built.bundle.models);
  if(attemptId)project.projects.driving.currentAttempt={id:attemptId,modelRef:published.key,scenario:structuredClone(scenario)};
  return {...published,prepared:installedDrivingPair(project.projects.driving)};
}
