import {test,expect} from '@playwright/test';
import {capabilities,boot,publish,run} from './activity-helpers.mjs';
import {CITY_BIN_MAPPING} from '../../buddy-kit/client/city-common/activity-trial.js';

test('the station routes by prediction and changing the model changes sorting',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);await publish(page,capabilities());
 const a=await run(page,'recycling');
 expect(a.score.answered).toBeGreaterThan(0);
 for(const r of a.results){expect(r.routedBy).toBe('machine');expect(r.bin).toBe(r.abstained?'human-check':CITY_BIN_MAPPING[r.decision]);}
 await publish(page,capabilities(2));const b=await run(page,'recycling');
 expect(b.results.map(r=>r.id)).toEqual(a.results.map(r=>r.id));
 expect(b.results.map(r=>r.truth)).toEqual(a.results.map(r=>r.truth));
 expect(b.results.map(r=>r.decision)).not.toEqual(a.results.map(r=>r.decision));
 expect(errors).toEqual([]);
});
