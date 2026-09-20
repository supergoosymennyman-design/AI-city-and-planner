import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURPOSES } from '../P5 Programme/buddy-kit/client/city-common/building-purposes.js';
import { CATALOG, specialKeys } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';
import { QUESTS, QUEST_STATE_KEY, recordLegacyActivity, loadQuestState, invalidateQuestState } from '../P5 Programme/buddy-kit/client/hong-kong-real/quests.js';
import { collectState, composeChampionFile, sanitizeChampionFile, writeState } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';
const memory = raw => { const map=new Map([[QUEST_STATE_KEY,raw]]);return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}; };
test('18 stable purposes have bounded actions and independent legacy IDs',()=>{
 assert.deepEqual(Object.keys(PURPOSES),specialKeys());
 assert.equal(QUESTS.length,18);
 for(const [type,p] of Object.entries(PURPOSES)) {
  assert.ok(p.en && p.zh);assert.equal(CATALOG[type].name,p.en);
  assert.deepEqual(Object.keys(p).sort(),['actions','description','descriptionZh','en','zh']);
  assert.ok(p.actions.every(a=>['plan','evidence','exhibits','routes','guide','delivery','destinations','save','restore'].includes(a)));
 }
 assert.deepEqual(specialKeys().map(t=>CATALOG[t].questId).sort((a,b)=>a-b),Array.from({length:18},(_,i)=>i+1));
});
test('opaque historical arrays/raw strings survive read and Champion File round trip',()=>{
 const history={completed:[...Array.from({length:18},(_,i)=>i+1),999,18],unlocked:[18,2,999,2],future:{keep:true}};
 const raw=' \n'+JSON.stringify(history,null,2)+'\n';const storage=memory(raw);
 globalThis.localStorage=storage;invalidateQuestState();assert.deepEqual(loadQuestState(),history);
 assert.equal(storage.getItem(QUEST_STATE_KEY),raw);
 const file=composeChampionFile(collectState(storage));
 const clean=sanitizeChampionFile(file);assert.equal(clean.ok,true);
 const dest=memory(null);writeState(clean.file.state,dest);assert.equal(dest.getItem(QUEST_STATE_KEY),raw);
 for(let i=0;i<80;i++)assert.equal(recordLegacyActivity(i%18+1,storage),true);
 const after=JSON.parse(storage.getItem(QUEST_STATE_KEY));assert.deepEqual(after.completed,history.completed);assert.deepEqual(after.unlocked,history.unlocked);assert.deepEqual(after.future,history.future);assert.equal(after.activity.length,64);
 const activityRaw = storage.getItem(QUEST_STATE_KEY);
 const copied = sanitizeChampionFile(composeChampionFile(collectState(storage)));
 writeState(copied.file.state,dest);assert.equal(dest.getItem(QUEST_STATE_KEY),activityRaw);
});
test('activity cannot overwrite malformed history or claim a tool as a quest',()=>{
 for(const raw of ['broken','null','[]']) {const s=memory(raw);assert.equal(recordLegacyActivity(1,s),false);assert.equal(s.getItem(QUEST_STATE_KEY),raw);}
 assert.equal(recordLegacyActivity(19,memory('{}')),false);
 assert.equal(recordLegacyActivity(undefined,memory('{}')),false);
 assert.equal(recordLegacyActivity(1,{getItem:()=> '{}',setItem(){throw Error('full')}}),false);
});
