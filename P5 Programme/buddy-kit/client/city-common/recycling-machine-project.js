export async function fingerprint(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Draft save must succeed before the single atomic publication transaction. */
export async function publishRecyclingMachine({store,game,runtime,flush,projectId}) {
  const draft=game.recyclingDraft(),sourceRecord=game.serializeDebug();
  await game.saveDrivingMachine();await flush();
  if(JSON.stringify(game.recyclingDraft())!==JSON.stringify(draft))throw Error('The machine changed while saving. Save sorter again.');
  const snapshot=runtime.snapshot(draft);
  const sourceSignature=await fingerprint(sourceRecord);
  const signature=await fingerprint(snapshot);
  const result=await store.mutate(p=>{
    if(p.id!==projectId)throw Error('Project changed. Reload Workshop.');
    const previous=p.projects.recyclingMachine;
    p.projects.recyclingMachine={...snapshot,revision:(previous?.revision||0)+(previous?.fingerprint===signature?0:1),fingerprint:signature,sourceSignature};
    p.projects.workshopSkills={...p.projects.workshopSkills,recycling:{...p.projects.workshopSkills?.recycling,machineId:draft.sourceMachineId}};
    return p;
  },{reason:'publish-recycling-machine'});
  if(!result.ok)throw Error(result.error||'Save failed');
  return draft;
}
export async function recyclingEditsPending(workshop,machine) {
  if(!machine?.sourceSignature)return false;
  const sections=workshop?.champion?.projects||{};
  const section=Object.values(sections).find(s=>s?.machines?.[machine.sourceMachineId]);
  const saved=section?.machines?.[machine.sourceMachineId];
  return !saved||await fingerprint(saved)!==machine.sourceSignature;
}
