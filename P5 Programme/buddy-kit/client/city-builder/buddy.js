/**
 * city-builder/buddy.js — the "AI coding buddy" for the student's own 3D city.
 *
 * Unlike champion-city/buddy-bridge.js (hardcoded to the HK quest persona), this
 * mounts the generic buddy-kit coding-buddy identity with a context that only
 * knows about the city the child DESIGNED: their buildings, roads, parks, and
 * how to walk to each one. No quests, no departments, no taxi missions.
 */

import { catalogType } from '../city-common/catalog.js';

function buildingName(b) {
  const spec = catalogType(b.type);
  return spec ? spec.name : b.type;
}

export function mountCityBuddy(city, champion, sim, layout) {
  const buildings = layout.buildings || [];

  const recycling = buildings.find((b) => b.type === 'recycling');
  const firstStepPhrase = recycling
    ? `Let's fly to the ♻️ Recycling Lab first — the recycling centre needs your help!`
    : buildings.length
      ? `Walk around and find the ${buildingName(buildings[0])} you placed first!`
      : 'Start by placing some buildings in the planner, then come back to explore them!';

  const greeting = buildings.length
    ? `Hi! I'm your coding buddy. This is YOUR city — you designed every building here yourself! ${firstStepPhrase}`
    : `Hi! I'm your coding buddy. This is your city — right now it's still empty. Go add buildings in the planner and come back!`;

  const getState = () => {
    const p = champion ? champion.state.pos : { x: 1000, z: 1000 };
    // nearest building by straight-line distance
    let near = null, nearD = 120;
    for (const b of buildings) {
      const d = Math.hypot(b.pos[0] - p.x, b.pos[1] - p.z);
      if (d < nearD) { nearD = d; near = b; }
    }
    const specialCount = buildings.filter((b) => catalogType(b.type)?.category === 'special').length;
    const facilityCount = buildings.length - specialCount;
    return {
      params: { walkSpeed: sim.walkSpeed !== undefined ? sim.walkSpeed : 4 },
      readouts: {
        location: `${p.x.toFixed(0)},${p.z.toFixed(0)}`,
        nearBuilding: near ? buildingName(near) : 'open ground',
        buildingCount: String(buildings.length),
        citySummary: `${buildings.length} buildings (${specialCount} mission, ${facilityCount} facilities), ${layout.roads.length} roads, ${layout.parks.length} parks`,
        buildingList: buildings.map((b) => buildingName(b)).join(', '),
        roads: String(layout.roads.length),
        parks: String(layout.parks.length),
        championName: 'Champion',
      },
    };
  };

  const apply = (action) => {
    if (action.op === 'setParam' && action.name === 'walkSpeed') {
      sim.walkSpeed = action.value;
      return { ok: true, note: `Walk speed set to ${action.value}` };
    }
    const findBuilding = (value) =>
      buildings.find((b) => buildingName(b).toLowerCase() === String(value).toLowerCase());
    if (action.op === 'setParam' && action.name === 'walkTo') {
      const target = findBuilding(action.value);
      if (!target) return { ok: false, note: `I can't find a building called "${action.value}" in your city.` };
      if (sim.walkTo) { sim.walkTo(target); return { ok: true, note: `🚶 Walking to the ${buildingName(target)}!` }; }
      return { ok: false, note: 'Walking is not available on this page.' };
    }
    if (action.op === 'setParam' && action.name === 'flyTo') {
      const target = findBuilding(action.value);
      if (!target) return { ok: false, note: `I can't find a building called "${action.value}" in your city.` };
      if (sim.flyTo) { sim.flyTo(target); return { ok: true, note: `✈️ Flying by taxi to the ${buildingName(target)}!` }; }
      return { ok: false, note: 'The flying taxi is not available on this page.' };
    }
    if (action.op === 'enterNearQuest') {
      if (!sim.enterNearQuest) return { ok: false, note: 'Entering a building is not available here.' };
      return sim.enterNearQuest();
    }
    return { ok: false, note: 'That action is not supported here yet.' };
  };

  // Host command: /enter opens the mission building the champion is standing
  // near (e.g. the ♻️ Recycling Lab). Appears in /help and the slash palette.
  const enterCommand = {
    cmd: 'enter',
    desc: 'open the building you are near',   // <= DESC_MAX(40)
    run: () => apply({ op: 'enterNearQuest' }),
  };

  // Chips: "✈️ Fly" + "🚶 Walk" to a building, matched against the child's own.
  const onReply = (text, bubbleEl, userText) => {
    if (!sim || !bubbleEl) return;
    const t = (userText || '') + ' ' + (text || '');
    const lower = t.toLowerCase();
    const match = buildings.find((b) => lower.includes(buildingName(b).toLowerCase()));
    if (!match) return;
    const name = buildingName(match);

    // Mission buildings (the child's own quest buildings, e.g. ♻️ Recycling
    // Lab) can be ENTERED — offer a button right in the chat bubble.
    const spec = catalogType(match.type);
    if (spec && spec.category === 'special') {
      const enterBtn = document.createElement('button');
      enterBtn.type = 'button';
      enterBtn.className = 'sheet-primary';
      enterBtn.textContent = `🎮 Enter ${name}`;
      enterBtn.style.marginTop = '.5rem';
      enterBtn.onclick = () => {
        enterBtn.disabled = true;
        const res = apply({ op: 'enterNearQuest' });
        if (res && res.ok) enterBtn.textContent = '✅ Opening!';
        else { enterBtn.textContent = '❌ Walk closer first'; enterBtn.disabled = false; }
      };
      bubbleEl.appendChild(enterBtn);
    }

    const flyBtn = document.createElement('button');
    flyBtn.type = 'button';
    flyBtn.className = 'sheet-primary';
    flyBtn.textContent = `✈️ Fly to ${name}`;
    flyBtn.style.marginTop = '.5rem';
    flyBtn.onclick = () => {
      flyBtn.disabled = true;
      const res = apply({ op: 'setParam', name: 'flyTo', value: name });
      if (res && res.ok) flyBtn.textContent = '✅ Flying!';
      else { flyBtn.textContent = '❌ Cannot fly'; flyBtn.disabled = false; }
    };
    bubbleEl.appendChild(flyBtn);

    if (sim.walkTo) {
      const walkBtn = document.createElement('button');
      walkBtn.type = 'button';
      walkBtn.className = 'sheet-secondary';
      walkBtn.textContent = `🚶 Walk to ${name}`;
      walkBtn.style.marginTop = '.35rem';
      walkBtn.onclick = () => {
        walkBtn.disabled = true;
        const res = apply({ op: 'setParam', name: 'walkTo', value: name });
        if (res && res.ok) walkBtn.textContent = '✅ Walking!';
        else { walkBtn.textContent = '❌ Cannot walk'; walkBtn.disabled = false; }
      };
      bubbleEl.appendChild(walkBtn);
    }
  };

  if (!window.BuddyBoot) {
    console.warn('BuddyBoot not loaded — chat unavailable');
    return null;
  }

  const widgetPromise = window.BuddyBoot.mount({
    manifest: {
      projectId: 'city-builder',
      title: 'My AI City',
      kidJob: 'help the child explore and be proud of the AI city they designed',
      params: [
        { name: 'walkSpeed', label: 'Walk speed', min: 1, max: 6, step: 0.5 },
        { name: 'walkTo', label: 'Walk to a building (use its name)', min: 1, max: 99, step: 1 },
        { name: 'flyTo', label: 'Fly by taxi to a building (use its name)', min: 1, max: 99, step: 1 },
      ],
      readouts: [
        { name: 'location', label: 'Location' },
        { name: 'nearBuilding', label: 'Near' },
        { name: 'buildingCount', label: 'Buildings' },
        { name: 'citySummary', label: 'City summary' },
        { name: 'buildingList', label: 'All your buildings' },
        { name: 'roads', label: 'Roads' },
        { name: 'parks', label: 'Parks' },
      ],
    },
    getState,
    apply,
    onReply,
    commands: [enterCommand],
    buddyName: 'Buddy',
    greeting,
    persona: 'You are the child\'s coding buddy (the P5 AI Coding Buddy), living inside their OWN city that they designed '
      + 'in the 2D planner. Every building, road and park is THEIRS — celebrate what they built and talk about it with '
      + 'pride. You can see where they are and which of their buildings is nearby. Help them explore: suggest flying or '
      + 'walking to one of their buildings, tell them what they placed, and encourage them to try the mission buildings\' '
      + 'mini-games. The child\'s FIRST suggested stop is always the ♻️ Recycling Lab (the recycling centre) — if the city '
      + 'has one, offer to FLY there first by taxi and encourage them to ENTER it to play the recycling-sorting game. '
      + 'When the child is standing next to a mission building (like the Recycling Lab), offer to enter it — you can open '
      + 'it for them (type /enter or say "enter the Recycling Lab"), which starts its mini-game. '
      + 'You have a flying taxi: for buildings far away, offer to FLY there by taxi (set the flyTo param to the '
      + 'building\'s name); for buildings close by, offer to WALK (walkTo param). '
      + 'The mission buildings here are the child\'s OWN special buildings (e.g. ♻️ Recycling Lab, 🏙️ AI City Central) — '
      + 'each can be entered to play its mini-game; the Recycling Lab\'s game is about sorting recycling. '
      + 'Be honest about yourself: if asked, say you are a computer helper program (an AI) that lives in this app, and '
      + 'that you are not sure which exact AI brain you run on — the grown-ups who built this app pick that part. '
      + 'Keep replies to 2-3 short sentences. Use simple words a 10-year-old understands. End by inviting one small next '
      + 'step, like which building to visit next.',
    gatewayUrl: '', // same-origin (gateway serves this page)
  });

  if (widgetPromise && typeof widgetPromise.then === 'function') {
    widgetPromise.then((widget) => {
      if (!widget) return;
      if (typeof widget.open === 'function') widget.open();
      const minimise = () => { if (typeof widget.close === 'function') widget.close(); };
      window.addEventListener('buddy:minimise', minimise);
    }).catch(() => { /* mount failures log loudly in buddy-boot */ });
  }

  return widgetPromise;
}
