// Development only: use the terminal's HF login without exposing it to browser JS.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { requestAutoRig } from './src/rig/auto-rig-service.js';

async function token() {
  if (process.env.HF_TOKEN?.trim()) return process.env.HF_TOKEN.trim();
  try { return (await readFile(process.env.HF_TOKEN_PATH || path.join(process.env.HF_HOME || path.join(homedir(), '.cache', 'huggingface'), 'token'), 'utf8')).trim(); }
  catch { return ''; }
}

/** Local, same-origin upload endpoint; never included in a production bundle. */
export function autoRigDev() {
  return { name: 'studio-auto-rig-local', configureServer(server) {
    server.middlewares.use('/__studio/auto-rig', async (req, res) => {
      const host = req.headers.host || '';
      const origin = req.headers.origin;
      const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
      if (!local || (origin && origin !== `http://${host}` && origin !== `https://${host}`)) { res.statusCode = 403; res.end(); return; }
      res.setHeader('Cache-Control', 'no-store');
      const key = await token();
      if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ available: !!key })); return; }
      // The custom header also prevents cross-origin form uploads spending the local credential.
      if (req.method !== 'POST' || req.headers['x-studio-auto-rig'] !== '1') { res.statusCode = 405; res.end(); return; }
      if (!key) { res.statusCode = 401; res.end('Set HF_TOKEN or log in with the Hugging Face CLI.'); return; }
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      try {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) throw new Error('The temporary model is too large.');
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected a GLB model.');
        const rigged = await requestAutoRig(new File([bytes], 'model.glb', { type: 'model/gltf-binary' }), { token: key, signal: controller.signal });
        if (!controller.signal.aborted) { res.setHeader('Content-Type', 'model/gltf-binary'); res.end(Buffer.from(rigged)); }
      } catch (error) {
        if (!res.writableEnded && !res.destroyed) { res.statusCode = 502; res.setHeader('Content-Type', 'text/plain'); res.end(String(error.message).split(key).join('[redacted]')); }
      }
    });
  } };
}
