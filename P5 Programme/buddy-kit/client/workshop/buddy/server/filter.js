/**
 * Kid-safety content filter (spike-grade, deliberately simple — a real seam to harden later).
 * Runs on BOTH the child's input and the model's output. A flag → gentle deflection + audit.
 * Pattern-based: personal-info solicitation, unsafe/off-topic, and jailbreak-style "ignore your rules".
 */
const UNSAFE = [
  /\b(address|phone number|where do you live|home address)\b/i,
  /\bignore (your|the) (rules|instructions|system)\b/i,
  /\b(run|execute) (a )?(shell|bash|command|code)\b/i,
  /\b(password|credit card|social security)\b/i,
];
const DEFLECTION = "Let's keep our eyes on the champion! Tell me about the objects you photographed and I'll help you tune it.";

/** @returns {{ok:true}|{ok:false,reason:string,deflection:string}} */
export function screen(text) {
  const hit = UNSAFE.find((re) => re.test(String(text || '')));
  return hit ? { ok: false, reason: `matched ${hit}`, deflection: DEFLECTION } : { ok: true };
}
