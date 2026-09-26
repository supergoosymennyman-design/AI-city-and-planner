// src/rig/tests/motion-settings.spec.js
// `savedMotionSettings` must never throw when the document has no rig — that null
// case is what made the Studio's "Export for AI City" button silently dead for
// every unrigged model (the starter box included).
import { savedMotionSettings } from '../motion-settings.js';

export default function (c) {
  c('savedMotionSettings tolerates a null rig', savedMotionSettings(null) === null);
  c('savedMotionSettings tolerates a rig with no graph', savedMotionSettings({}) === null);
  c('savedMotionSettings tolerates a graph with no motion', (() => {
    const rig = { graph: { structureKey: () => 'k', motion: null } };
    return savedMotionSettings(rig) === null;
  })());

  c('savedMotionSettings returns the saved settings when the graph key matches', (() => {
    const settings = { forward: '+z', legs: [1, 2] };
    const rig = { graph: { structureKey: () => 'k', motion: { key: 'k', settings } } };
    return savedMotionSettings(rig) === settings;
  })());

  c('savedMotionSettings returns null when the graph has changed since the save', (() => {
    const rig = { graph: { structureKey: () => 'k2', motion: { key: 'k', settings: { forward: '+z' } } } };
    return savedMotionSettings(rig) === null;
  })());

  c('savedMotionSettings honours an explicit override even with no rig', (() => {
    const override = { forward: '+x' };
    return savedMotionSettings(null, override) === override;
  })());
}
