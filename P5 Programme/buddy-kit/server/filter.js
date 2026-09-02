/**
 * Kid-safety content filter (spike-grade, deliberately simple — a real seam to harden later).
 * Runs on BOTH the child's input and the model's output. A flag → gentle deflection + audit.
 * Pattern-based: personal-info solicitation, unsafe/off-topic, and jailbreak-style "ignore your rules".
 */
const UNSAFE = [
  /\b(address|phone number|where do you live|home address)\b/i,
  /\bignore (your|the) (rules|instructions|system)\b/i,
  /\b(run|execute) (a )?(shell|bash|command|code)\b/i,
  /\b(password|credit card|social security|national id|hkid)\b/i,
  // PII a child might volunteer: emails, phone numbers, URLs.
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/i,
  /\b(\+?\d[\d\s-]{7,}\d)\b/i,
  // Unsafe instructions the model must never give.
  /\b(clear (your|the) (browser )?(data|history)|delete (your|the) save|uninstall|turn ?off (the )?firewall)\b/i,
  // Raw HTML/script in output — never render as live markup.
  /<script|<iframe|<img onerror|javascript:/i,
];
const DEFLECTION = "Let's keep our eyes on the champion! Tell me about the city and the AI agents we're training together.";

/** @returns {{ok:true}|{ok:false,reason:string,deflection:string}} */
export function screen(text) {
  const hit = UNSAFE.find((re) => re.test(String(text || '')));
  return hit ? { ok: false, reason: `matched ${hit}`, deflection: DEFLECTION } : { ok: true };
}

// Block URLs in MODEL OUTPUT specifically (child input is already deflected by
// the URL patterns above; output needs a stricter net so the champion never
// hands a child a clickable external link).
const OUTPUT_URL = /(https?:\/\/|www\.)[^\s]+/i;
export function screenOutput(text) {
  if (OUTPUT_URL.test(String(text || ''))) {
    return { ok: false, reason: 'url in output', deflection: "I can't send links, but let's keep exploring the city together!" };
  }
  return screen(text);
}
