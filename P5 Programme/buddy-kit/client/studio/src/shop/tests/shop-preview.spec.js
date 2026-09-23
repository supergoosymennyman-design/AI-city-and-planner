/**
 * shop-preview.test.js — SOURCE-SCAN coverage for `src/ui/shop-preview.js`.
 *
 * The preview owns a real WebGL context, so it cannot be driven under plain
 * Node. Instead of a browser harness, this suite scans the module SOURCE with
 * comments stripped (exactly the `shop-panel.test.js` technique) to lock the
 * contract that is easy to regress and impossible to see from a Node import:
 *
 *  - it stays DOM-safe (no `innerHTML`/`insertAdjacentHTML`),
 *  - it stays deterministic (no `Math.random` / `Date.now`),
 *  - the WebGL context is created LAZILY (no top-level `new WebGLRenderer`),
 *  - `dispose()` really releases the context (`forceContextLoss`),
 *  - it never imports the shop controller or the scene (only `three`),
 *  - it loads exclusively through the injected `loadTemplate` (no cache),
 *  - the generic placeholder fallback path exists and carries no per-model art.
 *
 * Auto-discovered and replayed synchronously by `test.mjs`; the default export
 * MUST stay synchronous (`(check) => {}`).
 */

import { readFileSync } from 'node:fs';

export default function shopPreviewTests(check) {
  const src = readFileSync(new URL('../../ui/shop-preview.js', import.meta.url), 'utf8');
  // Comments legitimately NAME what is forbidden (to explain the design), so
  // strip them and assert on the executable code only.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const lines = code.split('\n');

  check(
    'shop-preview: source never uses innerHTML / insertAdjacentHTML / eval',
    !/innerHTML/.test(code) && !/insertAdjacentHTML/.test(code) && !/\beval\s*\(/.test(code),
  );

  check(
    'shop-preview: source never uses Math.random or Date.now (deterministic)',
    !/Math\.random/.test(code) && !/Date\.now/.test(code),
  );

  check(
    'shop-preview: source imports only three — never the controller or the scene',
    (() => {
      const specifiers = [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      return (
        specifiers.length === 1 &&
        specifiers[0] === 'three' &&
        !/controller\.js/.test(code) &&
        !/scene\.js/.test(code)
      );
    })(),
  );

  // Lazy context: no top-level statement may construct the renderer. A
  // renderer-construction line must be INDENTED (inside `_ensureRenderer`).
  const eagerRenderer = lines.some(
    (line) => /new\s+(?:THREE\.)?WebGLRenderer/.test(line) && !/^\s/.test(line),
  );
  check(
    'shop-preview: no top-level eager WebGLRenderer (context created lazily)',
    !eagerRenderer && /new\s+THREE\.WebGLRenderer/.test(code),
  );

  // The class method `dispose()` uniquely appears as `dispose() {`; the first
  // `forceContextLoss` must fall inside it (before any later method).
  check(
    'shop-preview: dispose() calls forceContextLoss to release the context',
    /dispose\(\)\s*\{[\s\S]*?forceContextLoss/.test(code),
  );

  check(
    'shop-preview: dispose() is guarded to be idempotent',
    /dispose\(\)\s*\{[\s\S]*?if\s*\(\s*this\._disposed\s*\)\s*return/.test(code),
  );

  check(
    'shop-preview: loads exclusively through the injected loadTemplate (never a cache)',
    /loadTemplate/.test(code) && !/templateCache/.test(code),
  );

  check(
    'shop-preview: exposes show / hide / dispose / resize on the class',
    /show\s*\(/.test(code) &&
      /hide\s*\(\s*\)\s*\{/.test(code) &&
      /dispose\s*\(\s*\)\s*\{/.test(code) &&
      /resize\s*\(/.test(code),
  );

  check(
    'shop-preview: renders a generic placeholder fallback',
    /placeholder/i.test(code) && /textContent/.test(code),
  );

  check(
    'shop-preview: placeholder uses DOM/CSS only — no per-model art or external asset',
    !/\.(png|jpe?g|webp|gif|svg)\b/i.test(code) && !/createElementNS/.test(code),
  );

  check(
    'shop-preview: never gates the preview on the unlock engine (locked models are previewable)',
    !/unlock\.js/.test(code) && !/\bunlocked\b/.test(code),
  );

  check(
    'shop-preview: exports the shared PREVIEW_MAX_OBJECTS cap',
    /export\s+const\s+PREVIEW_MAX_OBJECTS\s*=\s*\d+/.test(code),
  );
}
