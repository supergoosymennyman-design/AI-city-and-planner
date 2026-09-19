import { GOAL_KEYS, normalizeWeights, METRIC_KEYS } from './metrics.js';

// Canonical editable values are relative importance in [0,1], never percentages.
// weights is reserved for legacy metric-only evidence that cannot be inverted.
export const MAYORS = {
  green: { name: 'Green Mayor', emoji: '🌳', values: { happy: .45, walkable: .30, peaceful: .15, spread: .10 } },
  healthy: { name: 'Healthy Mayor', emoji: '🚑', values: { happy: .50, walkable: .15, peaceful: .25, spread: .10 } },
  busy: { name: 'Busy Mayor', emoji: '🛍️', values: { happy: .30, walkable: .30, peaceful: .15, spread: .25 } },
  quiet: { name: 'Quiet Mayor', emoji: '🤫', values: { happy: .15, walkable: .15, peaceful: .40, spread: .30 } },
};
export const sliderToGoal = (value) => Math.max(0, Math.min(100, Number(value) || 0)) / 100;
export const goalToSlider = (value) => Math.round(value * 100);
export function defaultGoals() {
  return { version: 1, mode: 'default', mayorId: null, values: { happy: .3, walkable: .3, peaceful: .2, spread: .2 } };
}
export function mayorGoals(id) {
  return { version: 1, mode: 'mayor', mayorId: id, values: { ...MAYORS[id].values } };
}
export function effectiveGoalWeights(goals) {
  return goals.mode === 'default' ? null : goals.mode === 'legacy' ? goals.weights : goals.values;
}
export function readGoals(raw) {
  if (!raw || typeof raw !== 'object') return defaultGoals();
  const values = raw.values;
  if (raw.version === 1 && raw.mode === 'default') return defaultGoals();
  if (raw.version === 1 && values && GOAL_KEYS.every((k) => typeof values[k] === 'number' && Number.isFinite(values[k]) && values[k] >= 0 && values[k] <= 1)) {
    const valid = Object.fromEntries(GOAL_KEYS.map((k) => [k, values[k]]));
    const mayor = MAYORS[raw.mayorId];
    if (raw.mode === 'mayor' && mayor && GOAL_KEYS.every((k) => valid[k] === mayor.values[k])) return mayorGoals(raw.mayorId);
    if (raw.mode === 'custom') return { version: 1, mode: 'custom', mayorId: null, values: valid };
  }
  const weights = normalizeWeights(raw.weights);
  if (!weights) return defaultGoals();
  // A label is not proof of a persona. Preserve the effective blend verbatim
  // after validation, including blends that no four-goal choice can express.
  return { ...defaultGoals(), mode: 'legacy', weights: Object.fromEntries(METRIC_KEYS.map((k) => [k, weights[k] || 0])) };
}
export function serializeGoals(goals) {
  const persona = goals.mode === 'mayor' ? MAYORS[goals.mayorId] : null;
  return { ...goals, weights: normalizeWeights(effectiveGoalWeights(goals)),
    label: persona?.name || (goals.mode === 'default' ? 'Balanced' : goals.mode === 'legacy' ? 'Saved priorities' : 'Custom goals'),
    emoji: persona?.emoji || '⚖️' };
}
