// My AI City — Champion Hub launcher (dark dashboard).
// Renders scenario cards with accent-tinted SVG line icons and navigates to
// each app's own link. The portal is a pure launcher — identity stays per-app.
import { citySim } from './links.js';
const ICONS = {
  planner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>',
  city: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
  fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  workshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  ship: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  station: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg>',
  lab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>',
  hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
  scenarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
};

// The AI Journey trail — the honest spine of the programme (docs/ai-concept-map.md).
// These are the REAL, live steps a child takes: learn the recipes in the
// Academy, design + optimise in the Planner, walk the result in the 3D City.
// (The old scenario apps were removed from the product; this accordion no
// longer promises SOON content that does not exist.)
const AI_JOURNEY = [
  {
    id: 'academy', name: 'City Planning Academy', icon: 'workshop', accent: '#00E5FF',
    url: citySim('pregame/'),
    blurb: 'Learn the 4 recipes the planner uses',
  },
  {
    id: 'planner', name: 'City Planner', icon: 'planner', accent: '#00F2FE',
    url: citySim('planner/'),
    blurb: 'Design your city — then watch the AI improve it',
  },
  {
    id: 'city', name: '3D AI City', icon: 'city', accent: '#00FF9D',
    url: citySim('city-builder/'),
    blurb: 'Walk your own city as the champion',
  },
];

const CARDS = [
  {
    id: 'planner', name: 'City Planner', icon: 'planner', accent: '#00E5FF',
    url: citySim('planner/'),
    status: 'live', blurb: 'Design your city on the map',
  },
  {
    id: 'city', name: '3D AI City', icon: 'city', accent: '#00FF9D',
    url: citySim('city-builder/'),
    status: 'live', blurb: 'Walk your city as the champion',
  },
  {
    id: 'fit', name: 'Fit and Rig Studio', icon: 'fit', accent: '#FB7185',
    url: citySim('studio/'),
    status: 'live', blurb: 'Dress up your champion',
  },
  {
    id: 'workshop', name: 'AI Workshop', icon: 'workshop', accent: '#FF9100',
    url: citySim('workshop/'),
    status: 'live', blurb: 'Build AI skills for your city',
  },
];

const grid = document.getElementById('card-grid');

// Standard launcher cards (planner / city / fit / workshop).
for (const card of CARDS) {
  const el = document.createElement(card.status === 'live' ? 'a' : 'div');
  el.className = 'card' + (card.status === 'soon' ? ' soon' : '');
  el.style.setProperty('--accent', card.accent);
  if (card.status === 'live') {
    el.href = card.url;
    el.setAttribute('aria-label', `Open ${card.name}`);
  } else {
    el.setAttribute('aria-hidden', 'true');
  }
  el.innerHTML = `
    <div class="icon-zone" aria-hidden="true">${ICONS[card.icon]}</div>
    <div class="text-zone">
      <div class="card-name">${card.name}</div>
      <div class="card-blurb">${card.blurb}</div>
    </div>
    ${card.status === 'soon' ? '<span class="soon-badge">SOON</span>' : ''}
  `;
  grid.appendChild(el);
}

// The AI Journey accordion — ONE card that expands in place to reveal the
// programme's real learning path: Academy → Planner → 3D AI City. Each entry is
// a LIVE link to the same-origin app. This replaces the old "Scenarios"
// accordion whose four scenario apps were removed from the product.
function buildScenariosCard() {
  const wrap = document.createElement('div');
  wrap.className = 'scen-wrap';

  const header = document.createElement('button');
  header.className = 'card scen-head';
  header.setAttribute('aria-expanded', 'false');
  header.style.setProperty('--accent', '#00F2FE');
  header.innerHTML = `
    <div class="icon-zone" aria-hidden="true">${ICONS.scenarios}</div>
    <div class="text-zone">
      <div class="card-name">AI Journey</div>
      <div class="card-blurb">Academy → Planner → 3D City</div>
    </div>
    <span class="scen-caret" aria-hidden="true">▾</span>
  `;
  header.addEventListener('click', () => {
    const open = wrap.classList.toggle('open');
    header.setAttribute('aria-expanded', String(open));
  });

  const body = document.createElement('div');
  body.className = 'scen-body scen-journey';
  for (const s of AI_JOURNEY) {
    const card = document.createElement('a');
    card.className = 'scen-link';
    card.href = s.url;
    card.style.setProperty('--accent', s.accent);
    card.setAttribute('aria-label', `Open ${s.name}`);
    card.innerHTML = `
      <div class="icon-zone" aria-hidden="true">${ICONS[s.icon]}</div>
      <div class="text-zone">
        <div class="card-name">${s.name}</div>
        <div class="card-blurb">${s.blurb}</div>
      </div>
    `;
    body.appendChild(card);
  }
  // The four recipes, plainly named (no fake AI claims).
  const recipes = document.createElement('p');
  recipes.className = 'journey-recipes';
  recipes.textContent = 'The recipes the planner really runs: weighted score · coverage radius · shortest path · hill-climbing + Explore.';
  body.appendChild(recipes);

  wrap.appendChild(header);
  wrap.appendChild(body);
  grid.appendChild(wrap);
}

buildScenariosCard();
