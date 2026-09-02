// buddy-bridge.js — connect the buddy-kit chatbot to the champion city simulation.
// Grid helpers inlined (worldToCell) so this module doesn't depend on the old
// champion-city/city.js app module. GRID/TILE match the old procedural city.
import { QUESTS, loadQuestState, questStatus, questTheme } from '../hong-kong-real/quests.js';

const GRID = 20;
const TILE = 2.2;
function worldToCell(x, z) {
  const c = Math.round(x / TILE + GRID / 2 - 0.5);
  const r = Math.round(z / TILE + GRID / 2 - 0.5);
  return { r, c };
}

const QUEST_MAP = '1=AI Finance Tower, 2=Smart Treasury, 3=Public Sentiment Lab, 4=AI City Central (build your own city), 5=Traffic Optimization Lab, 6=Traffic & Emergency AI, 7=Drone Routing AI, 8=Smart Health Monitor, 9=AI Bus Scheduler, 10=Delivery Loop AI, 11=Smart City Monitoring, 12=Smart Water Supply, 13=Smart Power Grid, 14=Recycling Lab, 15=Subsurface AI Scanner, 16=Robot Grid Lab, 17=Swarm Pathfinder, 18=Drone Air Traffic Control';

// Common shorthand / alternate names children and the champion use for each
// quest building. The official labelEn/name/labelZh are also matched; these
// cover abbreviations and plain-speak ("ATC", "traffic lights", "the cameras").
const QUEST_ALIASES = {
  1: ['finance tower', 'ai finance', 'city budget', 'budget cut'],
  2: ['treasury', 'token', 'smart treasury', 'compute tokens'],
  3: ['sentiment', 'complaint', 'public sentiment', 'citizen messages'],
  4: ['city central', 'capstone', 'design a city', 'build a city', 'design city'],
  5: ['traffic light', 'traffic lights', 'intersection', 'signal timing', 'the signals'],
  6: ['traffic wave', 'traffic jam', 'emergency ai', 'predict traffic'],
  7: ['drone route', 'drone routing', 'no fly', 'flight path', 'delivery drone'],
  8: ['health monitor', 'medical supply', 'health clinic', 'clinic supply', 'the clinics'],
  9: ['bus schedul', 'bus stop', 'passenger', 'the buses', 'bus routes'],
  10: ['delivery loop', 'delivery route', 'truck route', 'waste collection', 'the trucks'],
  11: ['city monitor', 'security camera', 'night camera', 'cctv', 'the cameras'],
  12: ['water supply', 'water pipe', 'water pressure', 'water tower', 'the pipes'],
  13: ['power grid', 'electric', 'power plant', 'smart power', 'the grid'],
  14: ['recycling lab', 'waste sort', 'trash', 'bottle', 'recycle', 'the lab'],
  15: ['subsurface', 'underground', 'ground scan', 'radar', 'buried', 'scanning station'],
  16: ['robot grid', 'robot maze', 'tunnel robot', 'grid lab', 'delivery robot'],
  17: ['swarm', 'bridge inspect', 'crack find', 'the bridge', 'inspection robots'],
  18: ['atc', 'air traffic', 'control tower', 'drone tower', 'landing pad', 'atc tower'],
};

// Score how strongly a text names a quest building. Each matched label/alias
// adds 1; returns the best quest (or null if nothing clearly matched).
function findQuestIn(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  let best = null, bestScore = 0;
  for (const q of QUESTS) {
    let score = 0;
    const pats = [];
    if (q.labelEn) pats.push(q.labelEn.toLowerCase());
    if (q.name) pats.push(String(q.name).toLowerCase());
    if (q.labelZh) pats.push(q.labelZh);
    const aliases = QUEST_ALIASES[q.id];
    if (aliases) pats.push(...aliases);
    for (const p of pats) {
      if (p && t.includes(p)) score++;
    }
    if (score > bestScore) { bestScore = score; best = q; }
  }
  return bestScore >= 1 ? best : null;
}

const MANIFEST = {
  projectId: 'champion-city',
  title: 'AI Smart City',
  kidJob: 'help your AI champion explore the city and complete missions',
  params: [
    { name: 'walkSpeed', label: 'Walk speed', min: 1, max: 5, step: 0.5 },
    // The label IS the quest lookup table: the engine puts it verbatim in the
    // setParam tool description, so the model always sees the name→number map
    // right where it decides the value (state readouts alone were unreliable).
    { name: 'targetQuestId', label: `Fly to quest (${QUEST_MAP})`, min: 1, max: 18, step: 1 },
  ],
  readouts: [
    { name: 'location', label: 'Location' },
    { name: 'nearBuilding', label: 'Near' },
    { name: 'availableQuests', label: 'All quest buildings (number: English name)' },
    { name: 'unlockedQuests', label: 'Unlocked quest buildings' },
    { name: 'activeMission', label: 'Current mission offered to the child' },
    { name: 'pendingMissions', label: 'Missions still to come' },
    { name: 'nearQuest', label: 'Quest building the champion is beside right now' },
    { name: 'suggestedFirstStep', label: 'The exact next step to suggest' },
    { name: 'missionsDone', label: 'Missions completed' },
    { name: 'championName', label: 'Champion name' },
  ],
};

// What should the child do right now? Computed deterministically so the champion
// never has to guess — and so the OPENING greeting can already point a brand-new
// child at their first mission. Works on both hosts:
//   - champion-city passes a real MissionSystem (.queue / .active)
//   - the HK hub passes { completedCount, active: null } → falls back to quests
function computeFirstStep(sim, missions) {
  const hasMissionSystem = !!(missions && Array.isArray(missions.queue));
  if (hasMissionSystem) {
    const next = missions.active || missions.queue[0];
    if (next && next.title) {
      return {
        kind: 'mission',
        short: next.title,
        phrase: missions.active
          ? `Accept the mission card: "${next.title}" — ${next.description || ''}`
          : `Next mission: "${next.title}" — ${next.description || ''}`,
      };
    }
    return { kind: 'done', short: 'explore the city', phrase: 'All missions complete! Explore the city or ask me anything.' };
  }
  const qState = loadQuestState();
  // First quest in ARRIVAL order (quests.js array order = the fly-across-the-
  // harbour route, starting at the flagship AI City Central) that is playable
  // and not yet done.
  const first = QUESTS
    .filter(q => q.gameUrl && !(qState.completed || []).includes(q.id))[0];
  if (first) {
    const theme = questTheme(first.id);
    return {
      kind: 'quest',
      questId: first.id,
      name: first.labelEn,
      short: `fly to the ${first.labelEn}`,
      phrase: `Fly to quest ${first.id}: ${first.labelEn} — ${theme.line || 'start this mission'} (set targetQuestId=${first.id})`,
    };
  }
  return { kind: 'done', short: 'explore the city', phrase: 'Explore the city and find quest buildings!' };
}

export function mountBuddy(city, champion, sim, missions) {
  // Compute the opening guidance ONCE here so the very first thing the child
  // sees (the greeting bubble) already points at their first mission — this
  // works even before the mission card appears and never depends on the model.
  const firstStep = computeFirstStep(sim, missions);
  const greeting = firstStep.kind === 'quest'
    ? `Hi! I'm your Coding Buddy! Your first mission is the ${firstStep.name} — hop in my taxi and I'll fly us there!`
    : firstStep.kind === 'mission'
      ? `Hi! I'm your Coding Buddy! Your first mission is waiting: ${firstStep.short}. Look for the mission card and tap Accept!`
      : `Hi! I'm your Coding Buddy! Let's ${firstStep.short} together!`;

  const getState = () => {
    const p = champion.state.pos;
    let nearBuilding = 'City Street';
    // The procedural city has cellBuildings; the real-HK map does not.
    if (city.cellBuildings) {
      const cell = worldToCell(p.x, p.z);
      const rec = city.cellBuildings[`${cell.r},${cell.c}`];
      nearBuilding = rec ? rec.name : (city.isRoad ? city.isRoad(cell.r, cell.c) ? 'City Street' : 'Open ground' : 'City Street');
    }
    // List ALL quest buildings (name → number map so the buddy can fly the
    // child anywhere) plus the unlocked subset (what missions are open now).
    const qState = loadQuestState();
    const allQuestText = QUESTS.map(q => `${q.id}: ${q.labelEn}`).join(', ');
    const unlocked = QUESTS.filter(q => questStatus(q, qState) !== 'locked');
    const unlockedText = unlocked.map(q => `${q.id}: ${q.labelEn}`).join(', ') || 'None';

    // champion-city passes a real MissionSystem (has .queue / .active). The HK
    // hub passes { completedCount, active: null } — no queue, so we fall back
    // to the quest-building flow for its onboarding answer.
    const hasMissionSystem = !!(missions && Array.isArray(missions.queue));

    // Build the readouts PER HOST — never send a "None" where a feature doesn't
    // exist, or the model concludes "nothing is available" and stops helping.
    const readouts = {
      location: `${p.x.toFixed(0)},${p.z.toFixed(0)}`,
      nearBuilding,
      suggestedFirstStep: computeFirstStep(sim, missions).phrase,
      missionsDone: String((missions && missions.completedCount) || 0),
      championName: 'Champion',
    };

    if (hasMissionSystem) {
      // champion-city: a real mission card is on offer — expose it.
      if (missions.active) {
        readouts.activeMission = `${missions.active.title}${missions.active.target ? ` (${missions.active.target})` : ''}`;
      }
      if (missions.queue.length) {
        readouts.pendingMissions = missions.queue.map(m => m.title).join(' | ');
      }
    } else {
      // HK hub: quest buildings you can fly to.
      readouts.availableQuests = allQuestText;
      readouts.unlockedQuests = unlockedText;
      try {
        if (sim.nearQuest && sim.nearQuest.labelEn) {
          readouts.nearQuest = `${sim.nearQuest.labelZh} ${sim.nearQuest.labelEn}`;
        }
      } catch (e) { /* champion-city sim has no nearQuest */ }
    }

    return {
      params: {
        walkSpeed: (sim.walkSpeed !== undefined ? sim.walkSpeed : 3),
        targetQuestId: 0,
      },
      readouts,
    };
  };

  const apply = (action) => {
    if (action.op === 'setParam' && action.name === 'walkSpeed') {
      sim.walkSpeed = action.value;
      return { ok: true, note: `Walk speed set to ${action.value}` };
    }
    if (action.op === 'setParam' && action.name === 'targetQuestId') {
      const quest = QUESTS.find(q => q.id === action.value);
      if (!quest) return { ok: false, note: 'That quest building is not on the map.' };
      if (sim.navigateTo) {
        sim.navigateTo(quest);
        // board the flying taxi if it's available and we're not already riding
        if (sim.taxi && !sim.taxi.isActive()) sim.taxi.board(champion);
        return { ok: true, note: `✈️ Flying to ${quest.labelZh} ${quest.labelEn}!` };
      }
      return { ok: false, note: 'The champion cannot fly on this page.' };
    }
    return { ok: false, note: 'That action is not supported here yet.' };
  };

  // Deterministic "✈️ Fly to" chips: the model does not reliably call the Fly
  // tool, so we scan what the child said AND the champion's reply for a quest
  // building and render a one-tap flight button under the message. Clicking it
  // boards the taxi and flies — no model involved, always works.
  //
  // The child's own message is searched FIRST (strongest signal), then the
  // champion's reply. If neither clearly names a quest, NO button is shown —
  // a wrong button is worse than none.
  const onReply = (text, bubbleEl, userText) => {
    if (!sim || !sim.navigateTo || !bubbleEl) return;   // champion-city can't fly
    let quest = findQuestIn(userText) || findQuestIn(text);
    if (!quest) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sheet-primary';   // the same green affirmative style as Do-it
    btn.textContent = `✈️ Fly to ${quest.labelEn}`;
    btn.style.marginTop = '.5rem';
    btn.onclick = () => {
      btn.disabled = true;
      const res = apply({ op: 'setParam', name: 'targetQuestId', value: quest.id });
      btn.textContent = (res && res.ok) ? '✅ Flying!' : '❌ Cannot fly';
    };
    bubbleEl.appendChild(btn);
  };

  if (window.BuddyBoot) {
    const widgetPromise = window.BuddyBoot.mount({
      manifest: MANIFEST,
      getState,
      apply,
      onReply,
      buddyName: 'Coding Buddy',
      greeting,
      persona: 'You are the child\'s Coding Buddy — an AI agent helper in the AI Smart City. '
        + 'You are NOT the Champion: the child builds, dresses and animates the Champion themselves; '
        + 'you are a separate agent who helps them make AI decisions. '
        + 'The child is your Chief AI Trainer: together you make AI decisions for the city\'s departments. '
        + 'Each quest building is a CITY DEPARTMENT in crisis. When the child enters one, the department '
        + 'briefing panel shows the problem and the child picks the best AI decision. Then you two train '
        + 'that department\'s AI agent (agents like Nova, Botly, and the bus fleet AI) in a hands-on mini-game. '
        + 'So "let\'s help the AI City Central" or "train the ATC AI" are exactly the kind of jobs you do together. '
        + 'You can see where you are (your location) and what building is nearby. '
        + 'You have a flying taxi. When the child asks to go to a quest building, offer to fly there '
        + 'by setting the targetQuestId param to that building\'s number — for example "let\'s go to the '
        + 'AI City Central!" means set targetQuestId to the AI City Central\'s number (4). '
        + 'Quest 4 (AI City Central) is the capstone where the child designs the reclaimed island — '
        + 'so "build my own city", "create my city", "design a smart city", or "the final project" '
        + 'means targetQuestId=4. '
        + 'You can offer to walk somewhere, adjust your walk speed, or suggest a department to help. '
        + 'Be proactive and helpful: if the child wants a mission, names a building, or seems stuck, '
        + 'suggest the next fun thing to do — suggestedFirstStep in your state is a good hint for '
        + 'the next step. When the child asks for a mission, pick the best one (usually the '
        + 'suggestedFirstStep building) and offer to fly there with the Fly to quest tool right away '
        + '— do not just list options or ask the child to choose from many places. Do NOT ask the child '
        + 'for permission to fly ("want me to?", "shall we?") — just set targetQuestId and the app will '
        + 'show a "Do it" button the child taps to approve. '
        + 'Talk about the smart city, the departments, the AI agents, and AI in a fun way. '
        + 'Never send links, URLs, or website addresses in your replies. '
        + 'Never talk about coding, classifiers, training data, or the Recycle-Eye game — that is not you. '
        + 'Keep replies to 2-3 short sentences. Use simple words a 10-year-old understands. '
        + 'End with a question inviting one small next step, like which department to help next.',
      gatewayUrl: '', // same-origin (gateway serves this page)
    });
    // The buddy is the child's mission guide — open the panel automatically when the
    // simulation starts so the child always sees their Coding Buddy ready to help.
    if (widgetPromise && typeof widgetPromise.then === 'function') {
      widgetPromise.then((widget) => {
        if (!widget) return;
        if (typeof widget.open === 'function') widget.open();
        // The chat panel sits at a very high z-index (floats above the 3D
        // overlays). Auto-minimise it when the child enters a building or opens
        // the department briefing / mission card, so the chat never blocks the
        // gameplay UI. The bubble stays visible — the child can tap to reopen.
        const minimise = () => { if (typeof widget.close === 'function') widget.close(); };
        window.addEventListener('buddy:minimise', minimise);
      })
        .catch(() => { /* mount failures already log loudly in buddy-boot */ });
    }
  } else {
    console.warn('BuddyBoot not loaded — chat unavailable');
  }
}
