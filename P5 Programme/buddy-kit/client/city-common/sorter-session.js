import { RECYCLING_DIMENSION, RECYCLING_PREPROCESSING, checkCompatibility } from './recycling.js';

const KEY = 'passiona-recycling-session-v1';
export const SORTER_MAX_PHOTOS = 60;
export const SORTER_LABELS = ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'];
const validVector = vector => Array.isArray(vector) && vector.length === RECYCLING_DIMENSION && vector.every(Number.isFinite);

export function readSorterSession(projectId, storage = globalThis.sessionStorage) {
  try {
    const data = JSON.parse(storage.getItem(KEY) || 'null');
    if (data?.projectId !== projectId || data?.preprocessing !== RECYCLING_PREPROCESSING) return empty(projectId);
    return {
      ...empty(projectId),
      batch: Array.isArray(data.batch) ? data.batch.filter(row => validVector(row.vector)).slice(0, SORTER_MAX_PHOTOS) : [],
      teaching: Array.isArray(data.teaching) ? data.teaching.filter(row => SORTER_LABELS.includes(row.label) && validVector(row.vector)).slice(0, SORTER_MAX_PHOTOS) : [],
      active: checkCompatibility(data.active).ok ? data.active : null,
      quick: checkCompatibility(data.quick).ok ? data.quick : null,
      selection: typeof data.selection === 'string' ? data.selection : null,
    };
  } catch { return empty(projectId); }
}

export function empty(projectId) { return { projectId, preprocessing: RECYCLING_PREPROCESSING, batch: [], teaching: [], active: null, quick: null, selection: null }; }

export function writeSorterSession(data, storage = globalThis.sessionStorage) {
  const safe = readSorterSession(data.projectId, { getItem: () => JSON.stringify(data) });
  try { storage.setItem(KEY, JSON.stringify(safe)); return { ok: true, data: safe }; }
  catch { return { ok: false, error: 'This browser session is full. Remove some photos and try again.' }; }
}

export function clearSorterSession(storage = globalThis.sessionStorage) { try { storage.removeItem(KEY); } catch {} }

export function binCounts(results) {
  const counts = Object.create(null);
  for (const result of results || []) counts[result.bin] = (counts[result.bin] || 0) + 1;
  return counts;
}

export function binFullness(count, batchSize) { return batchSize ? Math.round(count / batchSize * 100) : 0; }

/** Resolve exactly the Workshop reference. A stale session never selects a replacement. */
export function resolveSorterSelection(session, models, selection) {
  const ref=selection?.modelRef;
  let cap;
  if(ref?.startsWith('saved:'))cap=models?.[ref.slice(6)]?.capability;
  else if(ref?.startsWith('table:')) {
    cap=session?.active || session?.quick;
    if(cap?.workshop?.modelId!==ref.slice(6)||cap?.workshop?.sourceMachineId!==selection.machineId)return null;
  } else if(ref==='quick')cap=session?.quick;
  else if(ref)return null;
  else cap=session?.selection?models?.[session.selection]?.capability:session?.quick;
  return checkCompatibility(cap).ok?cap:null;
}
