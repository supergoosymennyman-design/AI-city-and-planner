#!/usr/bin/env node
/**
 * generate-mem-seed.mjs — regenerate worker/mem-seed.mjs from server/memory/*.md.
 *
 * The Cloudflare Worker shell has no filesystem, so the baked default
 * persona/notes ride as frozen constants instead of a boot-time readMemory().
 * This keeps the SAME three fields + same fallback role as server/memory.js's
 * readMemory(). Run whenever a memory/*.md changes, and commit the regenerated
 * worker/mem-seed.mjs.
 *
 * Usage (from P5 Programme/):
 *   node buddy-kit/scripts/generate-mem-seed.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, '..');
const MEM = join(KIT, 'server/memory');
const OUT = join(KIT, 'worker/mem-seed.mjs');

const read = (f, fallback) => {
  try {
    const v = readFileSync(join(MEM, f), 'utf8');
    return v.trimEnd() + '\n';
  } catch {
    return fallback;
  }
};

const seed = {
  setting: read('Setting.md', '# Buddy Setting\nA warm coach for a 10-year-old.\n'),
  user: read('User.md', '# About the Learner\n(No notes yet.)\n'),
  champion: read('Champion.md', '# Champion Profile\n(No abilities yet.)\n'),
};

const js = `// GENERATED from server/memory/*.md — DO NOT EDIT BY HAND.
// Regenerate with: node buddy-kit/scripts/generate-mem-seed.mjs
// The Worker shell has no filesystem, so the baked default persona/notes ride
// as constants (same three fields, same fallback role as memory.js readMemory()).
export const MEM_SEED = Object.freeze({
  setting: ${JSON.stringify(seed.setting)},
  user: ${JSON.stringify(seed.user)},
  champion: ${JSON.stringify(seed.champion)},
});
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, js);
console.log(`[generate-mem-seed] wrote ${OUT} (setting=${seed.setting.length}B user=${seed.user.length}B champion=${seed.champion.length}B)`);
