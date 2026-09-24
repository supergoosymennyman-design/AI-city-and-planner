/** Verify the built localhost Hub keeps the presentation on one origin. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.DEMO_ORIGIN || 'http://localhost:8378';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(origin + '/hub/');
  assert.equal(await page.locator('.external-tag').first().textContent(), 'LOCAL TOOL');
  for (const [selector, route] of [
    ['.planner-card .card-action', '/planner/'],
    ['.city-card .card-action', '/city-builder/?example=1'],
    ['#studio-action', '/studio/'],
    ['#workshop-action', '/workshop/'],
  ]) assert.equal(await page.locator(selector).getAttribute('href'), route,
    `${selector} leaves the local demo`);

  await page.getByRole('link', { name: /Open Planner/ }).click();
  await page.waitForURL(origin + '/planner/');
  await page.goBack();
  await page.locator('.city-card .card-action').click();
  await page.waitForURL(origin + '/city-builder/?example=1');
  await page.locator('canvas').first().waitFor({ timeout: 60000 });
  assert.deepEqual(errors, []);
  console.log('PASS Hub cards and visible navigation stay on the localhost origin');
} finally {
  await context.close();
  await browser.close();
}
