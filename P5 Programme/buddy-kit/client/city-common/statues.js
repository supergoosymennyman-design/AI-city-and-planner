// statues.js — EARNED city recognition, never purchasable (plan §2).
//
// Three statues celebrate work the student actually demonstrated. They are
// deliberately NOT in market-catalogue.js: nothing can buy them. Each carries an
// inspectable evidence card describing what the child did, and each places as a
// city prop through the ordinary placement path.
//
// Pure: no DOM, no clock, no randomness. Node-testable.
import { CHALLENGE_IDS, installationEntries } from './challenges.js';
import { claimKey, REWARD_CONFIG } from './ledger.js';

export const STATUES_VERSION = 1;

export const STATUES = Object.freeze({
  recycler: Object.freeze({
    id: 'recycler',
    name: 'Recycler Statue',
    nameZh: '回收者雕像',
    propId: 'prop_horse_statue',
    emoji: '♻',
    blurb: 'Completed the recycling City trial and inspected the results.',
    blurbZh: '完成回收城市試驗並查看了結果。',
  }),
  'road-explorer': Object.freeze({
    id: 'road-explorer',
    name: 'Road Explorer Statue',
    nameZh: '道路探索者雕像',
    propId: 'prop_fantasy_fountain_square',
    emoji: '▣',
    blurb: 'Completed the test-track trial and inspected the results.',
    blurbZh: '完成測試賽道試驗並查看了結果。',
  }),
  'inventor-pavilion': Object.freeze({
    id: 'inventor-pavilion',
    name: 'Inventor Pavilion',
    nameZh: '發明家展館',
    propId: 'prop_fountain',
    emoji: '★',
    blurb: 'Brought BOTH skills into the City.',
    blurbZh: '把兩個技能都帶進了城市。',
  }),
});

export function statue(idValue) { return STATUES[idValue] || null; }

function claimOf(type, challengeId) {
  const reward = REWARD_CONFIG.rewards[type];
  return reward ? claimKey(reward, challengeId) : null;
}
function evidenceOf(economy, type, challengeId) {
  const key = claimOf(type, challengeId);
  return key ? (economy?.evidence?.[key] || null) : null;
}
function hasClaim(economy, type, challengeId) {
  const key = claimOf(type, challengeId);
  return !!(key && Array.isArray(economy?.claimed) && economy.claimed.includes(key));
}
const connected = (project, id) => installationEntries(project, id).length > 0;

/**
 * Which statues the project has EARNED, each with the evidence that earned it.
 * @returns {Array<{id,name,nameZh,propId,emoji,earned:boolean,evidence:object}>}
 */
export function statueStatus(project) {
  const economy = project?.economy;
  const bothConnected = CHALLENGE_IDS.every((id) => connected(project, id));
  return Object.values(STATUES).map((s) => {
    let earned = false, evidence = null;
    if (s.id === 'recycler') {
      earned = connected(project, 'image-sorter') && hasClaim(economy, 'city-install', 'image-sorter');
      evidence = evidenceOf(economy, 'city-install', 'image-sorter');
    } else if (s.id === 'road-explorer') {
      earned = connected(project, 'driver') && hasClaim(economy, 'city-install', 'driver');
      evidence = evidenceOf(economy, 'city-install', 'driver');
    } else {
      earned = bothConnected;
      evidence = bothConnected ? { challenges: [...CHALLENGE_IDS] } : null;
    }
    return { ...s, earned, evidence };
  });
}

export function earnedStatues(project) {
  return statueStatus(project).filter((s) => s.earned);
}

/** Pure HTML for the Logbook's earned-statues section (DOM-free, testable).
 *  Accepts a project or an already-derived `statueStatus()` array. */
export function statueSectionHTML(projectOrStatus, lang = 'en') {
  const zh = lang === 'zh-Hant';
  const list = Array.isArray(projectOrStatus) ? projectOrStatus : statueStatus(projectOrStatus);
  const rows = list.map((s) => {
    const card = s.earned && s.evidence
      ? `<div class="statue-evidence">${Object.entries(s.evidence).filter(([, v]) => v != null)
          .map(([k, v]) => `<span>${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}</span>`).join('')}</div>`
      : '';
    return `<div class="logbook-statue ${s.earned ? 'earned' : 'locked'}">
        <div class="statue-medal" aria-hidden="true">${s.earned ? s.emoji : '☆'}</div>
        <div>
          <div class="statue-name">${zh ? s.nameZh : s.name}</div>
          <div class="statue-blurb">${s.earned ? (zh ? s.blurbZh : s.blurb) : (zh ? '尚未獲得' : 'Not earned yet')}</div>
          ${card}
        </div>
      </div>`;
  }).join('');
  return `<div class="logbook-section-title">${zh ? '你贏得的雕像' : 'Statues you earned'}</div>`
    + `<div class="logbook-statue-intro">${zh
      ? '這些雕像不能用積分購買。它們只為你真正完成的事而出現。'
      : 'These statues cannot be bought. They appear only for work you really did.'}</div>`
    + rows;
}
