import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseResumeWorkspace, parseCityLayout, projectHubView } from '../P5 Programme/buddy-kit/client/project-hub/hub-state.js';
import { FIT_STUDIO_URL, WORKSHOP_URL } from '../P5 Programme/buddy-kit/client/shared/links.js';

const html = readFileSync('P5 Programme/buddy-kit/client/project-hub/index.html', 'utf8');

test('project hub uses root-relative workspace routes and keeps both City choices visible', () => {
  assert.ok(html.includes('href="/planner/"'));
  for (const id of ['studio-action', 'workshop-action']) assert.match(html, new RegExp(`id="${id}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"`));
  assert.match(html, /href="\/city-builder\/\?example=1"/);
  assert.match(html, />Start in Planner </);
  assert.match(html, />Explore the example city</);
  assert.doesNotMatch(html, /<a[^>]+href="(?:\.\/|\.\.\/)/);
});

test('resume workspace follows explicit project state', () => {
  const project = { progress:{ lastWorkspace:'studio' }, projects:{ city:{}, planner:{}, studio:{}, workshop:{} } };
  assert.equal(chooseResumeWorkspace(project), 'studio');
  assert.equal(projectHubView(project).resumeRoute, FIT_STUDIO_URL);
  project.progress.lastWorkspace = 'workshop';
  assert.equal(projectHubView(project).resumeRoute, WORKSHOP_URL);
});

test('resume workspace selects meaningful saved content for older projects', () => {
  const layout = { version:2, scaleMeters:2000, roads:[], parks:[], buildings:[
    { type:'housing', pos:[100,100] }, { type:'shop', pos:[200,200] },
  ] };
  const project = { name:'Harbour Lab', revision:7, projects:{ city:{ legacyState:{ layout:JSON.stringify(layout) } }, studio:{ revision:3 }, workshop:{ machines:[{ id:'m1' }] }, planner:{} } };
  const view = projectHubView(project, 4);
  assert.equal(view.resumeWorkspace, 'city');
  assert.equal(view.buildingCount, 2);
  assert.equal(view.machineCount, 1);
  assert.equal(view.studioRevision, 3);
  assert.equal(view.checkpointCount, 4);
});

test('empty and damaged city state safely resumes in the Planner', () => {
  assert.equal(projectHubView({ projects:{ city:{ legacyState:{ layout:'{' } }, planner:{}, studio:{}, workshop:{} } }).resumeRoute, '/planner/');
});

test('only schema-valid layouts count as saved cities', () => {
  assert.equal(parseCityLayout(JSON.stringify({ buildings:[] })), null);
  const raw = JSON.stringify({ version:2, scaleMeters:2000, roads:[], parks:[], buildings:[] });
  assert.deepEqual(parseCityLayout(raw), JSON.parse(raw));
  assert.equal(projectHubView({ progress:{ lastWorkspace:'city' }, projects:{ city:{ legacyState:{ layout:'{' } } } }).resumeRoute, '/planner/');
  assert.equal(projectHubView({ projects:{ city:{ updatedAt:'2026-09-23T10:00:00Z', legacyState:{ layout:'{' } } } }).resumeRoute, '/planner/');
});
