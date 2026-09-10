#!/usr/bin/env node
/**
 * static-server.mjs — minimal static file server for the P5 e2e test suite.
 *
 * Serves the CANONICAL client source (`buddy-kit/client`) as docroot, which is
 * what the deploy bundle mirrors — so tests run against source, not against a
 * deploy. Port defaults to 8377 (matches the old ad-hoc smoke scripts).
 *
 * Usage:
 *   node tests/e2e/static-server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = P5 Programme/tests/e2e → P5 Programme → repo root.
// Default docroot: P5 Programme/buddy-kit/client (the canonical source).
// E2E_DOCROOT is repo-root-relative (e.g. "P5 Programme/deploy/city-sim") and is
// resolved from the repo root, NOT this file's cwd (playwright runs the webServer
// with cwd = the config dir).
const P5_ROOT = resolve(HERE, '../..');
const REPO_ROOT = resolve(P5_ROOT, '..');
const ROOT = process.env.E2E_DOCROOT
  ? resolve(REPO_ROOT, process.env.E2E_DOCROOT)
  : join(P5_ROOT, 'buddy-kit/client');
const PORT = Number(process.argv[2] || process.env.E2E_PORT || 8377);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Browsers auto-request /favicon.ico; answer silently to keep console clean.
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(join(ROOT, pathname));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => console.log(`[static-server] ${ROOT} on :${PORT}`));
