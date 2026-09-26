// src/rig/motion-settings.js
//
// One SAFE accessor for a rig's saved motion settings.
//
// A Studio document has no rig until the model is tapped to grow a skeleton —
// `StudioScene.rig` starts as `null` (scene.js). Any caller that reads
// `rig.graph.motion` while offering an export/duplicate/animate action therefore
// has to tolerate a missing rig (or a rig with no graph yet). Centralising the
// lookup here keeps that guard in one tested place instead of re-deriving an
// unguarded `rig.graph...` at each call site.
export function savedMotionSettings(rig, override = null) {
  if (override) return override;
  if (!rig?.graph || rig.graph.motion?.key !== rig.graph.structureKey()) return null;
  return rig.graph.motion.settings ?? null;
}
