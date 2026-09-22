import { CITY_LOOK_KEY } from './city-looks.js';
import { DAY_SKY_KEY } from './day-skies.js';
import { GROUND_TEXTURE_KEY } from './ground-textures.js';
import { TIME_KEY } from '../city-common/time-of-day.js';

// The example is a presentation preset, not part of a student's city data.
// Reapply it only when the bundled example is chosen; saved and imported cities
// continue to use the appearance preferences already in storage.
export const EXAMPLE_APPEARANCE = Object.freeze({
  cityLook: 'natural',
  daySky: 'natural-blue',
  groundTexture: 'asphalt',
  timeOfDay: 'sunset',
});

export function applyExampleAppearance(storage = globalThis.localStorage) {
  try {
    storage?.setItem(CITY_LOOK_KEY, EXAMPLE_APPEARANCE.cityLook);
    storage?.setItem(DAY_SKY_KEY, EXAMPLE_APPEARANCE.daySky);
    storage?.setItem(GROUND_TEXTURE_KEY, EXAMPLE_APPEARANCE.groundTexture);
    storage?.setItem(TIME_KEY, EXAMPLE_APPEARANCE.timeOfDay);
    return true;
  } catch {
    // The city still runs when browser storage is unavailable.
    return false;
  }
}
