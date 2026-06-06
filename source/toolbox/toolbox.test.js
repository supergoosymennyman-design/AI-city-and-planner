/*
 * One-off regression tests for the toolbox test harness.
 * Run with:  node toolbox.test.js
 *
 * Bug A: test_toolbox.html references its modules with a wrong relative
 *        path prefix ("toolbox/..."), so the <script> tags 404 and the
 *        manager globals are never defined.
 * Bug B: JointDetectionManager._startDetection() kills its own detection
 *        loop if it is started before the (async, CDN-loaded) model is
 *        ready, because the loop `return`s instead of rescheduling.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log('  PASS  ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

// ---------------------------------------------------------------------------
// Bug A: every relative <script src> in the HTML must resolve to a real file.
// ---------------------------------------------------------------------------
(function testScriptPaths() {
  console.log('Bug A: HTML <script src> paths resolve to existing files');
  const html = fs.readFileSync(path.join(HERE, 'test_toolbox.html'), 'utf8');
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  const srcs = [];
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);

  const relative = srcs.filter(function (s) { return !/^https?:|^\/\//.test(s); });
  check('found local script tags', relative.length > 0, 'srcs=' + JSON.stringify(srcs));

  relative.forEach(function (src) {
    // Relative src resolves against the HTML document's own directory.
    const resolved = path.join(HERE, src);
    check('script exists: "' + src + '"', fs.existsSync(resolved), resolved);
  });
})();

// ---------------------------------------------------------------------------
// Bug B: detection loop must keep polling until the model is ready, then send.
// ---------------------------------------------------------------------------
async function testDetectionLoop() {
  console.log('Bug B: detection loop survives being started before model loads');

  const code = fs.readFileSync(path.join(HERE, 'joints.js'), 'utf8');
  const sandbox = { setTimeout: setTimeout, clearTimeout: clearTimeout, Math: Math, console: console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const Mgr = sandbox.JointDetectionManager;
  check('JointDetectionManager defined', typeof Mgr === 'function');
  if (typeof Mgr !== 'function') return;

  const mgr = new Mgr({ enableHands: true, detectionInterval: 30 });
  const fakeVideo = { readyState: 4 };

  let sendCalls = 0;
  // Model is NOT ready yet (mimics CDN still downloading at first tick).
  // The first loop tick is hardcoded at 100ms, so the model must still be
  // null when that tick fires; it only becomes ready afterwards.
  mgr._holistic = null;
  mgr.detectAll(fakeVideo, {});

  // Let the first (100ms) tick fire with the model still null, THEN load it.
  await new Promise(function (r) { setTimeout(r, 160); });
  mgr._holistic = {
    send: function () { sendCalls++; return Promise.resolve(); }
  };

  // Give the loop time to notice the model and start sending.
  await new Promise(function (r) { setTimeout(r, 160); });
  mgr.stop();

  check('loop sent to model after it became ready', sendCalls > 0,
        'sendCalls=' + sendCalls);
}

(async function main() {
  await testDetectionLoop();
  console.log('');
  if (failures === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
  } else {
    console.log(failures + ' CHECK(S) FAILED');
    process.exit(1);
  }
})();
