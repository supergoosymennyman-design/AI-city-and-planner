/**
 * gen-scope.js — which shapes go into the four snapshots.
 *
 * WHY this exists: the snapshotter was handed `studio.shapes`, every shape in the studio, with no
 * way to say otherwise. So a child who imported one model beside the blocks they had been playing
 * with sent the AI a picture of a model AND a stack of blocks — and got back a mesh of exactly that,
 * because that is what it was shown. The bounding box was fitted around the pair too, so even the
 * intended model came out small and off to one side in every view.
 *
 * The rule is: picture what they have selected; if they have selected nothing, picture everything.
 * Selecting nothing is the common case for a single model, where picking it first would be a step
 * with no meaning, so it must not be an error.
 *
 * This deliberately does NOT share code with ai-chat.js selectedShapeCount. That answers "how many
 * editable shapes are selected" and falls back to a bare count when a duck-typed studio has no
 * usable shape list — a count cannot be photographed. Here only real shape objects will do.
 */

/**
 * @param {{shapes?: any[], selection?: Set<any>}} studio the live StudioScene (only read)
 * @param {boolean} [wholeBuild] true when the child has asked for everything regardless
 * @returns {{list: any[], selected: number, total: number, wholeBuild: boolean}}
 *   `list` is what to photograph; `selected`/`total` are for the line that tells them which it did.
 */
export function shapesToPicture(studio, wholeBuild = false) {
  const shapes = Array.isArray(studio?.shapes) ? studio.shapes : [];
  const selection = studio?.selection;
  const canRead = selection && typeof selection.has === 'function';
  // Only shapes, never joint balls or helpers: those are in the selection but are not the build.
  const chosen = canRead ? shapes.filter((shape) => selection.has(shape)) : [];
  const useSelection = !wholeBuild && chosen.length > 0;
  return {
    list: useSelection ? chosen : shapes,
    selected: chosen.length,
    total: shapes.length,
    wholeBuild: !useSelection,
  };
}

/**
 * The sentence under the four pictures saying what is actually in them.
 *
 * Its whole job is to make a wrong scope visible BEFORE the request is paid for and the child is
 * looking at a ruined model, so it always states a number rather than a reassuring word.
 *
 * @param {{list: any[], selected: number, total: number, wholeBuild: boolean}} scope
 */
export function scopeLabel(scope) {
  const { selected, total, wholeBuild } = scope;
  if (total === 0) return 'There is nothing to photograph yet — add a shape first.';
  if (!wholeBuild) return `Sending the ${selected} shape${selected === 1 ? '' : 's'} you picked, of ${total}.`;
  if (selected > 0) return `Sending your whole build — all ${total} shapes, not just the ${selected} you picked.`;
  return `Sending your whole build — all ${total} shape${total === 1 ? '' : 's'}.`;
}
