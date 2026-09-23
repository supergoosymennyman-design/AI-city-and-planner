/**
 * Pure, testable gate on client-supplied manifest and project state before they reach the buddy
 * engine and system prompt. Mirrors `champion-sanitize.js`'s pattern: the gateway (trust boundary)
 * owns the real kid-safety `screen()` from `filter.js`, but the DECISION of which parts need
 * screening and how flagged/oversized entries are handled lives here as a pure unit.
 *
 * WHY this exists: The manifest and project state arrive in unauthenticated POST bodies (the
 * gateway's `/api/turn` endpoint). The manifest's `title`, `kidJob`, and all labels flow into the
 * buddy's system prompt, into the held-in-memory champion markdown (Task 4's
 * `projectMarkdown(manifest, state)` renders these exact strings — stateless-buddy Task 1 stopped
 * writing them to `memory/Champion.md` on disk, but they are still re-injected as model context on
 * every future turn from `lesson.championMd`); project state labels (`group` names, `readout`
 * string values) reach the same two sinks. Before screening, forged request bodies could inject
 * payloads as project names that ride untouched into the model's context and the champion profile
 * re-injected on every later turn.
 *
 * WHY fresh copies: every fallback return builds a NEW object (`freshMinimal()`), never the
 * `MINIMAL_MANIFEST` singleton by reference — `config.js`'s `loadConfig` shipped exactly that bug
 * (fallbacks returned the shared `DEFAULT_CONFIG`, so one caller's mutation poisoned every later
 * load). The freeze on `MINIMAL_MANIFEST` is the backstop; the copy is the contract.
 *
 * Like `champion-sanitize.js`, when an entry is flagged/oversized/malformed, the whole entry is
 * DROPPED rather than rewritten to a placeholder — object keys must be unique, so renaming multiple
 * flagged entries to the same placeholder would silently merge them instead of removing them. Callers
 * treat garbage gracefully: a missing/garbage manifest degrades to MINIMAL_MANIFEST; a garbage state
 * degrades to empty `{params:{}, slots:{}, readouts:{}, findings:[]}` — never throws.
 *
 * `checks[].readOnly` (added for the read-tool class, spec §11b.1) and `sanitizeProjectState`'s
 * `findings` block (§11b.2) are the newest additions here and are the trust boundary for letting a
 * declared-read-only check hand the model real data with no approval card — see the comments at
 * each site below for the fail-closed rules that make that safe.
 */

export const MINIMAL_MANIFEST = Object.freeze({
  projectId: 'project', title: 'Project', kidJob: '', guide: '',
  params: Object.freeze([]), slots: Object.freeze([]), checks: Object.freeze([]), readouts: Object.freeze([]),
});

// `guide` cap: the paragraph naming the project's REAL on-screen controls + flow, so the model can
// point the child at actual buttons instead of inventing generic ones. Bounded so a forged body
// can't bloat the system prompt — the DEFENCE is that it is bounded and screened, not the exact
// number. Raised 700→3000 on 2026-08-19: the workshop's guide had been sitting at 698 for months,
// so every block added to the toolkit was paid for by deleting an explanation, and the guide decayed
// into a port dump that could not answer "which block do I use". The ceiling is sized for what GROWS
// — that guide is generated from the block palette, and 2200 (fitted to the palette that morning)
// was already breached by one paragraph the same day; 3000 leaves room for the blocks not yet built.
// It is not licence for a windy guide, and every character still goes through screen().
// 2026-09-23: the Workshop now also needs the private teach/evaluate/correct/Part/Batch
// workflow and explicit visibility/action limits. Keep that static knowledge alongside the
// generated block catalogue rather than deleting existing port and coaching instructions.
const GUIDE_MAX = 6000;

const ID_RE = /^[a-z0-9-]{1,40}$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9]{0,30}$/;

const freshMinimal = () => ({ projectId: 'project', title: 'Project', kidJob: '', guide: '', params: [], slots: [], checks: [], readouts: [] });

const okLabel = (v, screen, max) => typeof v === 'string' && v.length > 0 && v.length <= max && screen(v).ok;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function namedEntries(raw, cap, screen, extra) {
  const out = []; const seen = new Set();
  for (const e of Array.isArray(raw) ? raw : []) {
    if (out.length >= cap) break;
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    if (typeof e.name !== 'string' || !NAME_RE.test(e.name) || seen.has(e.name)) continue;
    if (!okLabel(e.label, screen, 40)) continue;
    const built = extra ? extra(e) : {};
    if (built === null) continue;
    seen.add(e.name);
    out.push({ name: e.name, label: e.label, ...built });
  }
  return out;
}

export function sanitizeManifest(raw, screen) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return freshMinimal();
  const projectId = typeof raw.projectId === 'string' && ID_RE.test(raw.projectId) ? raw.projectId : 'project';
  const title = okLabel(raw.title, screen, 60) ? raw.title : 'Project';
  const kidJob = typeof raw.kidJob === 'string' && raw.kidJob.length <= 140 && (raw.kidJob === '' || screen(raw.kidJob).ok) ? raw.kidJob : '';
  const guide = typeof raw.guide === 'string' && raw.guide.length <= GUIDE_MAX && (raw.guide === '' || screen(raw.guide).ok) ? raw.guide : '';
  const params = namedEntries(raw.params, 8, screen, (e) => {
    if (!finite(e.min) || !finite(e.max) || !(e.min < e.max)) return null;
    const built = { min: e.min, max: e.max };
    if (finite(e.step) && e.step > 0) built.step = e.step;
    return built;
  });
  const slots = namedEntries(raw.slots, 6, screen, (e) => ({ grouped: e.grouped === true }));
  // `readOnly` uses the SAME `extra`-hook mechanism as `grouped` above (namedEntries' 4th arg) —
  // deliberately not a second parallel mechanism. `=== true` (not `Boolean(e.readOnly)`) is the
  // whole trust boundary here: a project sending `"true"`, `1`, or any other truthy-but-not-`true`
  // value for `readOnly` must NOT accidentally mark a WRITE check as read-only, because that would
  // let the model perform state changes through it with no approval card. Absent/anything-else
  // reads as the literal boolean `false` (never omitted — see the read-tool call site in engine.js,
  // which branches on `check.readOnly` and must never see `undefined`).
  // `takesGroup`/`slow` (buddy-augment spec) are declared through the SAME literal-`true`-only gate,
  // for the same reason: `takesGroup` decides whether `action-schema.js`'s `runCheck` case demands a
  // `group` field (a truthy-but-not-`true` value must not silently start requiring/accepting one),
  // and `slow` only changes copy (ops-instruction's vocabulary line, the buddy widget's pending-apply
  // path) — never gates anything security-relevant, but gets the identical trust boundary so a
  // project can't flip either behaviour on by accident with a stray string/number.
  const checks = namedEntries(raw.checks, 4, screen, (e) => ({
    readOnly: e.readOnly === true, takesGroup: e.takesGroup === true, slow: e.slow === true,
  }));
  const readouts = namedEntries(raw.readouts, 6, screen);
  return { projectId, title, kidJob, guide, params, slots, checks, readouts,
    ...(raw.directEdits === true ? { directEdits: true } : {}) };
}

export function sanitizeProjectState(raw, manifest, screen) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const okId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40 && screen(v).ok;
  const params = {};
  for (const p of manifest.params) {
    const v = src.params && typeof src.params === 'object' ? src.params[p.name] : undefined;
    if (finite(v)) params[p.name] = Math.min(p.max, Math.max(p.min, v));
  }
  const slots = {};
  for (const s of manifest.slots) {
    const v = src.slots && typeof src.slots === 'object' ? src.slots[s.name] : undefined;
    if (!v || typeof v !== 'object') continue;
    if (s.grouped) {
      const groups = {};
      let count = 0;
      for (const [g, ids] of Object.entries(v.groups && typeof v.groups === 'object' ? v.groups : {})) {
        if (count >= 20) break;
        if (!okId(g) || !Array.isArray(ids)) continue;
        groups[g] = ids.filter(okId).slice(0, 200);
        count += 1;
      }
      slots[s.name] = { groups };
    } else {
      slots[s.name] = { items: (Array.isArray(v.items) ? v.items : []).filter(okId).slice(0, 200) };
    }
  }
  const readouts = {};
  for (const r of manifest.readouts) {
    const v = src.readouts && typeof src.readouts === 'object' ? src.readouts[r.name] : undefined;
    if (finite(v)) readouts[r.name] = v;
    else if (typeof v === 'string' && v.length > 0 && v.length <= 60 && screen(v).ok) readouts[r.name] = v;
  }
  // `findings` (spec §11b.2) is DELIBERATELY NOT manifest-driven — unlike params/slots/readouts
  // above, which only survive when `manifest` declared that exact name. There is nothing to
  // declare a finding against: a read-only check either reports findings on a given turn or it
  // doesn't, so this block has no `manifest.*` loop to join against. That asymmetry is intentional,
  // not a missed case — don't "fix" it into a manifest-driven allowlist.
  //
  // Every rule below fails CLOSED: one bad field drops the WHOLE finding entry (never thrown,
  // never partially kept, never coerced towards validity) because findings ride straight into the
  // model's context with no approval gate to catch a mistake downstream.
  const FINDING_KIND_RE = /^[a-z][a-zA-Z]{0,20}$/;
  const findings = [];
  for (const f of Array.isArray(src.findings) ? src.findings : []) {
    if (findings.length >= 6) break;
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    if (typeof f.kind !== 'string' || !FINDING_KIND_RE.test(f.kind)) continue;
    if (typeof f.note !== 'string' || f.note.length === 0 || f.note.length > 160 || !screen(f.note).ok) continue;
    const groups = (Array.isArray(f.groups) ? f.groups : []).filter(okId).slice(0, 8);
    const ids = (Array.isArray(f.ids) ? f.ids : []).filter(okId).slice(0, 8);
    findings.push({ kind: f.kind, groups, ids, note: f.note });
  }
  return { params, slots, readouts, findings };
}

/**
 * Sanitize a client-supplied `buddyName` before it reaches `composeInjection` (`memory.js`), which
 * interpolates it RAW into the system prompt (`The child named you "${buddyName}"`) — rebuilt every
 * turn (`turn.js`'s `composeTurnContext`) and never itself screened downstream.
 * Unlike `classes`/`confusionPairs` labels, `buddyName` has no drop-the-entry option (the injection
 * always needs SOME name), so a flagged/malformed/oversized value is replaced with `fallback`
 * rather than removed.
 * @param {*} name - candidate `buddyName` from client JSON (the `/api/turn` body).
 * @param {(text:string) => {ok:true}|{ok:false,reason:string,deflection:string}} screen - the
 *   kid-safety filter (injected, like `sanitizeChampionState`'s `screen`, so this stays testable
 *   without importing the real `filter.js`).
 * @param {number} [maxLen=40] - names longer than this are replaced as an abuse/prompt-bloat guard.
 * @param {string} [fallback='Buddy'] - safe name to use when `name` fails any check.
 * @returns {string}
 */
export function sanitizeBuddyName(name, screen, maxLen = 40, fallback = 'Buddy') {
  if (typeof name !== 'string' || name.length === 0 || name.length > maxLen) return fallback;
  if (!screen(name).ok) return fallback;
  return name;
}
