const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../P5 Programme/buddy-kit/client/workshop/toolbox/champion-session.js');
const fresh = () => C.prepare({kind:'ai-champion',version:1,champion:{name:'Demo'},projects:{foreign:{version:99,data:[1,2]}}});
test('old champion starts with zero shared credits and a stable portable ID', () => {
 const f=fresh(); assert.equal(f.economy.balance,0); assert.equal(C.prepare(JSON.parse(JSON.stringify(f))).champion.id,f.champion.id);
 assert.deepEqual(C.prepare(f).projects,f.projects); assert.throws(()=>C.prepare({...f,version:2}));
});
test('awards and purchases are immutable, idempotent, whole-number, atomic', () => {
 const f=fresh(), award={id:'a',type:'award',title:'Inspect errors',amount:50}; const funded=C.transact(f,award);
 assert.equal(f.economy.balance,0); assert.deepEqual(C.transact(funded,award),funded);
 for(const amount of [-1,0,1.5,Infinity,Number.MAX_SAFE_INTEGER]) assert.throws(()=>C.transact(funded,{...award,id:'other',amount}));
 const buy={id:'p',type:'purchase',title:'Hat',item:'hat',amount:30}; const bought=C.transact(funded,buy);
 assert.equal(bought.economy.balance,20); assert.deepEqual(bought.economy.owned,['hat']);
 assert.deepEqual(C.transact(bought,{...buy,id:'p2'}),bought);
 assert.throws(()=>C.transact(bought,{...buy,id:'p3',item:'cape'}));
 assert.throws(()=>C.transact(bought,{...award,amount:30}));
});
test('future nested economy is preserved but cannot be mutated', () => {
 const f=C.prepare({...fresh(), economy:{version:9,opaque:'keep'}});
 assert.deepEqual(f.economy,{version:9,opaque:'keep'}); assert.throws(()=>C.transact(f,{id:'a',type:'award',title:'A',amount:1}));
});
test('legacy ownership migrates once without coins', () => {
 let f=fresh(); const op={id:'legacy',type:'legacy-ownership',title:'Legacy',amount:0,owned:['hat','hat']};
 f=C.transact(f,op); assert.deepEqual(f.economy.owned,['hat']); assert.equal(f.economy.balance,0); assert.deepEqual(C.transact(f,op),f);
});
test('JSON transport exactly restores geometry arrays, fitted GLB bytes and tag-shaped foreign data', () => {
 const obj={positions:new Float32Array([0,1.25,-3]),index:new Uint32Array([0,1,2]),glb:new Uint8Array([0,1,255]).buffer,unknown:['binary','Float32Array','keep'],absent:undefined};
 const out=C.decode(JSON.parse(JSON.stringify(C.encode(obj)))); assert.deepEqual(out,obj);
 assert.throws(()=>C.encode({broken:NaN})); assert.throws(()=>C.decode(['binary','eval','AAAA']));
});
