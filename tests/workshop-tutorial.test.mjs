import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const score = require('../P5 Programme/buddy-kit/client/workshop/logic/tutorial-score.js');
const layout = require('../P5 Programme/buddy-kit/client/workshop/logic/floor-layout.js');
const part = (id, type = 'button', n = 1) => ({ id, type, n });
const wire = (a, b) => ({ from: { block: a, port: 'out' }, to: { block: b, port: 'in' } });
test('rebuilt duplicate parts match by connections with new ids and arbitrary positions', () => {
 const target = { pieces: [part('base','sign'),part('a'),part('b')], wires: [wire('a','base'),wire('base','b')] };
 const attempt = { pieces: [part('base','sign'), {...part('newB'),fx:9},part('newA')], wires: [wire('newA','base'),wire('base','newB')] };
 assert.equal(score.score(target, attempt).score,100);
 attempt.wires.pop(); assert(score.score(target,attempt).score<100);
 attempt.pieces[1].n=2; assert.equal(score.score(target,attempt).wrong.length,1);
 attempt.pieces.push(part('extra')); assert.equal(score.score(target,attempt).extra.filter(p=>p.kind==='part').length,1);
});
test('challenge denominator retains 3:1 weights and detects edits to retained pieces', () => {
 const target={pieces:[part('base','sign'),part('a')],wires:[wire('a','base')]};
 const challenge={pieces:[part('a')],wires:target.wires};
 assert.equal(score.score(target,target,undefined,challenge).score,100);
 assert.equal(score.score(target,{...target,wires:[]},undefined,challenge).score,75);
 assert.equal(score.score(target,{...target,pieces:[part('base','sign',2),part('a')]},undefined,challenge).score,25);
});
test('reference layout preserves size and position after pruning, moving and resizing', () => {
 const table={pieces:[{id:'a',type:'button'},{id:'b',type:'sign'}],wires:[],snaps:[]};
 const plan=layout.floorPlan(table,{w:1000,h:600});
 const reference=Object.fromEntries(Object.entries(plan.objects).map(([id,o])=>[id,{...o}]));
 const pruned={...table,pieces:[table.pieces[1]]};
 const after=layout.floorPlan(pruned,{w:768,h:400,reference});
 for(const k of ['x','y','w','h']) assert(Math.abs(after.objects.b[k]-plan.objects.b[k]) < 1e-9);
 pruned.pieces=[{...table.pieces[1],fx:0.7,fy:0.5}];
 const moved=layout.floorPlan(pruned,{w:1000,h:600,reference});
 assert.equal(moved.objects.b.cx,700); assert.equal(moved.objects.b.cy,300);
});
test('a partial rebuild gives credit to the matching configuration regardless of target order', () => {
 const target={pieces:[part('a','filter',1),part('b','filter',2)]};
 const result=score.score(target,{pieces:[part('new','filter',2)]});
 assert.equal(result.score,50);assert.equal(result.wrong.length,0);
 assert.equal(result.missing[0].slotKey,'a');
});
test('watch references follow rebuilt part identities as well as wire endpoints', () => {
 const target={pieces:[part('track','track'),{...part('reader','sense'),watchPiece:'track'}]};
 const attempt={pieces:[part('newTrack','track'),{...part('reader','sense'),watchPiece:'newTrack'}]};
 assert.equal(score.score(target,attempt).score,100);
});
