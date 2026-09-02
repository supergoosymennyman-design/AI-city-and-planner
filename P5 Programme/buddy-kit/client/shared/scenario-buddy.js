// shared/scenario-buddy.js — mount the AI CHAMPION chat for any scenario.
// The chat speaks as the child's Coding Buddy — an AI agent helper — in the context
// of the scenario config (lab, spaceship, station…). AI replies need the
// /api/turn gateway (deployed worker); the bubble still mounts on static.
import { libraryItem } from '../city-common/library.js';

export function mountScenarioBuddy(buddy, champion, grab, toast) {
  if (!window.BuddyBoot) {
    console.warn('[scenario] BuddyBoot not loaded — chat unavailable');
    return null;
  }

  const getState = () => {
    const p = champion ? champion.state.pos : { x: 0, z: 0 };
    let near = null, nearD = 6;
    if (grab) {
      for (const g of grab.grabbables) {
        const d = g.position.distanceTo(p);
        if (d < nearD) { nearD = d; near = g.userData.libraryId; }
      }
    }
    const readouts = {
      location: `${p.x.toFixed(0)},${p.z.toFixed(0)}`,
      nearObject: near ? (libraryItem(near) ? libraryItem(near).name : 'something nearby') : 'nothing nearby',
      objectCount: grab ? String(grab.grabbables.length) : '0',
      ...(buddy.extraReadouts ? buddy.extraReadouts() : {}),
    };
    return { params: {}, readouts };
  };

  const apply = (action) => {
    if (action.op === 'toast' && action.text) {
      toast(`💬 ${action.text}`);
      return { ok: true, note: 'Message shown!' };
    }
    return { ok: false, note: 'That action is not supported here yet.' };
  };

  const widgetPromise = window.BuddyBoot.mount({
    manifest: {
      projectId: buddy.projectId || 'scenario',
      title: buddy.title || 'My Lab',
      kidJob: buddy.kidJob || 'help the child explore and experiment',
      params: buddy.params || [{ name: 'toast', label: 'Show a little message', min: 1, max: 99, step: 1 }],
      readouts: buddy.readouts || [
        { name: 'location', label: 'Location' },
        { name: 'nearObject', label: 'Near' },
        { name: 'objectCount', label: 'Objects' },
      ],
    },
    getState,
    apply,
    buddyName: 'Coding Buddy',
    greeting: buddy.greeting || "Hi! I'm your Coding Buddy! Let's explore!",
    persona: buddy.persona || "You are the child's Coding Buddy — an AI agent helper. "
      + "You are NOT the Champion: the child builds and dresses the Champion themselves; you are a separate "
      + "helper who talks to them. Talk to the child about what they can do here, keep replies to 2-3 short "
      + "sentences with simple words a 10-year-old understands, and end by inviting one small next step.",
    gatewayUrl: '',
  });

  if (widgetPromise && typeof widgetPromise.then === 'function') {
    widgetPromise.then((widget) => {
      if (!widget || typeof widget.open !== 'function') return;
      widget.open();
      const minimise = () => { if (typeof widget.close === 'function') widget.close(); };
      window.addEventListener('buddy:minimise', minimise);
    }).catch(() => { /* mount failures log loudly in buddy-boot */ });
  }

  return widgetPromise;
}
