import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../P5 Programme/', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('global project navigation exposes every presenter workspace', async () => {
  const bar = await text('buddy-kit/client/city-common/project-bar.js');
  for (const route of ['../hub/', '../pregame/', '../planner/', '../city-builder/', '../studio/', '../workshop/']) {
    assert.match(bar, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const academy = await text('buddy-kit/client/city-pregame/index.html');
  assert.match(academy, /mountProjectBar\(\{ workspace: 'academy' \}\)/);
  assert.match(academy, /class="btn-secondary academy-skip" href="\.\.\/planner\/"/);
});

test('Studio City transfer is unavailable until the real Champion loads', async () => {
  const [html, script] = await Promise.all([text('Fit Studio/index.html'), text('Fit Studio/tune.js')]);
  assert.match(html, /id="btnUseInCity"[^>]*disabled>Champion loading…<\/button>/);
  assert.match(script, /cityButton\.disabled = false; cityButton\.textContent = 'Use in AI City'/);
  assert.match(script, /preparation took too long/);
});

test('Workshop wrapper is honest, embedded, and always has local exits', async () => {
  const [html, script] = await Promise.all([
    text('buddy-kit/client/project-shell/index.html'),
    text('buddy-kit/client/project-shell/shell.js'),
  ]);
  assert.match(html, /not yet published into the City/);
  assert.match(html, /href="\.\.\/city-builder\/">Return to City/);
  assert.match(html, /href="\.\.\/hub\/">Return to Hub/);
  assert.match(html, /<iframe[^>]+allow="camera; microphone"/);
  assert.doesNotMatch(script, /publishTarget|workshop=published/);
});

test('localhost demo command uses the unified runtime and persistent demo saves', async () => {
  const [pkg, server, ignore] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    text('scripts/demo-server.mjs'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
  ]);
  const scripts = JSON.parse(pkg).scripts;
  assert.match(scripts.demo, /demo:prepare.*demo:start/);
  assert.match(server, /\/api\/demo\/health/);
  assert.match(server, /\.demo-data/);
  assert.match(server, /SAVES/);
  assert.match(ignore, /P5 Programme\/\.demo-data\//);
});
