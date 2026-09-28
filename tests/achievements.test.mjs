// tests/achievements.test.mjs
//
// Stage 6: badges are promoted ONLY from observed evidence (plan §2/§3), and
// statues are earned, never purchasable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageCapabilityV2, buildDriveCapability } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { publishCapability, installSkill } from '../P5 Programme/buddy-kit/client/city-common/skill-registry.js';
import { recordLearningEvent } from '../P5 Programme/buddy-kit/client/city-common/ledger.js';
import { createProject } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
import { RECYCLING_PREPROCESSING } from '../P5 Programme/buddy-kit/client/city-common/recycling.js';
import { defaultBadgeState, tierOf } from '../P5 Programme/buddy-kit/client/city-common/badges.js';
import { badgeAchievement, promoteFromEvidence, tierRows } from '../P5 Programme/buddy-kit/client/city-common/achievements.js';
import { statueStatus, earnedStatues, statueSectionHTML, STATUES } from '../P5 Programme/buddy-kit/client/city-common/statues.js';
import { marketItem } from '../P5 Programme/buddy-kit/client/city-common/market-catalogue.js';

const DIM = 4;
const basis = (i) => Array.from({ length: DIM }, (_, j) => (j === i ? 1 : 0));

function imageCap() {
  const out = buildImageCapabilityV2({
    id: 'cap_trashnet-knn', name: 'TrashNet', labels: ['cardboard', 'glass'], dimension: DIM,
    preprocessing: RECYCLING_PREPROCESSING, k: 1, threshold: 0.5,
    examples: [{ label: 'cardboard', vector: basis(0) }, { label: 'glass', vector: basis(1) }],
    city: { hostTypes: ['sorter'] },
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}
function driveCap() {
  const out = buildDriveCapability({
    id: 'cap_drive-knn', name: 'Drive', k: 1, threshold: 0.5,
    examples: [{ label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] }, { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] }],
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

function connect(project, cap, key, host) {
  publishCapability(project, cap);
  installSkill(project, key, host, { hostType: cap.city?.hostTypes?.[0] });
}
function claim(project, type, scopeId, evidence) {
  const res = recordLearningEvent(project.economy, { type, scopeId, evidence });
  assert.equal(res.ok, true, res.error);
  project.economy = res.economy;
}

test('a runnable-only project earns no promotion; held-out evidence earns Skeptic', () => {
  const project = createProject();
  assert.deepEqual(badgeAchievement(project), { tier: null, evidence: {} });

  claim(project, 'held-out-eval', 'image-sorter', { batch: 'normal', seed: 1, total: 8, abstained: 0 });
  const skeptic = badgeAchievement(project);
  assert.equal(skeptic.tier, 'skeptic');
  assert.equal(skeptic.evidence.heldOut, 8);

  const promoted = promoteFromEvidence(project, defaultBadgeState());
  assert.equal(promoted.ok, true);
  assert.equal(promoted.state.tier, 'skeptic');
  // The ratchet holds: a second promotion to the same tier is not a step up.
  assert.equal(promoteFromEvidence(project, promoted.state).ok, false);
});

test('the intended "not sure" response earns Auditor above Skeptic', () => {
  const project = createProject();
  claim(project, 'held-out-eval', 'image-sorter', { batch: 'unfamiliar', seed: 2, total: 6, abstained: 3 });
  claim(project, 'abstain-demo', 'image-sorter', { source: 'recycling', abstained: 3 });
  assert.equal(badgeAchievement(project).tier, 'auditor');
  const rows = tierRows(promoteFromEvidence(project, defaultBadgeState()).state);
  assert.equal(rows.find((r) => r.id === 'auditor').current, true);
  assert.equal(rows.find((r) => r.id === 'builder').reached, true);
});

test('an abstain demo alone cannot skip the held-out rung', () => {
  const project = createProject();
  claim(project, 'abstain-demo', 'image-sorter', { source: 'recycling', abstained: 2 });
  // Limits without a held-out evaluation to find them in is not a promotion.
  assert.equal(badgeAchievement(project).tier, null);
  claim(project, 'held-out-eval', 'image-sorter', { batch: 'unfamiliar', seed: 2, total: 6, abstained: 3 });
  assert.equal(badgeAchievement(project).tier, 'auditor');
});

test('architect needs BOTH skills connected AND the whole ladder below it', () => {
  const project = createProject();
  connect(project, imageCap(), 'cap_trashnet-knn@1', 'host-sorter');
  connect(project, driveCap(), 'cap_drive-knn@1', 'host-car');
  // Both wired into the City is NOT enough: nothing has been tested yet.
  assert.notEqual(badgeAchievement(project).tier, 'architect');

  claim(project, 'held-out-eval', 'image-sorter', { batch: 'normal', seed: 1, total: 8, abstained: 0 });
  // Tested, but the limits (abstain) rung is still missing.
  assert.notEqual(badgeAchievement(project).tier, 'architect');

  claim(project, 'abstain-demo', 'image-sorter', { source: 'recycling', abstained: 2 });
  assert.equal(badgeAchievement(project).tier, 'architect');
});

test('statues are earned from City evidence, never from a purchase', () => {
  const project = createProject();
  connect(project, imageCap(), 'cap_trashnet-knn@1', 'host-sorter');
  // Connected but no completed City trial yet: no statue.
  assert.deepEqual(earnedStatues(project), []);
  claim(project, 'city-install', 'image-sorter', { installationId: 'host-sorter', batch: 'normal', seed: 1 });
  const recycler = statueStatus(project).find((s) => s.id === 'recycler');
  assert.equal(recycler.earned, true);
  assert.equal(recycler.evidence.installationId, 'host-sorter');
  // Inventor Pavilion still needs the driver.
  assert.equal(statueStatus(project).find((s) => s.id === 'inventor-pavilion').earned, false);

  connect(project, driveCap(), 'cap_drive-knn@1', 'host-car');
  claim(project, 'city-install', 'driver', { installationId: 'host-car', trackId: 'full' });
  assert.equal(statueStatus(project).find((s) => s.id === 'inventor-pavilion').earned, true);
  assert.equal(earnedStatues(project).length, 3);
});

test('the statue section renders earned and locked rows in both languages', () => {
  const project = createProject();
  const en = statueSectionHTML(project, 'en');
  const zh = statueSectionHTML(project, 'zh-Hant');
  assert.match(en, /Not earned yet/);
  assert.match(zh, /尚未獲得/);
  assert.match(en, /Recycler Statue/);
  // A pavilion is a placeable prop, but it is never in the market catalogue.
  assert.equal(statueStatus(project).find((s) => s.id === 'inventor-pavilion').propId, 'prop_fountain');
  for (const s of Object.values(STATUES)) assert.equal(marketItem(s.id), null, `${s.id} must not be purchasable`);
});

test('badge measurements do not invent an abstention rate or count installations as examples', () => {
  const project = createProject();
  // Existing eligibility evidence without counts is legitimate old data.
  const result = recordLearningEvent(project.economy, {type:'held-out-eval',scopeId:'driver',evidence:{trackId:'full'}});
  project.economy = result.economy;
  const achievement = badgeAchievement(project);
  assert.equal(achievement.evidence.heldOut,null);
  assert.equal(achievement.evidence.abstainRate,null);
});

test('auditor rate uses the abstention demonstration denominator, not a different first test',()=>{
  const project=createProject();
  project.economy=recordLearningEvent(project.economy,{type:'held-out-eval',scopeId:'image-sorter',evidence:{batch:'normal',seed:1,total:10,abstained:0}}).economy;
  project.economy=recordLearningEvent(project.economy,{type:'abstain-demo',scopeId:'image-sorter',evidence:{source:'recycling',total:10,abstained:3}}).economy;
  const result=badgeAchievement(project);
  assert.equal(result.tier,'auditor');assert.equal(result.evidence.heldOut,10);assert.equal(result.evidence.abstainRate,0.3);
});
