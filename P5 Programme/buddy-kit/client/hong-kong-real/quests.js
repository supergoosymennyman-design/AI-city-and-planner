// quests.js — the 18 lesson buildings in the unified HK Smart City.
// All quests live on ONE map (Central + Tsim Sha Tsui + Sheung Wan + Mong Kok
// background fabric), projected against the Central origin. Students fly a
// taxi to a quest building, tap Enter, and play the linked minigame.
//
// State: localStorage stores which quests are completed.
//   completed: [ids...]      — beacon turns jade green
//   unlocked:  [ids...]      — beacon glows cyan (playable)
//   all other quests locked   — beacon dim grey
//
// Game URLs are PER-QUEST DATA and deliberately stay inline: each minigame
// origin appears exactly once, so a central map would add indirection without
// removing duplication. Shared origins (hub home, workshop, city-sim) are
// canonical in `shared/links.js` — import those constants instead of re-typing
// a `.workers.dev` literal when a quest needs a shared origin.

export const QUEST_STATE_KEY = 'hk_ai_city_quests_v1';

export const QUESTS = [
  // ORDER = the arrival route. The student flies from the TST promenade across
  // the harbour to the flagship AI City Central first (nice skyline approach),
  // tours the Central cluster, heads west to Sheung Wan, then north to the TST
  // cluster to finish back near where they started. The buddy's first
  // suggestion and the "next unlocked" quest both follow this array order.
  // ---- Central cluster (arrive here first) ----
  { id: 4, lesson: 18,  name: 'AI Smart City',         labelZh: '人工智能城市中心', labelEn: 'AI City Central',          pos: [-40, -120], height: 80, gameUrl: '/project/p3-18-3d-city/' },
  { id: 1, lesson: 17,  name: 'AI & Gov Finances',     labelZh: '人工智能金融中心', labelEn: 'AI Finance Tower',          pos: [140, -60],  height: 34, gameUrl: 'https://falling-tooth-552b.supergoosymennyman.workers.dev/' },
  { id: 2, lesson: 15,  name: 'Tokenomics',            labelZh: '智慧財政署',       labelEn: 'Smart Treasury',           pos: [100, 40],   height: 30, gameUrl: 'https://divine-sky-d18f.supergoosymennyman.workers.dev/' },
  { id: 3, lesson: 16,  name: 'Sentiment Analysis',    labelZh: '民情分析站',       labelEn: 'Public Sentiment Lab',     pos: [-120, 80],  height: 24, gameUrl: 'https://orange-dawn-3ec5.supergoosymennyman.workers.dev/' },
  { id: 5, lesson: 12,  name: 'Traffic Light Optimisation', labelZh: '交通優化實驗室', labelEn: 'Traffic Optimization Lab', pos: [60, 180],  height: 22, gameUrl: null },
  { id: 6, lesson: 13,  name: 'Traffic Wave Prediction', labelZh: '交通預測及應急中心', labelEn: 'Traffic & Emergency AI', pos: [150, 140], height: 26, gameUrl: null },
  { id: 7, lesson: 4,  name: 'Drone Routing',        labelZh: '無人機航線規劃',   labelEn: 'Drone Routing AI',         pos: [-160, -40], height: 28, gameUrl: 'https://p3-04-drone-routing.ai-education.workers.dev/' },
  { id: 8, lesson: 8,  name: 'Healthy City',          labelZh: '公共衞生智慧中心', labelEn: 'Smart Health Monitor',     pos: [-80, 160],  height: 24, gameUrl: 'https://p3-08-healthy-city.ai-education.workers.dev/' },
  { id: 18, lesson: 14, name: 'Drone Air Traffic Control', labelZh: '無人機航空控制', labelEn: 'Drone Air Traffic Control', pos: [20, -80],  height: 64, gameUrl: 'https://quiet-mountain-49c0.supergoosymennyman.workers.dev/' },

  // ---- Sheung Wan cluster (west) ----
  { id: 16, lesson: 3, name: 'Moving Around a Grid',  labelZh: '機械人迷宮導航',   labelEn: 'Robot Grid Lab',           pos: [-420, -180], height: 24, gameUrl: 'https://p3-03-moving-around-a-grid.ai-education.workers.dev/' },
  { id: 17, lesson: 5, name: 'Swarm Pathfinding',     labelZh: '羣體路徑尋找',     labelEn: 'Swarm Pathfinder',         pos: [-500, -120], height: 26, gameUrl: 'https://p3-05-swarm-pathfinding.ai-education.workers.dev/' },
  { id: 15, lesson: 2, name: 'AI Subsurface Scanning', labelZh: '地底掃描工程站', labelEn: 'Subsurface AI Scanner',    pos: [-340, 60],  height: 22, gameUrl: 'https://noisy-fire-5f4b.clover-marquis.workers.dev/' },

  // ---- Tsim Sha Tsui cluster (north, across the harbour) ----
  { id: 9, lesson: 7,  name: 'Self-driving Bus Scheduling', labelZh: '巴士自動駕駛', labelEn: 'AI Bus Scheduler',     pos: [1450, 1180], height: 22, gameUrl: 'https://p3-07-self-driving-bus-scheduling.ai-education.workers.dev/' },
  { id: 10, lesson: 6, name: 'Delivery Paths Loops',  labelZh: '物流路徑優化',     labelEn: 'Delivery Loop AI',         pos: [1390, 1220], height: 26, gameUrl: 'https://p3-06-delivery-paths-loops.ai-education.workers.dev/' },
  { id: 11, lesson: 11, name: 'AI Smart Monitoring',   labelZh: '全城智能監察',     labelEn: 'Smart City Monitoring',    pos: [1300, 1300], height: 30, gameUrl: null },
  { id: 12, lesson: 9, name: 'Water Supply',          labelZh: '智慧供水網絡',     labelEn: 'Smart Water Supply',       pos: [1260, 1160], height: 24, gameUrl: null },
  { id: 13, lesson: 10, name: 'Power Grid',            labelZh: '智慧電網',         labelEn: 'Smart Power Grid',         pos: [1340, 1350], height: 26, gameUrl: null },
  { id: 14, lesson: 1, name: 'Waste Sorters',         labelZh: '資源回收實驗室',   labelEn: 'Recycling Lab',            pos: [1520, 1300], height: 20, gameUrl: 'https://p3-01-waste-sorters.ai-education.workers.dev/' },
];

// Mission themes — shown on the building-entry card before the game loads.
// KEYED BY QUEST ID (quests.js ids do NOT match lesson numbers):
//   id 1 = AI Finance Tower    → L17 AI & Gov Finances
//   id 2 = Smart Treasury      → L15 Tokenomics
//   id 3 = Public Sentiment    → L16 Sentiment Analysis
//   id 4 = AI City Central     → L18 AI Smart City
//   id 5 = Traffic Opt Lab     → L12 Traffic Light Optimization
//   id 6 = Traffic & Emergency → L13 Traffic Wave Prediction
//   id 7 = Drone Routing       → L4  Drone Routing
//   id 8 = Smart Health        → L8  Healthy City
//   id 9 = AI Bus Scheduler    → L7  Self-driving Bus Scheduling
//   id 10 = Delivery Loop      → L6  Delivery Paths Loops
//   id 11 = Smart Monitoring   → L11 AI Smart Monitoring
//   id 12 = Smart Water        → L9  Water Supply
//   id 13 = Smart Power Grid   → L10 Power Grid
//   id 14 = Recycling Lab      → L1  Waste Sorters
//   id 15 = Subsurface Scanner → L2  AI Subsurface Scanning
//   id 16 = Robot Grid Lab     → L3  Moving Around a Grid
//   id 17 = Swarm Pathfinder   → L5  Swarm Pathfinding
//   id 18 = Drone ATC          → L14 AI and Air Traffic Control
export const QUEST_THEMES = {
  1:  { icon: '📊', title: 'AI & Gov Finances',  line: '"Price AI compute fees with billing sliders"',        color: '#00f2fe', reason: 'The city budget system is overloaded — balance fees before the servers crash!' },
  2:  { icon: '🪙', title: 'Tokenomics',          line: '"Allocate tokens across AI passport tasks"',          color: '#ffd166', reason: 'Citizens are queuing at the passport office — allocate AI tokens efficiently!' },
  3:  { icon: '💬', title: 'Sentiment Analysis',  line: '"Route citizen complaints by sentiment scores"',      color: '#ff5c7a', reason: 'Angry complaints are piling up — route them to the right departments before the Council meeting!' },
  4:  { icon: '🏙️', title: 'AI Smart City',      line: '"Build and simulate an AI-powered smart city"',       color: '#00f2fe', reason: 'Design the city of tomorrow — every decision affects thousands of citizens!' },
  5:  { icon: '🚦', title: 'Traffic Signals',     line: '"Flush traffic queues before gridlock occurs"',       color: '#3ddc84', reason: 'Gridlock is spreading — flush the traffic queues before nobody can move!' },
  6:  { icon: '🌊', title: 'Traffic Wave Prediction', line: '"Absorb traffic waves before they form jams"',   color: '#ff8c2e', reason: 'A wave of cars is coming — predict the flow before the junction jams!' },
  7:  { icon: '🛸', title: 'Drone Routing',       line: '"Plan drone flight paths avoiding no-fly zones"',     color: '#00b7ff', reason: 'Drones are crashing into buildings — plan safe flight paths through the city!' },
  8:  { icon: '🏥', title: 'Healthy City',        line: '"Sort emergency supplies to neighborhood clinics"',   color: '#ff5c7a', reason: 'A health crisis is brewing — get supplies to clinics before they run out!' },
  9:  { icon: '🚌', title: 'Self-driving Buses',  line: '"Adjust bus frequencies from passenger heatmaps"',    color: '#00f2fe', reason: 'Buses are packed at rush hour — adjust frequencies to match the crowd!' },
  10: { icon: '📦', title: 'Delivery Paths Loops', line: '"Optimize delivery routes to minimize distance"',    color: '#3ddc84', reason: 'Packages are piling up — find the shortest delivery route to save fuel!' },
  11: { icon: '📷', title: 'AI Smart Monitoring', line: '"Count pedestrians with AI edge detection"',          color: '#ff007f', reason: 'Something is moving in the dark — train the cameras to spot the difference!' },
  12: { icon: '💧', title: 'Water Supply',        line: '"Train acoustic AI to find pipe leaks"',              color: '#00b7ff', reason: 'There is a leak underground — use sound to find it before the reservoir runs dry!' },
  13: { icon: '⚡', title: 'Power Grid',          line: '"Place data centers on optimal energy terrain"',      color: '#ffd166', reason: 'The grid is overheating — place data centers where the cooling is best!' },
  14: { icon: '♻️', title: 'Waste Sorters',      line: '"Label recyclable items to train AI vision"',         color: '#3ddc84', reason: 'The recycling belt is jammed — teach the AI to sort before the landfill overflows!' },
  15: { icon: '🔍', title: 'AI Subsurface Scanning', line: '"Fuse sensor signals to find buried hazards"',     color: '#ff8c2e', reason: 'A new building site might be unsafe — scan underground for hidden hazards!' },
  16: { icon: '🤖', title: 'Moving Around a Grid', line: '"Plan grid paths with limited visibility"',          color: '#c77bff', reason: 'The robot is lost in the fog — guide it step by step with limited vision!' },
  17: { icon: '🐝', title: 'Swarm Pathfinding',   line: '"Herd drone swarms through shifting hazard zones"',    color: '#ffd166', reason: 'A storm is shifting the no-fly zones — herd the drone swarm to safety!' },
  18: { icon: '✈️', title: 'Air Traffic Control', line: '"Steer jets with predictive ghost trails"',           color: '#c77bff', reason: 'Two jets are on a collision course — steer them clear with AI predictions!' },
};
export function questTheme(id) { return QUEST_THEMES[id] || { icon: '🎯', title: 'AI Mission', line: '"Complete the AI mission!"', color: '#00f2fe' }; }

export function questsForDistrict() {
  return QUESTS;
}

// ---- localStorage state ----
// In-memory cache: the 3D city reads quest state EVERY frame (beacon colours),
// and a synchronous localStorage.getItem + JSON.parse per frame stalls tablets.
// We read once, then refresh only when the state is known to change (save /
// questComplete / a storage event from another tab). `_dirty` lets callers
// force a fresh read (e.g. after a minigame writes directly to localStorage).
let _questCache = null;
let _questCacheValid = false;

function normalizeQuestState(s) {
  // Historical arrays are opaque records, not membership in today's UI registry.
  const clean = s && typeof s === 'object' && !Array.isArray(s) ? { ...s } : {};
  clean.completed = Array.isArray(clean.completed) ? clean.completed.slice() : [];
  clean.unlocked = Array.isArray(clean.unlocked) ? clean.unlocked.slice() : [];
  return clean;
}

export function loadQuestState() {
  if (_questCacheValid && _questCache) return _questCache;
  try {
    const raw = localStorage.getItem(QUEST_STATE_KEY);
    if (raw) {
      _questCache = normalizeQuestState(JSON.parse(raw));
      _questCacheValid = true;
      return _questCache;
    }
  } catch (e) { /* corrupted — fall through to default */ }
  // default: ALL quest buildings are available from the start (no login/save
  // yet), so students can visit every special building + the capstone freely.
  // Completions are still tracked (for skin-reward progression later).
  _questCache = { completed: [], unlocked: QUESTS.map(q => q.id) };
  _questCacheValid = true;
  return _questCache;
}
/** Invalidate the cache so the next loadQuestState() re-reads localStorage. */
export function invalidateQuestState() { _questCacheValid = false; }

export function saveQuestState(state) {
  try { localStorage.setItem(QUEST_STATE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  _questCache = normalizeQuestState(state);
  _questCacheValid = true;
}
export function questStatus(quest, state) {
  if (state.completed.includes(quest.id)) return 'completed';
  if (state.unlocked.includes(quest.id)) return quest.gameUrl ? 'unlocked' : 'coming_soon';
  return 'locked';
}
// Completing a quest unlocks the next game-ready quest (lowest id not yet open).
export function questComplete(state, questId) {
  const state2 = {
    completed: state.completed.includes(questId) ? state.completed : [...state.completed, questId],
    unlocked: state.unlocked.filter(id => id !== questId),
  };
  const next = QUESTS.find(q => q.gameUrl && !state2.completed.includes(q.id) && !state2.unlocked.includes(q.id));
  if (next) state2.unlocked.push(next.id);
  saveQuestState(state2);
  return state2;
}

// Keep the cache fresh when another tab writes quest state (e.g. a minigame
// page running same-origin). Same-origin storage events fire in OTHER tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === QUEST_STATE_KEY) invalidateQuestState();
  });
}

/** A Done tap records attendance only. Never alter completed/unlocked history.
 * Refuse malformed state instead of overwriting the child's raw saved section. */
export function recordLegacyActivity(questId, storage) {
  if (!Number.isInteger(questId) || questId < 1 || questId > 18) return false;
  try {
    storage ||= globalThis.localStorage;
    const raw = storage.getItem(QUEST_STATE_KEY);
    const state = raw === null ? { completed: [], unlocked: [] } : JSON.parse(raw);
    if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
    const activity = Array.isArray(state.activity) ? state.activity.slice(-63) : [];
    activity.push({ questId, action: 'done' });
    storage.setItem(QUEST_STATE_KEY, JSON.stringify({ ...state, activity }));
    invalidateQuestState();
    return true;
  } catch { return false; }
}
