#!/usr/bin/env node
// Restart Chromium between bounded slices of the 3D suite. Natural City loads
// a real panorama by default; long-lived SwiftShader processes otherwise keep
// GPU allocations from dozens of closed contexts and eventually starve later
// screenshots/clicks. Sharding changes no coverage and remains serial.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const config = resolve(here, 'playwright.config.mjs');
const from = process.env.E2E_FROM_SPEC || '';
const specs = readdirSync(here).filter(name => name.endsWith('.spec.mjs') && name >= from).sort();
const portBase = Number.parseInt(process.env.E2E_PORT_BASE || '8377', 10) || 8377;

for (let index = 0; index < specs.length; index++) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['playwright', 'test', '--config', config, resolve(here, specs[index])],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, E2E_PORT: String(portBase + index), E2E_WORKERS: '1' },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
