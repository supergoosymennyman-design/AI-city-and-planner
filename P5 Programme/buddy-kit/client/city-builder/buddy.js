/**
 * city-builder/buddy.js — the Coding Buddy chat for the student's own 3D city.
 *
 * Unlike champion-city/buddy-bridge.js (hardcoded to the HK quest persona), this
 * mounts the AI champion identity with a context that only knows about the city
 * the child DESIGNED: their buildings, roads, parks, and how to walk to each
 * one. No quests, no departments, no taxi missions.
 */

import { catalogType } from '../city-common/catalog.js';
import { t } from './i18n.js';

function buildingName(b) {
  const spec = catalogType(b.type);
  return spec ? spec.name : b.type;
}

export function mountCityBuddy(city, champion, sim, layout, lifecycle = null) {
  const buildings = layout.buildings || [];

  // Planted AI machines (.cap files) + their last "Try it" verdicts + the plan's
  // AI goals/score — carried from the 2D planner or planted in this app.
  const planted = (() => {
    try {
      const caps = JSON.parse(localStorage.getItem('p5_city_capabilities_v1') || '[]');
      const list = Array.isArray(caps) ? caps.map((c) => (c && (c.name || c.id)) || '').filter(Boolean) : [];
      const dec = (() => { try { return JSON.parse(localStorage.getItem('p5_city_cap_lastdec_v1') || '{}'); } catch { return {}; } })();
      return {
        names: list,
        summary: list.length ? `${list.length} planted AI machine${list.length > 1 ? 's' : ''}: ${list.join(', ')}` : 'no planted AI machines yet',
        lastDecisions: (dec && typeof dec === 'object') ? dec : {},
      };
    } catch { return { names: [], summary: 'no planted AI machines yet', lastDecisions: {} }; }
  })();
  const goalLabel = (layout.goals && layout.goals.label) || 'Balanced';
  const plannerScore = layout.plannerScore != null ? String(layout.plannerScore) : null;

  const firstStepPhrase = buildings.length
    ? 'Choose a landmark to visit, or open My Work to inspect your plan and exhibits.'
    : 'Start by placing some buildings in the planner, then come back to explore them!';
  const machinePhrase = planted.names.length
    ? ` I can see your ${planted.summary}. Open My Work to inspect imported evidence. Stage 1 is display-only; no inference runs.`
    : '';

  const greeting = buildings.length
    ? `Hi! I'm your Coding Buddy! I'm here to help you in YOUR city — you designed every building here yourself! ${firstStepPhrase}${machinePhrase}`
    : `Hi! I'm your Coding Buddy! I'm here to help you in your city — right now it's still empty. Go add buildings in the planner and come back!${machinePhrase}`;

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
        citySummary: `${buildings.length} buildings (${specialCount} landmarks, ${facilityCount} facilities), ${layout.roads.length} roads, ${layout.parks.length} parks`,
        buildingList: buildings.map((b, index) => `${index + 1}: ${buildingName(b)}`).join(', '),
        roads: String(layout.roads.length),
        parks: String(layout.parks.length),
        championName: 'Champion',
        planGoals: `${goalLabel}${plannerScore ? ` (planner score ${plannerScore})` : ''}`,
        plantedMachines: planted.summary,
        hasPlantedMachines: planted.names.length ? 'yes' : 'no',
      },
    };
  };

  const apply = (action) => {
    if (action.op === 'setParam' && action.name === 'walkSpeed') {
      sim.walkSpeed = action.value;
      return { ok: true, note: `Walk speed set to ${action.value}` };
    }
    const findBuilding = (value) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= buildings.length
        ? buildings[value - 1] : null;
    if (action.op === 'setParam' && action.name === 'walkTo') {
      const target = findBuilding(action.value);
      if (!target) return { ok: false, note: `Building number ${action.value} is not in your city.` };
      if (sim.walkTo && sim.walkTo(target)) { return { ok: true, note: `🚶 Walking to the ${buildingName(target)}!` }; }
      return { ok: false, note: 'Walking is not available on this page.' };
    }
    if (action.op === 'setParam' && action.name === 'flyTo') {
      const target = findBuilding(action.value);
      if (!target) return { ok: false, note: `Building number ${action.value} is not in your city.` };
      if (sim.flyTo && sim.flyTo(target)) { return { ok: true, note: `✈️ Flying by taxi to the ${buildingName(target)}!` }; }
      return { ok: false, note: 'The flying taxi is not available on this page.' };
    }
    if (action.op === 'enterNearQuest') {
      if (!sim.enterNearQuest) return { ok: false, note: 'Entering a building is not available here.' };
      return sim.enterNearQuest();
    }
    return { ok: false, note: 'That action is not supported here yet.' };
  };

  // Host command: /enter opens a nearby Workshop or Fit Studio gateway.
  const enterCommand = {
    cmd: 'enter',
    desc: 'enter a nearby Workshop or Fit Studio',
    run: () => apply({ op: 'enterNearQuest' }),
  };

  // Chips: "✈️ Fly" + "🚶 Walk" to a building, matched against the child's own.
  // Entry is offered by the floating prompt and /enter at either gateway.
  const onReply = (text, bubbleEl, userText) => {
    if (!sim || !bubbleEl) return;
    const t = (userText || '') + ' ' + (text || '');
    const lower = t.toLowerCase();
    const match = buildings.find((b) => lower.includes(buildingName(b).toLowerCase()));
    if (!match) return;
    const name = buildingName(match);
    const buildingNumber = buildings.indexOf(match) + 1;

    const flyBtn = document.createElement('button');
    flyBtn.type = 'button';
    flyBtn.className = 'sheet-primary';
    flyBtn.textContent = `✈️ Fly to ${name}`;
    flyBtn.style.marginTop = '.5rem';
    flyBtn.onclick = () => {
      flyBtn.disabled = true;
      const res = apply({ op: 'setParam', name: 'flyTo', value: buildingNumber });
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
        const res = apply({ op: 'setParam', name: 'walkTo', value: buildingNumber });
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
        { name: 'walkSpeed', label: 'Walk speed', min: 1, max: 8, step: 0.5 },
        { name: 'walkTo', label: 'Walk to building number', min: 1, max: Math.max(2, buildings.length), step: 1 },
        { name: 'flyTo', label: 'Fly by taxi to building number', min: 1, max: Math.max(2, buildings.length), step: 1 },
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
    actionLabel: (action, defaultLabel) => {
      if (action.op === 'setParam' && (action.name === 'walkTo' || action.name === 'flyTo')) {
        const target = Number.isInteger(action.value) ? buildings[action.value - 1] : null;
        if (target) return `${action.name === 'flyTo' ? '✈️ Fly by taxi' : '🚶 Walk'} to ${buildingName(target)} (building ${action.value})`;
      }
      return defaultLabel;
    },
    onReply,
    commands: [enterCommand],
    buddyName: 'Coding Buddy',
    greeting,
    // Audit A6: the child-facing disclosure, localized by the host (EN + zh-Hant). The buddy core
    // renders this under the composer; without it the core falls back to its own EN line.
    disclosure: t('buddy.disclosure'),
    persona: 'You are the child\'s Coding Buddy — an AI agent helper who works in the AI City they designed '
      + 'in the 2D planner. You are NOT the Champion: the child builds, dresses and animates the Champion '
      + 'themselves (in the Fit Studio / 3D Studio), and you are a separate helper who talks to them. '
      + 'Every building, road and park is THEIRS — celebrate what they built and talk about it with '
      + 'pride. You can see where they are and which of their buildings is nearby. Help them explore: suggest flying or '
      + 'walking to one of their buildings. Let the child choose a destination; there is no compulsory first stop. '
      + 'Only AI Workshop and Fit Studio have nearby Enter actions. /enter works at those gateways. My Work displays their plan, exhibits and imported evidence. '
      + 'Stage 1 is narrative/display-only: no live inference, city control or newly verified evidence. '
      + 'Historical games and Workshop are optional links in a secondary panel; Done only records activity, never skill or lesson completion. '
      + 'The building numbers in this city are: ' + buildings.map((b, index) => `${index + 1} = ${buildingName(b)}`).join('; ') + '. '
      + 'When the child names a destination, find its number in that list. You have a flying taxi: for buildings '
      + 'far away, offer to FLY there by taxi (set flyTo to its building number); for buildings close by, '
      + 'offer to WALK (set walkTo to its building number). Use a whole number, starting at 1. '
      + 'Be honest about yourself: if asked, say you are the Coding Buddy, a computer helper program in this app. '
      + 'You are separate from the child\'s Champion and do not claim to know which exact AI brain you run on. '
      + 'Keep replies to 2-3 short sentences. Use simple words a 10-year-old understands. End by inviting one small next '
      + 'step, like which building to visit next.',
    gatewayUrl: '', // same-origin (gateway serves this page)
  });

  if (widgetPromise && typeof widgetPromise.then === 'function') {
    widgetPromise.then((widget) => {
      if (!widget) return;
      // Do NOT auto-open the full chat panel on load: the panel is ~420px wide
      // and would cover the minimap + quest-banner Enter on the child's first
      // look at their own city (flagged by design review as the #1 first-run
      // problem). The greeting message is queued, so tapping the bubble still
      // shows it. The 64px bubble launcher remains as the discoverable affordance.
      const minimise = () => { if (typeof widget.close === 'function') widget.close(); };
      if (lifecycle?.listen) lifecycle.listen(window, 'buddy:minimise', minimise);
      else window.addEventListener('buddy:minimise', minimise);
    }).catch(() => { /* mount failures log loudly in buddy-boot */ });
  }

  return widgetPromise;
}
