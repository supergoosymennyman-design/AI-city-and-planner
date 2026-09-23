// web/coding agent/server/stream-screen.js
/**
 * Filter-in-the-pipe: the streaming equivalent of the gateway's one-shot output `screen()`. The
 * kid-safety filter must gate every character the child sees, but streaming shows text before the
 * full reply exists. This screens the ACCUMULATED reply on each delta and holds back a trailing
 * `margin` of characters, so a flagged phrase (every filter.js pattern is far shorter than the
 * default 64-char margin) is fully accumulated and screened BEFORE its region is ever forwarded —
 * a phrase split across deltas can never be partially shown. `screen` is injected (like
 * note-validate.js) so this stays pure/unit-testable without importing the real filter.
 * @param {(text:string)=>{ok:true}|{ok:false,reason:string,deflection:string}} screen
 * @param {number} [margin=64] chars held back behind the frontier; must be >= 1 and exceed the longest flagged
 *   phrase. Throws if margin < 1 or not a finite number. Screening the accumulation catches boundary-spanning matches;
 *   the margin guarantees the caught region was never forwarded.
 * @returns {{push:(delta:string)=>({forward:string}|{cut:true,deflection:string}),
 *            end:()=>({forward:string}|{cut:true,deflection:string}), text:()=>string, wasCut:()=>boolean}}
 */
export function createStreamScreen(screen, margin = 64) {
  if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 1) {
    throw new Error(`createStreamScreen: margin must be a finite number >= 1 (and, for real safety, >= the longest screen() pattern length); got ${margin}`);
  }
  let acc = '';
  let sent = 0;
  let cut = false;
  const flushTo = (frontier) => {
    const safeEnd = Math.max(sent, frontier);
    if (safeEnd <= sent) return { forward: '' };
    const forward = acc.slice(sent, safeEnd);
    sent = safeEnd;
    return { forward };
  };
  return {
    push(delta) {
      if (cut) return { cut: true };
      acc += String(delta || '');
      const v = screen(acc);
      if (!v.ok) { cut = true; return { cut: true, deflection: v.deflection }; }
      return flushTo(acc.length - margin); // hold back the trailing margin
    },
    end() {
      if (cut) return { cut: true };
      return flushTo(acc.length); // stream done — flush the held-back tail
    },
    text() { return acc; },
    wasCut() { return cut; },
  };
}
