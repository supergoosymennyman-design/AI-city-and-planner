import { mountProjectBar } from '../city-common/project-bar.js';
import { WORKSHOP_URL } from '../shared/links.js';

const frame = document.querySelector('#workshop-frame');
const status = document.querySelector('#workshop-status');
const external = document.querySelector('#open-workshop');
const target = new URL(WORKSHOP_URL);
target.searchParams.set('returnTo', new URL('../workshop/', location.href).href);
external.href = target.href;
frame.src = target.href;

let loaded = false;
frame.addEventListener('load', () => {
  loaded = true;
  status.textContent = 'Workshop connected. Camera and microphone prompts only appear when an activity needs them.';
});
setTimeout(() => {
  if (!loaded) status.innerHTML = `The Workshop is taking longer than expected. <a href="${external.href}" target="_blank" rel="noopener">Open it in a new tab</a>, or return to the Hub.`;
}, 12000);

mountProjectBar({ workspace: 'workshop' }).catch(() => {
  status.textContent = 'Workshop is available, but project navigation could not be loaded. Use Return to Hub above.';
});
