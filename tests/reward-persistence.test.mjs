import test from 'node:test';
import assert from 'node:assert/strict';

test('backup waits for reward commits and a successful retry clears the failure', async () => {
  const buttons=[];
  globalThis.document={addEventListener(){},createElement(){return {style:{},remove(){this.removed=true;}};},body:{append(button){buttons.push(button);}}};
  try {
    const {commitReward,flushRewardSaves}=await import('../P5 Programme/buddy-kit/client/city-common/reward-persistence.js');
    let complete;
    const saving=commitReward(()=>new Promise(resolve=>{complete=resolve;}));
    let flushed=false;
    const flushing=flushRewardSaves().then(()=>{flushed=true;});
    await Promise.resolve();assert.equal(flushed,false);
    complete({ok:true});await saving;await flushing;assert.equal(flushed,true);
    let attempts=0;
    assert.equal((await commitReward(async()=>++attempts===1?{ok:false,error:'quota'}:{ok:true})).ok,false);
    await assert.rejects(flushRewardSaves(),/Retry/);
    assert.equal(buttons.length,1);buttons[0].onclick();
    await flushRewardSaves();assert.equal(attempts,2);assert.equal(buttons[0].removed,true);
  } finally {delete globalThis.document;}
});
