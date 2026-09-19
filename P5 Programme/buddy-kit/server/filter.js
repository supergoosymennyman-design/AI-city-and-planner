/**
 * Kid-safety content filter (spike-grade, deliberately simple — a real seam to harden later).
 * Runs on BOTH the child's input and the model's output. A flag → gentle deflection + audit.
 * Pattern-based: personal-info solicitation, unsafe/off-topic, and jailbreak-style "ignore your rules".
 */
const UNSAFE = [
  /\b(address|phone number|where do you live|home address)\b/i,
  // Jailbreak / rule-override. Broadened past the literal "ignore your rules" so the common synonym
  // phrasings ("disregard previous instructions", "forget the system prompt") also deflect
  // (Gemini pass-2 finding F1). Kept to an adjacent-word window so ordinary prose is not eaten.
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(rules?|instructions?|prompts?|system|guidelines?)\b/i,
  /\b(run|execute) (a )?(shell|bash|command|code)\b/i,
  /\b(password|credit card|social security|national id|hkid)\b/i,
  // PII a child might volunteer: emails, phone numbers.
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/i,
  /\b(\+?\d[\d\s-]{7,}\d)\b/i,
  // Unsafe instructions the model must never give. Includes destructive-disk phrasings the old
  // pattern missed ("format c:", "rm -rf", "wipe the drive") (Gemini pass-2 finding F1).
  /\b(clear (your|the) (browser )?(data|history)|delete (your|the) save|uninstall|turn ?off (the )?firewall|format c:?|rm\s+-rf|wipe (your|the) (drive|disk|hard drive)|delete system32|factory reset)\b/i,
  // Raw HTML/script in output — never render as live markup.
  /<script|<iframe|<img onerror|javascript:/i,
];
const DEFLECTION = "Let's keep our eyes on the champion! Tell me about the city and the AI agents we're training together.";

/** @returns {{ok:true}|{ok:false,reason:string,deflection:string}} */
export function screen(text) {
  const hit = UNSAFE.find((re) => re.test(String(text || '')));
  return hit ? { ok: false, reason: `matched ${hit}`, deflection: DEFLECTION } : { ok: true };
}

// Block URLs in MODEL OUTPUT specifically. Output needs a stricter net than input so the champion
// never hands a child a clickable external link. Broadened past http(s)/www to also catch
// protocol-relative ("//host"), other schemes (ftp/ws), and naked common-TLD domains ("google.com")
// a child could still tap (Gemini pass-2 finding F2).
const OUTPUT_URL = /(https?:\/\/|ftp:\/\/|wss?:\/\/|www\.|\/\/[a-z0-9-]+\.[a-z]{2,}|\b[a-z0-9-]{2,}\.(?:com|net|org|edu|gov|io|hk)\b)/i;
export function screenOutput(text) {
  if (OUTPUT_URL.test(String(text || ''))) {
    return { ok: false, reason: 'url in output', deflection: "I can't send links, but let's keep exploring the city together!" };
  }
  return screen(text);
}
