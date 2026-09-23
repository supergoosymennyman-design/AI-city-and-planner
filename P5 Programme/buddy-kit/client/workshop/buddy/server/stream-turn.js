// web/coding agent/server/stream-turn.js
/**
 * Orchestrates ONE streaming buddy turn: consume the model engine's event stream, screen+forward text
 * deltas as frames, and once the stream goes idle finalize (actions + meter + final screen) into a
 * single `done` frame. Every engine-shaped concern is injected (event selectors, streamScreen,
 * finalize) so this relay/screen/finalize sequence is fully unit-testable offline with a fake event
 * generator — `engine.js` adapts the real AI-SDK stream to this same injected-selector contract.
 * @param {{events:AsyncIterable, streamScreen:object, isPartForUs:(ev)=>boolean, deltaOf:(ev)=>string,
 *          isIdle:(ev)=>boolean, finalize:(fullText:string)=>Promise<object>}} deps
 * @param {(frame:object)=>void} write - frame sink.
 * @returns {Promise<{done:true}|{cut:true}>}
 */
export async function runStreamingTurn(deps, write) {
  const { events, streamScreen, isPartForUs, deltaOf, isIdle, finalize } = deps;
  const relay = (r) => {
    if (r.cut) { write({ type: 'cut', deflection: r.deflection }); return true; }
    if (r.forward) write({ type: 'delta', text: r.forward });
    return false;
  };
  for await (const ev of events) {
    if (isPartForUs(ev)) { if (relay(streamScreen.push(deltaOf(ev)))) return { cut: true }; }
    else if (isIdle(ev)) break;
  }
  if (relay(streamScreen.end())) return { cut: true };
  const fin = await finalize(streamScreen.text());
  write({ type: 'done', ...fin });
  return { done: true };
}
