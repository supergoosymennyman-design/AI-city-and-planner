#!/usr/bin/env node
/**
 * serve.cjs — the ONE command that runs this bundle with its buddy: a zero-dependency static
 * server for the game (this folder) + the same `/buddy/*` proxy the repo's dev server uses +
 * an autospawn of the bundled buddy gateway (`buddy/server/gateway.js`).
 *
 * This file is GENERATED into the bundle by `scripts/pack-project.mjs` (template:
 * `scripts/lib/bundle-serve.cjs`) — edit the template, re-pack; never hand-edit the bundle copy.
 *
 * WHY it exists: the game needs a SECURE CONTEXT (camera/mic permissions persist on
 * http://localhost, storm on file://), and the buddy needs a LIVE gateway process — a static file
 * host can serve neither. On a static host (Cloudflare Pages etc.) the game still works and the
 * buddy simply never appears (the game's own probe finds no gateway and mounts nothing); THIS
 * script is how a machine with Node gets the full experience:
 *
 *   1. once:  cd buddy && npm install
 *   2. then:  node serve.cjs        → http://localhost:8080/
 *
 * The gateway child is best-effort BY DESIGN: missing buddy/, missing node_modules, or a crashed
 * gateway all degrade to "game without buddy", never to a dead game. If a gateway is ALREADY
 * running on this machine (the repo's dev gateway on :8787), the spawned one exits EADDRINUSE and
 * the proxy simply reaches the existing process — same product, still correct.
 *
 * Ports: PORT env overrides the game server (default 8080); BUDDY_GATEWAY env overrides the proxy
 * target (default http://127.0.0.1:8787, which must match the gateway's own BUDDY_PORT).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;                       // the bundle root — this file sits beside index.html
const HOST = '127.0.0.1';                     // localhost = secure context (permissions persist)
const PORT = Number(process.env.PORT) || 8080;
const BUDDY_GATEWAY = process.env.BUDDY_GATEWAY || 'http://127.0.0.1:8787';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/** Resolve a request path to a file inside ROOT, refusing any path-traversal escape. */
function safeResolve(urlPath) {
  const clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  const full = path.normalize(path.join(ROOT, clean));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null; // escaped ROOT
  return full;
}

/** Static serving + the /buddy proxy — a trimmed copy of web/serve.js's handler (see its header
 *  comments for the full WHY on streaming, the 502 degrade, and the SSRF guard below). */
function handle(req, res) {
  const reqPath = req.url || '/';
  if (reqPath === '/buddy' || reqPath.startsWith('/buddy/')) {
    const target = new URL(reqPath.replace(/^\/buddy/, '') || '/', BUDDY_GATEWAY);
    // SSRF guard (verified in the repo original): a protocol-relative tail ("/buddy//evil.example/x")
    // would otherwise swap the HOST while keeping the scheme — pin to the configured gateway origin.
    const gatewayOrigin = new URL(BUDDY_GATEWAY);
    if (target.protocol !== gatewayOrigin.protocol || target.host !== gatewayOrigin.host) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('bad buddy path');
      return;
    }
    const up = http.request(target, { method: req.method, headers: Object.assign({}, req.headers, { host: target.host }) }, (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    });
    up.on('error', () => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('buddy gateway offline');
    });
    req.pipe(up);
    return;
  }
  let target = safeResolve(reqPath);
  if (target === null) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(target, (err, st) => {
    if (!err && st.isDirectory()) target = path.join(target, 'index.html');
    fs.readFile(target, (err2, buf) => {
      if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found: ' + reqPath); return; }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });
}

/**
 * Spawn the bundled buddy gateway, best-effort. Returns the child or null (with the fix printed).
 * `--env-file-if-exists=.env` mirrors the kit's own `npm start`, so a recipient who creates
 * buddy/server/.env from .env.example gets their model keys picked up with no other wiring.
 */
function startGateway() {
  const serverDir = path.join(ROOT, 'buddy', 'server');
  if (!fs.existsSync(path.join(serverDir, 'gateway.js'))) {
    console.log('  Buddy:  not in this bundle — game only.');
    return null;
  }
  // Deps live at buddy/node_modules (`cd buddy && npm install` — one install serves the gateway
  // AND the Cloudflare worker build); a server-local install works too, so accept either.
  if (!fs.existsSync(path.join(ROOT, 'buddy', 'node_modules')) && !fs.existsSync(path.join(serverDir, 'node_modules'))) {
    console.log('  Buddy:  not installed yet. Run once:  cd buddy && npm install   — then restart this server.');
    return null;
  }
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'gateway.js'], { cwd: serverDir, stdio: 'inherit' });
  child.on('exit', (code) => {
    // EADDRINUSE lands here too: another gateway already owns :8787 and the proxy reaches THAT one.
    if (code) console.log('  Buddy:  gateway process exited (' + code + ') — the game keeps serving without it (or via an already-running gateway).');
  });
  return child;
}

const server = http.createServer(handle);
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') console.error('\n  Port ' + PORT + ' is busy. Try:  PORT=8081 node serve.cjs\n');
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  const url = 'http://localhost:' + PORT + '/';
  console.log('\n  Game:   ' + url + '   (secure context — mic & camera permissions persist)');
  const child = startGateway();
  if (child) {
    console.log('  Buddy:  gateway spawned — the buddy bubble appears in the game once it answers.');
    const stop = () => { try { child.kill(); } catch (e) { /* already gone */ } process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
  console.log('  Stop with Ctrl+C.\n');
});
