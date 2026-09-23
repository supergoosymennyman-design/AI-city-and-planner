/** Choose the same-origin City destination after an explicit Studio transfer. */
export function cityReturnRoute(savedLayout) {
  let hasPlan = false;
  try {
    const plan = JSON.parse(savedLayout);
    hasPlan = !!plan && Array.isArray(plan.buildings) && Array.isArray(plan.roads);
  } catch { /* missing or malformed plan opens the isolated example */ }
  return hasPlan ? '../city-builder/?resume=1&champion=studio' : '../city-builder/?example=1&champion=studio';
}
