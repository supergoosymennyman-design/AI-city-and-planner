// Browser-check helpers kept free of Playwright imports so the Node suite can exercise them.
function watchPage(page, baseURL) {
  const errors = { page: [], console: [], http: [] };
  const isNoise = (url) => url.startsWith(baseURL)
    && (/\/favicon\.ico(\?|$)/.test(url) || /\.map(\?|$)/.test(url));
  page.on('pageerror', (e) => errors.page.push(String(e)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Chromium reports an HTTP miss twice: as a response and as a console error. Filter only
    // the browser's resource diagnostic, never application console.error calls at that URL.
    if (message.text().startsWith('Failed to load resource:') && isNoise(message.location().url)) return;
    errors.console.push(message.text());
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() < 400 || !url.startsWith(baseURL) || isNoise(url)) return;
    errors.http.push(`HTTP ${response.status()} ${url}`);
  });
  return errors;
}

/** Wait for asynchronous document AND wardrobe restoration, even for an empty saved scene. */
async function waitForBoot(page) {
  await page.waitForFunction(() => window.__studioReady === true, null, { timeout: 60000 });
  await page.click('#welcome-go', { timeout: 5000 }).catch(() => {});
}

/**
 * What to read from a loaded studio page to tell whether its OWN stylesheet is in force.
 *
 * Passed to page.evaluate() by the browser checks. Kept beside styleFailures() so the thing
 * measured and the rule applied to it cannot drift apart.
 */
function styleProbe() {
  const body = getComputedStyle(document.body);
  const topbar = document.getElementById('topbar');
  const own = [...document.styleSheets].find((sheet) => /\/src\/style\.css/.test(sheet.href || ''));
  let ruleCount = -1;
  try {
    ruleCount = own ? own.cssRules.length : 0;
  } catch (err) {
    ruleCount = -1; // cross-origin sheet; not our case, but never throw inside a probe
  }
  return {
    bodyFont: body.fontFamily,
    bodyBackground: body.backgroundColor,
    topbarDisplay: topbar ? getComputedStyle(topbar).display : 'no #topbar',
    ruleCount,
    href: own ? own.href : null,
  };
}

/** Far below the real rule count, so only a truncated stylesheet can fall under it. */
const MIN_RULES = 50;

/**
 * Everything wrong with a style probe — empty when the page is properly styled.
 *
 * WHY this check exists at all: the studio shipped twice in a state where every test and every
 * browser check passed while the real page rendered in Times New Roman with no layout. The
 * stylesheet is a render-blocking <link> in index.html, so when it fails it fails SILENTLY — no
 * console error, no failed request, a clean 200. The second time, a long-running dev server had
 * cached the file as ZERO BYTES: it served `text/css`, the sheet appeared in document.styleSheets,
 * and it contained no rules. Hence ruleCount: a sheet that loaded is not a sheet that styled.
 *
 * @param {ReturnType<typeof styleProbe>} probe
 * @returns {string[]} human-readable failures, most specific first
 */
function styleFailures(probe) {
  if (!probe || typeof probe !== 'object') return ['no style probe was taken'];
  const failures = [];
  if (!probe.href) failures.push('the studio stylesheet is not in document.styleSheets at all');
  // An empty sheet is the failure actually observed, so it is checked exactly. The band below is
  // only a net for a partial write; it sits far under the real count (231 at the time of writing)
  // so that ordinary CSS housekeeping can never trip it.
  if (probe.ruleCount === 0) failures.push('the studio stylesheet loaded but holds NO rules (served empty?)');
  else if (probe.ruleCount > 0 && probe.ruleCount < MIN_RULES) {
    failures.push(`the studio stylesheet holds only ${probe.ruleCount} rules — it looks truncated`);
  }
  if (!/Rajdhani/i.test(String(probe.bodyFont || ''))) {
    failures.push(`body font is ${JSON.stringify(probe.bodyFont)}, not the studio's Rajdhani`);
  }
  if (probe.bodyBackground !== 'rgb(5, 11, 21)') {
    failures.push(`body background is ${JSON.stringify(probe.bodyBackground)}, not --bg #050b15`);
  }
  if (probe.topbarDisplay !== 'flex') {
    failures.push(`#topbar is display:${probe.topbarDisplay}, not flex`);
  }
  return failures;
}

/** Throw unless the page is properly styled. Call after waitForBoot in any real-app check. */
async function assertStyled(page) {
  const probe = await page.evaluate(styleProbe);
  const failures = styleFailures(probe);
  if (failures.length) {
    throw new Error(['the studio page is not styled:', ...failures.map((f) => `  - ${f}`)].join('\n'));
  }
  return probe;
}

module.exports = { watchPage, waitForBoot, styleProbe, styleFailures, assertStyled, MIN_RULES };
