#!/usr/bin/env node
/** One-origin localhost runtime for a live Passiona demonstration. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { checkBuddyTurn } from './demo-preflight.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const P5_ROOT = resolve(HERE, '..');
const DOCROOT = join(P5_ROOT, 'deploy', 'city-sim');
const DATA_ROOT = join(P5_ROOT, '.demo-data');
const SAVE_ROOT = join(DATA_ROOT, 'saves');
const PORT = Number(process.env.PASSIONA_DEMO_PORT || 8377);
// The IPv6 wildcard is dual-stack in Node, so an existing preview on either
// localhost family fails loudly instead of winning according to DNS order.
const HOST = process.env.PASSIONA_DEMO_HOST || '::';
const MAX_REQUEST_BYTES = 1100 * 1024;

// Read only the local, gitignored server env at runtime. Existing shell values win.
async function loadLocalEnv() {
  let raw;
  try { raw = await readFile(join(P5_ROOT, 'buddy-kit', 'server', '.env'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    process.env[match[1]] = value;
  }
}
await loadLocalEnv();

if (process.argv.includes('--reset') || process.argv.includes('--reset-only')) {
  await rm(DATA_ROOT, { recursive: true, force: true });
  console.log('[demo] cleared local demo cloud saves');
  if (process.argv.includes('--reset-only')) process.exit(0);
}

try { await access(join(DOCROOT, 'hub', 'index.html'), fsConstants.R_OK); }
catch { console.error('[demo] built City bundle is missing. Run `npm run demo:prepare` first.'); process.exit(1); }

await mkdir(SAVE_ROOT, { recursive: true });

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.woff':'font/woff', '.woff2':'font/woff2', '.wasm':'application/wasm', '.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json', '.fbx':'application/octet-stream', '.bin':'application/octet-stream',
  '.task':'application/octet-stream', '.tflite':'application/octet-stream', '.mp3':'audio/mpeg', '.wav':'audio/wav',
};

function contained(path) { return path === DOCROOT || path.startsWith(DOCROOT + sep); }

async function assetResponse(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('not found', { status: 404 });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return new Response('bad path', { status: 400 }); }
  if (pathname === '/favicon.ico') return new Response(null, { status: 204 });
  let file = resolve(DOCROOT, '.' + pathname);
  if (!contained(file)) return new Response('forbidden', { status: 403 });
  try {
    let info = await stat(file);
    if (info.isDirectory()) { file = join(file, 'index.html'); info = await stat(file); }
    const headers = new Headers({
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'accept-ranges': 'bytes',
    });
    let start = 0, end = info.size - 1, status = 200;
    const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
    if (range) {
      if (!range[1] && range[2]) start = Math.max(0, info.size - Number(range[2]));
      else start = range[1] ? Number(range[1]) : 0;
      end = (!range[1] && range[2]) ? info.size - 1 : (range[2] ? Math.min(Number(range[2]), end) : end);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${info.size}` } });
      }
      status = 206; headers.set('content-range', `bytes ${start}-${end}/${info.size}`);
    }
    headers.set('content-length', String(Math.max(0, end - start + 1)));
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })), { status, headers });
  } catch { return new Response('not found', { status: 404 }); }
}

function savePath(key) { return join(SAVE_ROOT, encodeURIComponent(String(key)) + '.json'); }
const SAVES = {
  async get(key) { try { return await readFile(savePath(key), 'utf8'); } catch { return null; } },
  async put(key, value) {
    const target = savePath(key); const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, String(value), { encoding: 'utf8', mode: 0o600 }); await rename(temp, target);
  },
};

const workerEntry = pathToFileURL(join(DOCROOT, 'buddy', 'worker', 'index.mjs')).href;
let worker;
try { worker = (await import(workerEntry)).default; }
catch (error) { console.error('[demo] Buddy worker could not start:', error?.message || error); process.exit(1); }
const useDeepSeekDefault = !process.env.BUDDY_MODEL_ID?.trim() || process.env.BUDDY_MODEL_ID === 'deepseek-v4-flash';
const env = {
  ...process.env,
  BUDDY_MODEL_ID: process.env.BUDDY_MODEL_ID || 'deepseek-v4-flash',
  ...(useDeepSeekDefault ? {
    BUDDY_MODEL_URL: process.env.BUDDY_MODEL_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    BUDDY_MODEL_KEY: process.env.BUDDY_MODEL_KEY || process.env.DEEPSEEK_API_KEY,
  } : {}),
  ASSETS: { fetch: assetResponse }, SAVES,
};

async function nodeRequest(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw Object.assign(new Error('request too large'), { status: 413 });
    chunks.push(chunk);
  }
  const init = { method:req.method, headers:req.headers };
  if (chunks.length && !['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
  return new Request(`http://localhost:${PORT}${req.url}`, init);
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/demo/health') {
      const model = await worker.fetch(new Request(`http://localhost:${PORT}/api/model`), env);
      return send(res, new Response(JSON.stringify({
        ok: model.ok,
        origin: `http://localhost:${PORT}`,
        bundle: true,
        storage: true,
        gateway: model.ok,
        buddy: false,
        workshop: 'online-required',
      }), { status:model.ok ? 200 : 503, headers:{ 'content-type':'application/json', 'cache-control':'no-store' } }));
    }
    if (req.method === 'POST' && req.url === '/api/demo/check') {
      const check = await checkBuddyTurn(worker, env);
      return send(res, new Response(JSON.stringify(check), { headers:{ 'content-type':'application/json', 'cache-control':'no-store' } }));
    }
    await send(res, await worker.fetch(await nodeRequest(req), env));
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[demo]', error?.stack || error);
    res.writeHead(status, { 'content-type':'application/json' }); res.end(JSON.stringify({ error:status === 413 ? 'request too large' : 'demo server error' }));
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`[demo] port ${PORT} is already in use. Close the other preview and try again.`);
  else console.error('[demo]', error);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`[demo] Passiona is ready at http://localhost:${PORT}/`);
  console.log(`[demo] local cloud saves: ${SAVE_ROOT}`);
});
