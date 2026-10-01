// One compiler for the editable Workshop machine and every new City attempt.
import '../workshop/logic/drive-examples.js';
import { buildDrivingBundle, DRIVING_SCHEMAS } from './driving-bundle.js';

export function drivingStarter() {
  return { v: 1, seed: 42, name: 'My driving machine / 我的駕駛機器', ...globalThis.WorkshopDriveExamples.make('drive-v2', { defaultBlock: (type,id) => ({type,id,x:0,y:0}) }) };
}
export function drivingBindings(machine) {
  if (machine.driving) return machine.driving.bindings || {};
  // Legacy pairs acquire explicit bindings on their next save. Never guess a
  // replacement after a bound controller has been removed.
  return Object.fromEntries(['steering','speed'].map(role => {
    const p = machine.pieces?.find(p => p.drivingRole === role);
    const edge = machine.wires?.find(w => w.from.block === p?.id && w.from.port === 'reading' && w.to.port === 'show');
    return [role, { blockId: p?.id, outputId: edge?.to.block }];
  }));
}
export function compileDrivingMachine(machine, machineId, revision = 1) {
  try {
    if (!machine?.pieces) throw Error('Missing saved driving machine / 找不到已儲存的駕駛機器');
    machine.pieces.forEach(p => globalThis.WorkshopDrivingPairData.migrateSteeringPiece(p));
    const bindings = drivingBindings(machine), models = {};
    for (const role of ['steering','speed']) {
      const binding = bindings[role], p = machine.pieces.find(p => p.id === binding?.blockId);
      const output = machine.pieces.find(p => p.id === binding?.outputId);
      if (!p || p.type !== 'sense' || p.drivingRole !== role || p.senseId !== 'data' || p.brainId !== 'knn' || p.libraryModel || p.privateData || output?.type !== 'sign' || output.mode !== 'label' ||
        !machine.wires?.some(w => w.from.block === p.id && w.from.port === 'reading' && w.to.block === output.id && w.to.port === 'show')) throw Error(`Repair ${role} controller and its Action connection / 請修復控制器及動作連線`);
      const schema = DRIVING_SCHEMAS[role], examples = [];
      for (const [label,shelf] of Object.entries(p.learning?.data?.brain?.shelves || {})) for (const ex of shelf) {
        if (!Array.isArray(ex.raw)) throw Error('Missing learned sensor readings');
        let i=0; const readings={};
        for (const f of schema.features) {
          if (f.options) { const values=ex.raw.slice(i,i+f.options.length); readings[f.id]=f.options[values.indexOf(1)]; i+=f.options.length; }
          else readings[f.id]=f.min+ex.raw[i++]*(f.max-f.min);
        }
        examples.push({id:ex.id,label,vec:[...ex.vec],readings,display:ex.display});
      }
      let mode = p.drivingMode || (examples.length ? 'trained' : role === 'steering' ? 'default' : 'constant');
      if(mode === 'trained' && !examples.length)mode = role === 'steering' ? 'default' : 'constant';
      models[role] = {blockId:p.id,outputId:output.id,mode,action: mode === 'trained' ? undefined : (mode === 'default' ? 'straight' : p.drivingAction || 'go'),k:p.k ?? 3,threshold:p.sure ?? .5,examples};
    }
    return buildDrivingBundle({machineId,revision,models});
  } catch(error) { return {ok:false,error:error.message}; }
}
