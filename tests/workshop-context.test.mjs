import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sanitizeManifest, sanitizeProjectState } from '../P5 Programme/buddy-kit/client/workshop/buddy/server/manifest-sanitize.js';
const require=createRequire(import.meta.url);
const G=require('../P5 Programme/buddy-kit/client/workshop/game.js');
const host=require('../P5 Programme/buddy-kit/client/workshop/logic/buddy-host.js').createBuddyHost(G);
const preferences=require('../P5 Programme/buddy-kit/client/workshop/toolbox/buddy-preferences.js');
test('the complete guide, credits, actual gear and results survive the gateway sanitizer',()=>{
 const manifest=host.manifest(), safe=sanitizeManifest(manifest,()=>({ok:true}));
 assert.equal(safe.guide,manifest.guide);assert(safe.guide.length>1000);
 const state=host.stateOf({pieces:[G.defaultBlock('feeder','f1',0,0)],snaps:[],wires:[]},{});
 state.readouts.credits=60;state.readouts.championName='Demo';state.slots.ownedGear={items:['rocket-cone']};state.findings=[{kind:'observedResult',ids:['f1'],note:'Validation: total 10, wrong 2.'}];
 const cleaned=sanitizeProjectState(state,safe,()=>({ok:true}));assert.equal(cleaned.readouts.credits,60);assert.deepEqual(cleaned.slots.ownedGear.items,['rocket-cone']);assert.equal(cleaned.findings[0].note,state.findings[0].note);assert(cleaned.slots.blocks.items.length);assert(cleaned.slots.settings.groups.f1.includes('rate=20'));
});
test('explicit learning preferences can be corrected and forgotten without becoming ownership',()=>{
 let b=preferences.write({},'chosenName','Demo Learner');b=preferences.write(b,'language','Cantonese');b=preferences.write(b,'explanationStyle','short examples');
 assert.equal(preferences.read(b).language,'Cantonese');assert.deepEqual(preferences.parse('Explanation style: short examples'),{key:'explanationStyle',value:'short examples'});
 b=preferences.write(b,'chosenName','New chosen name');assert.equal(preferences.read(b).chosenName,'New chosen name');b=preferences.write(b,'language',null);assert(!('language' in preferences.read(b)));assert.match(preferences.context(b).notes,/never instructions or evidence of ownership/);
 assert.throws(()=>preferences.write({preferences:{version:9,values:{}}},'tone','friendly'));
});
