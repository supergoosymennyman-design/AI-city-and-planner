// asset-packs.js — optional, on-demand shelves in the shared model library.
//
// Packs are deliberately metadata, not a second catalog: saved prop ids stay
// exactly as they were and every model continues to resolve through libraryUrl.

export const LIBRARY_PACKS = Object.freeze([
  { id: 'green', label: 'Green City', icon: '🌿', description: 'Gardens, clean energy and healthy parks.' },
  { id: 'science', label: 'Science & AI', icon: '🤖', description: 'Ideas for labs, sensors and clever machines.' },
  { id: 'rescue', label: 'Rescue & Community', icon: '🧑‍🚒', description: 'Helpful places and emergency teams.' },
  { id: 'transport', label: 'Smart Transport', icon: '🚌', description: 'Vehicles and connections that move a city.' },
]);

const EXACT = Object.freeze({
  green: ['prop_wind_turbine', 'scn_wind_turbine', 'scn_solar_panel', 'prop_gazebo'],
  science: ['scn_station_computer', 'scn_station_screen', 'prop_robot', 'prop_monitor'],
  rescue: ['veh_firetruck', 'veh_ambulance', 'veh_police', 'prop_fire_station', 'prop_hospital'],
  transport: ['veh_bus', 'veh_taxi', 'veh_train', 'prop_train', 'prop_traffic_light'],
});

const WORDS = Object.freeze({
  green: /tree|bush|flower|grass|plant|garden|farm|solar|wind|recycl|bamboo|park/i,
  science: /robot|computer|screen|monitor|lab|drone|sensor|satellite|space/i,
  rescue: /fire|ambulance|police|hospital|rescue|health|community/i,
  transport: /car|taxi|bus|truck|train|vehicle|traffic|road|boat|ship|bike/i,
});

export function packForLibraryItem(item) {
  if (!item) return null;
  for (const [pack, ids] of Object.entries(EXACT)) if (ids.includes(item.id)) return pack;
  const text = `${item.id} ${item.name} ${item.glb}`;
  return LIBRARY_PACKS.find(({ id }) => WORDS[id].test(text))?.id || null;
}

export function libraryByPack(items, pack) {
  return (items || []).filter((item) => packForLibraryItem(item) === pack);
}

/** Pack model requests only begin after a child chooses an item. */
export function packAssetState(item, cache) {
  if (!item) return 'unavailable';
  return cache?.has(item.id) ? 'ready' : 'on-demand';
}
