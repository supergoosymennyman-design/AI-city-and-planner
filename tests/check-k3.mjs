// check-k3.mjs — deterministic QA checks for all deployed K3 games.
// Run: node tests/check-k3.mjs
// Exits nonzero if any game fails a Critical check.
//
// Checks (deterministic only — the repeatable 40-50% of QA):
//   [URL]       HTTP status is 200 (not 404/500)
//   [CONSOLE]   no console errors on load
//   [SCROLL]    every visible button is reachable at 1024x600 landscape
//   [INTRO]     an intro/start element exists (speech bubble or start button)
//   [CELEB]     a celebration/complete element exists
//   [NAME]      character name is "Ms. AI", not "Bo"/"Sprout"/"Botly"
//
// Human-judgment checks (NOT automated): TTS pronunciation, camera black
// screen, drag ghost bugs, background theme fit, narrative feel.

import { chromium } from '@playwright/test';

const URLS = [
  'https://k3-01-zoo-visit.samuelliys.workers.dev',
  'https://k3-02-follow-the-pattern.samuelliys.workers.dev',
  'https://k3-03-ai-architect.samuelliys.workers.dev',
  'https://k3-04-emotion-mix-up.samuelliys.workers.dev',
  'https://k3-05-arrange-the-feelings.samuelliys.workers.dev',
  'https://k3-06-left-right-up-down.samuelliys.workers.dev',
  'https://8c8feb9a.k3-07-my-own-instrument.pages.dev',
  'https://k3-08-fingers-and-joints-dance.samuelliys.workers.dev',
  'https://ancient-bird-cb9c.ivanlailai11.workers.dev',
  'https://k3-10-instant-story-time.samuelliys.workers.dev',
  'https://k3-11-numbers-on-fingers.samuelliys.workers.dev',
  'https://k3-12-play-doh-fruits.samuelliys.workers.dev',
  'https://aged-sunset-704d.ivanlailai11.workers.dev',
  'https://k3-16-step-step-stop.samuelliys.workers.dev',
  'https://proud-lake-d496.ivanlailai11.workers.dev',
  'https://curly-snow-3e8d.ivanlailai11.workers.dev',
  'https://k3-19-happy-feet-angry-stomp.samuelliys.workers.dev',
  'https://holy-dawn-56be.ivanlailai11.workers.dev',
];

const TIMEOUT = 20000; // ms per game
const VIEWPORT = { width: 1024, height: 600 }; // landscape tablet Chrome

const BAD_NAMES = ['bo', 'sprout', 'botly', 'buddy'];

async function checkGame(url) {
  const result = { url, ok: {}, bad: {} };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  // Console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  // Page errors (uncaught exceptions)
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    result.ok.url = resp && resp.status() === 200;
    result.bad.url = resp ? `status ${resp.status()}` : 'no response';

    // Wait a beat for scripts to run
    await page.waitForTimeout(1500);

    result.ok.console = consoleErrors.length === 0 && pageErrors.length === 0;
    result.bad.console = [...consoleErrors, ...pageErrors].slice(0, 2).join(' | ');

    // Buttons reachable at 1024x600
    const offscreen = await page.evaluate(() => {
      const vh = window.innerHeight;
      const bad = [];
      document.querySelectorAll('button, [role="button"], a').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > vh + 1 || r.top < -1) {
          bad.push(`${el.textContent.trim().slice(0, 24) || el.className.slice(0, 20)}@y${Math.round(r.top)}-${Math.round(r.bottom)}`);
        }
      });
      return bad.slice(0, 4);
    });
    result.ok.scroll = offscreen.length === 0;
    result.bad.scroll = offscreen.join(', ');

    // Intro + celebration elements
    const hasIntro = await page.evaluate(() => {
      const s = document.body.innerText.toLowerCase();
      const els = document.querySelectorAll('[id*="intro" i], [id*="start" i], [id*="hook" i], [class*="intro" i]');
      return els.length > 0;
    });
    result.ok.intro = hasIntro;
    result.bad.intro = hasIntro ? '' : 'no intro/start element';

    const hasCeleb = await page.evaluate(() => {
      const els = document.querySelectorAll('[id*="celeb" i], [id*="complete" i], [id*="done" i], [class*="celeb" i]');
      return els.length > 0;
    });
    result.ok.celeb = hasCeleb;
    result.bad.celeb = hasCeleb ? '' : 'no celebration element';

    // Character name scan
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const title = await page.title();
    const foundBad = BAD_NAMES.filter((n) => bodyText.includes(n) || title.toLowerCase().includes(n));
    const foundMsAi = bodyText.includes('ms. ai') || title.toLowerCase().includes('ms. ai');
    result.ok.name = foundBad.length === 0;
    result.bad.name = foundBad.length ? `found "${foundBad.join(', ')}"` : (foundMsAi ? '' : 'no "Ms. AI" and no bad names');

  } catch (e) {
    result.ok.url = false;
    result.bad.url = 'load error: ' + (e.message || '').slice(0, 80);
    result.ok.console = false;
    result.bad.console = 'load failed';
  } finally {
    await browser.close();
  }
  return result;
}

function fmt(v) { return v ? '✅' : '❌'; }

const results = [];
for (const url of URLS) {
  const r = await checkGame(url);
  results.push(r);
  console.log(`${fmt(r.ok.url)} ${fmt(r.ok.console)} ${fmt(r.ok.scroll)} ${fmt(r.ok.intro)} ${fmt(r.ok.celeb)} ${fmt(r.ok.name)}  ${url}`);
  for (const k of ['url', 'console', 'scroll', 'intro', 'celeb', 'name']) {
    if (!r.ok[k] && r.bad[k]) console.log(`        ${k.toUpperCase()}: ${r.bad[k]}`);
  }
}

// Summary
const critical = ['url', 'console', 'scroll'];
let failCount = 0;
console.log('\n=== SUMMARY ===');
for (const r of results) {
  const fails = critical.filter((k) => !r.ok[k]);
  const allFails = Object.keys(r.ok).filter((k) => !r.ok[k]);
  const label = allFails.length === 0 ? 'ALL PASS' : (fails.length ? 'FAIL' : 'PASS*');
  if (fails.length) failCount++;
  const status = allFails.length === 0 ? '6/6' : `${allFails.length}/6`;
  console.log(`[${label}] ${status} checks  ${r.url}  (critical: ${fails.join(', ') || 'ok'} · other: ${allFails.filter(k => !fails.includes(k)).join(', ') || 'ok'})`);
}
console.log(`\n${results.length - failCount}/${results.length} games pass CRITICAL checks (URL + console + scroll).`);
console.log(`Games fully clean: ${results.filter(r => Object.keys(r.ok).every(k => r.ok[k])).length}/${results.length}`);
process.exit(failCount ? 1 : 0);
