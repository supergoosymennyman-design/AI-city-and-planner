import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const b=await chromium.launch(), c=await b.newContext();const p=await c.newPage();
const origin=process.env.DEMO_ORIGIN||'http://localhost:8378';
try{
 await p.goto(origin+'/workshop/');await p.waitForFunction(()=>!!window.__championSession);
 const result=await p.evaluate(async()=>{
  const S=__championSession,C=ChampionSession,out={};
  await C.setupPIN('8632');
  try{await S.award('0000',{id:'bad',title:'No',amount:50});out.wrongPIN=false}catch{out.wrongPIN=S.file.economy.balance===0}
  await S.award('8632',{id:'a',title:'Synthetic activity',amount:50});
  const before=JSON.stringify(S.file);
  try{await S.transaction({id:'too-much',type:'purchase',title:'Too much',item:'expensive',amount:51});out.insufficient=false}catch{out.insufficient=JSON.stringify(S.file)===before}
  const original=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(){throw new DOMException('Injected storage failure','QuotaExceededError')};
  try{await S.transaction({id:'quota',type:'purchase',title:'Quota',item:'quota',amount:10});out.quota=false}catch{out.quota=JSON.stringify(S.file)===before}
  IDBDatabase.prototype.transaction=original;
  try{await S.replace({...S.file,version:999});out.outer=false}catch{out.outer=JSON.stringify(S.file)===before}
  // A legacy migration does not touch the archived record or import its old coins.
  const legacy={version:1,coins:900,owned:['legacy-hat']};localStorage.setItem('studio.shop.v1',JSON.stringify(legacy));
  const migration={id:'legacy-studio-ownership',type:'legacy-ownership',title:'Legacy Studio gear',amount:0,owned:legacy.owned};
  await S.transaction(migration);await S.transaction(migration);
  out.legacy=S.file.economy.balance===50&&S.file.economy.owned.filter(x=>x==='legacy-hat').length===1&&localStorage.getItem('studio.shop.v1')===JSON.stringify(legacy);
  const file=S.file;file.projects['future-project']={version:999,opaque:[1,2]};file.economy={version:999,opaque:'future'};await S.replace(file);
  try{await S.transaction({id:'unknown',type:'purchase',title:'Unknown',item:'unknown',amount:1});out.future=false}catch{out.future=JSON.stringify(S.file.economy)===JSON.stringify(file.economy)}
  out.foreign=JSON.stringify(S.file.projects['future-project'])===JSON.stringify(file.projects['future-project']);
  return out;
 });
 for(const [key,value] of Object.entries(result)){assert(value,key);console.log('PASS',key)}
 // The persistence path remains atomic with Web Locks unavailable: two tabs share IDB.
 const n=await b.newContext();await n.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
 const tabs=await Promise.all([n.newPage(),n.newPage()]);
 for(const t of tabs){await t.goto(origin+'/workshop/');await t.waitForFunction(()=>!!window.__championSession)}
 await tabs[0].evaluate(async()=>{await ChampionSession.setupPIN('1234');await __championSession.award('1234',{id:'fund',title:'Test',amount:60})});
 await Promise.all(tabs.map((t,i)=>t.evaluate(async i=>{await __championSession.transaction({id:'buy-'+i,type:'purchase',title:'Same',item:'same',amount:40})},i)));
 await tabs[0].evaluate(()=>__championSession.refresh());assert.equal(await tabs[0].evaluate(()=>__championSession.file.economy.balance),20);console.log('PASS real concurrent tabs without Web Locks');
 await n.close();
}finally{await c.close();await b.close()}
