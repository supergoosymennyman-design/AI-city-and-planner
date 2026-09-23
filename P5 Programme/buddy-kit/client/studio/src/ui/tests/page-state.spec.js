import { EventEmitter } from 'node:events';
import helpers from '../../../checks/page-state.cjs';

export default async function (check) {
  const base = 'http://127.0.0.1:5180/';
  const page = new EventEmitter();
  const errors = helpers.watchPage(page, base);
  const consoleError = (text, url) => page.emit('console', {
    type: () => 'error', text: () => text, location: () => ({ url }),
  });
  const response = (url, status) => page.emit('response', { url: () => url, status: () => status });
  for (const path of ['favicon.ico', 'src/main.js.map?version=1']) {
    response(base + path, 404);
    consoleError('Failed to load resource: the server responded with a status of 404 (Not Found)', base + path);
  }
  check('page check: dev noise is ignored in both response and browser console events',
    errors.http.length === 0 && errors.console.length === 0);
  response(base + 'src/bind-worker.js', 404);
  consoleError('Failed to load resource: the server responded with a status of 404 (Not Found)', base + 'src/bind-worker.js');
  consoleError('application error', base + 'src/main.js.map');
  page.emit('pageerror', new Error('uncaught'));
  check('page check: real resource failures and application errors still fail separately',
    errors.http.length === 1 && errors.http[0].includes('bind-worker.js')
    && errors.console.length === 2 && errors.page.length === 1);

  const previous = globalThis.window;
  let clicked = false;
  try {
    globalThis.window = { __studio: { shapes: [{}] }, __rig: {}, __studioReady: false };
    await helpers.waitForBoot({
      async waitForFunction(predicate) {
        check('page check: a shape and controller do not establish boot completion', predicate() === false);
        // Wardrobe work may take longer than any chosen idle window. Only the signal matters.
        window.__studio.shapes = [];
        window.__studioReady = true;
        check('page check: explicit boot completion works for an empty restored document too', predicate() === true);
      },
      async click() { clicked = true; },
    });
    check('page check: welcome dismissal follows boot completion', clicked);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }

  // --- styleFailures: is the studio's own stylesheet actually in force? ---
  //
  // Both fixtures are REAL measurements. `styled` is what the working page reported; `unstyled` is
  // what the broken one reported on 2026-09-22, when a dev server had cached style.css as zero
  // bytes. That page served a clean 200 with content-type text/css, logged nothing, and put the
  // sheet in document.styleSheets — every existing check passed while it rendered in Times New
  // Roman with no layout. Nothing but these values distinguishes the two.
  const styled = {
    href: 'http://localhost:5173/src/style.css',
    ruleCount: 231,
    bodyFont: 'Rajdhani, sans-serif',
    bodyBackground: 'rgb(5, 11, 21)',
    topbarDisplay: 'flex',
  };
  const unstyled = {
    href: 'http://localhost:5173/src/style.css',
    ruleCount: 0,
    bodyFont: '"Times New Roman"',
    bodyBackground: 'rgba(0, 0, 0, 0)',
    topbarDisplay: 'block',
  };
  check('page check: a properly styled page reports nothing wrong',
    helpers.styleFailures(styled).length === 0);
  const broken = helpers.styleFailures(unstyled);
  check('page check: the real unstyled page is caught', broken.length > 0);
  check('page check: it names the empty stylesheet, not just the symptoms',
    broken.some((f) => /NO rules/.test(f)));
  check('page check: it names every symptom, so the cause is diagnosable from the failure alone',
    broken.some((f) => /Times New Roman/.test(f)) && broken.some((f) => /background/.test(f)) &&
    broken.some((f) => /#topbar/.test(f)));

  // Each clause must fail ON ITS OWN, or a fixture that happens to break several at once would
  // hide a clause that never fires.
  check('page check: an empty stylesheet alone fails, even when the cascade still looks right',
    helpers.styleFailures({ ...styled, ruleCount: 0 }).length === 1);
  check('page check: a truncated stylesheet alone fails',
    helpers.styleFailures({ ...styled, ruleCount: helpers.MIN_RULES - 1 }).length === 1);
  check('page check: the real rule count is far above the truncation floor, so housekeeping is safe',
    helpers.MIN_RULES < styled.ruleCount / 4 &&
    helpers.styleFailures({ ...styled, ruleCount: helpers.MIN_RULES }).length === 0);
  check('page check: a missing stylesheet alone fails',
    helpers.styleFailures({ ...styled, href: null }).length === 1);
  check('page check: a wrong body font alone fails',
    helpers.styleFailures({ ...styled, bodyFont: 'serif' }).length === 1);
  check('page check: a wrong body background alone fails',
    helpers.styleFailures({ ...styled, bodyBackground: 'rgb(255, 255, 255)' }).length === 1);
  check('page check: a collapsed topbar alone fails',
    helpers.styleFailures({ ...styled, topbarDisplay: 'block' }).length === 1);
  check('page check: a missing topbar is reported, never silently accepted',
    helpers.styleFailures({ ...styled, topbarDisplay: 'no #topbar' }).length === 1);
  check('page check: no probe at all is a failure, not a pass',
    helpers.styleFailures(null).length === 1 && helpers.styleFailures(undefined).length === 1 &&
    helpers.styleFailures('nope').length === 1);
}
