// skill-registry.js — publish → install → run, over the project envelope's
// reserved `capabilities` and `installations` sections.
//
// Pure functions over a plain project object so they are unit-testable and the
// store commits them inside one IndexedDB transaction. This is the contract the
// implementation plan names: publishSkill / installSkill / runSkill.
//
// Invariants:
//   • A published revision is IMMUTABLE. Publishing the same id@revision again
//     is a no-op, never an overwrite — old decisions stay traceable.
//   • Nothing installs unless its self-test passes.
//   • A model revision never updates an installed machine automatically: it
//     surfaces as an "update available" ref, and only an explicit install moves it.
//   • The decision log is bounded (default 200 per installation).
import { parseCapability, installCapability, runInference } from './cap-runtime.js';

export const MAX_DECISIONS = 200;

const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
const keyOf = (cap) => `${cap.id}@${cap.revision || 1}`;

/** Create an immutable, validated capability from a bundle. Self-test is the gate. */
export function publishCapability(project, capability) {
  const parsed = parseCapability(capability);
  if (!parsed.ok) return parsed;
  const cap = parsed.capability;
  const key = keyOf(cap);
  project.capabilities ||= {};
  if (project.capabilities[key]) return { ok: true, published: false, reason: 'already-published', key };
  const installed = installCapability(cap);
  if (!installed.ok) return installed;
  if (!installed.installation.selftest.ok) {
    return { ok: false, error: 'The capability failed its self-test and was not published.', selftest: installed.installation.selftest };
  }
  project.capabilities[key] = clone(cap);
  return { ok: true, published: true, key, descriptor: capabilityOfPublished(project, key) };
}

export function capabilityOfPublished(project, key) {
  const cap = project.capabilities?.[key];
  if (!cap) return null;
  const installed = installCapability(cap);
  return { key, capability: cap, selftest: installed.ok ? installed.installation.selftest : { ok: false } };
}

/**
 * Install a published capability onto a host instance. Refuses an incompatible
 * host or a failing self-test. Re-installing the same ref is idempotent.
 */
export function installSkill(project, capabilityRef, hostInstanceId, { hostType = null, at = null } = {}) {
  if (!hostInstanceId) return { ok: false, error: 'A host instance is required.' };
  const key = typeof capabilityRef === 'string' ? capabilityRef : keyOf(capabilityRef);
  const cap = project.capabilities?.[key];
  if (!cap) return { ok: false, error: 'That capability is not published in this project.' };
  // A host may declare the capability kinds it accepts (city.mount) — an empty
  // declaration accepts the classifier; a mismatch is refused, never forced.
  const accepts = cap.city?.hostTypes;
  if (Array.isArray(accepts) && hostType && !accepts.includes(hostType)) {
    return { ok: false, error: `This capability does not run on a "${hostType}" host.` };
  }
  const installed = installCapability(cap);
  if (!installed.ok) return installed;
  if (!installed.installation.selftest.ok) return { ok: false, error: 'The capability failed its self-test.', selftest: installed.installation.selftest };
  project.installations ||= {};
  // One installation per HOST INSTANCE: an explicit update moves the host's
  // capabilityRef to the new revision rather than creating a parallel machine.
  const id = hostInstanceId;
  const existing = project.installations[id];
  const record = {
    id, hostInstanceId, hostType, capabilityRef: key, capabilityId: cap.id, revision: cap.revision || 1,
    installedAt: at || existing?.installedAt || null,
    selftest: installed.installation.selftest,
    decisions: existing?.decisions || [],
  };
  project.installations[id] = record;
  return { ok: true, installation: clone(record), reinstalled: !!existing };
}

/** True when a newer published revision exists for an installation (no auto-update). */
export function updateAvailable(project, installationId) {
  const inst = project.installations?.[installationId];
  if (!inst) return null;
  const candidates = Object.keys(project.capabilities || {})
    .filter(k => k === inst.capabilityId || k.startsWith(`${inst.capabilityId}@`))
    .map(k => ({ key: k, revision: project.capabilities[k].revision || 1 }))
    .filter(c => c.revision > (inst.revision || 1))
    .sort((a, b) => b.revision - a.revision);
  return candidates[0] || null;
}

/** Run one observation through an installation; append a bounded decision. */
export function runSkill(project, installationId, observation, { at = null } = {}) {
  const inst = project.installations?.[installationId];
  if (!inst) return { ok: false, error: 'No installation with that id.' };
  const cap = project.capabilities?.[inst.capabilityRef];
  if (!cap) return { ok: false, error: 'The installed capability is missing from this project.' };
  const result = runInference(cap, observation);
  inst.decisions ||= [];
  inst.decisions.push({
    at, decision: result.decision, confidence: result.confidence,
    abstained: result.abstained, abstainReason: result.abstainReason || null,
  });
  if (inst.decisions.length > MAX_DECISIONS) inst.decisions.splice(0, inst.decisions.length - MAX_DECISIONS);
  return { ok: true, ...result };
}
