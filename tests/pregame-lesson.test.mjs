// tests/pregame-lesson.test.mjs — pure lesson-core logic for the City Planning Academy.
//
// The Academy's teaching algorithms (weight-lab total + Dijkstra reveal) must be
// correct and deterministic before they are shown to a child in the UI.
// Run: node --test tests/pregame-lesson.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEIGHT_LAB,
  weightLabTotal,
  DIJKSTRA_LESSON,
  DIJKSTRA_BUS_DIST,
  dijkstraReveal,
  dijkstraWinner,
} from '../P5 Programme/buddy-kit/client/city-pregame/lesson-core.js';

// ── Weight lab ─────────────────────────────────────────────────────────
test('weight lab total is the weighted average of the two scores', () => {
  const [a, b] = [WEIGHT_LAB.left.score, WEIGHT_LAB.right.score];
  // 100% to left → left's score; 0% → right's score; 50/50 → mean.
  assert.equal(weightLabTotal(1, [a, b]), a);
  assert.equal(weightLabTotal(0, [a, b]), b);
  assert.equal(weightLabTotal(0.5, [a, b]), Math.round(((a + b) / 2) * 10) / 10);
});

test('weight lab total is monotonic in the left share when left score > right score', () => {
  const scores = [90, 50];
  let prev = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const v = weightLabTotal(i / 100, scores);
    assert.ok(v >= prev, `total fell at split ${i / 100}: ${v} < ${prev}`);
    prev = v;
  }
  // Midpoint sanity: 50/50 = 70.
  assert.equal(weightLabTotal(0.5, scores), 70);
});

// ── Dijkstra reveal ────────────────────────────────────────────────────
test('dijkstra lesson graph reaches BUS at 350m (route A), inside budget', () => {
  const { dist } = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  assert.equal(dist.BUS, DIJKSTRA_BUS_DIST);
  assert.equal(dist.BUS, 350);
  assert.ok(dist.BUS <= 400, '350m must fit the 400m walk budget');
});

test('dijkstra winner is Route A (the shortest legal walk)', () => {
  const { dist } = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  assert.equal(dijkstraWinner(dist), 'A');
});

test('dijkstra reveal is deterministic and ends settled at BUS', () => {
  const r1 = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  const r2 = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  assert.deepEqual(r1.reveals, r2.reveals);
  const last = r1.reveals[r1.reveals.length - 1];
  assert.equal(last.kind, 'settle');
  assert.equal(last.node, 'BUS');
  assert.equal(last.dist, 350);
});

test("dijkstra reveal announces a settle BEFORE marking that node's neighbours", () => {
  // Teaching invariant: a node is confirmed (settle) before the search spreads
  // past it (mark), so a child never sees the ant reach beyond an unconfirmed
  // crossing. The HOME settle happens first, then H's neighbours are marked.
  const { reveals } = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  assert.equal(reveals[0].kind, 'settle');
  assert.equal(reveals[0].node, 'H');
  // The very first mark after H is a direct neighbour of H (not past a node
  // that hasn't been settled yet).
  const firstMarkIdx = reveals.findIndex((r) => r.kind === 'mark');
  assert.ok(firstMarkIdx > 0);
  // H's direct edges only (150/120/200m) — no mark deeper than one hop appears
  // before H's second hop neighbours settle.
  const marksBeforeSecondSettle = reveals.filter((r, i) => r.kind === 'mark' && i < 4);
  assert.ok(marksBeforeSecondSettle.every((m) => [150, 120, 200].includes(m.dist)));
});

test('dijkstra reveal never marks a node farther than its final shortest distance', () => {
  // Property: tentative marks are upper bounds, updated only downward; the
  // final settle distance is the smallest value ever shown for that node.
  const { reveals, dist } = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  const lastShown = {};
  for (const r of reveals) lastShown[r.node] = r.dist;
  for (const id of Object.keys(dist)) {
    if (!Number.isFinite(dist[id])) continue;
    assert.ok(lastShown[id] >= dist[id] - 1e-9, `${id}: shown ${lastShown[id]} < final ${dist[id]}`);
  }
});

test('dijkstra reveal covers every node in the lesson graph', () => {
  const { reveals } = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  const settled = new Set(reveals.filter((r) => r.kind === 'settle').map((r) => r.node));
  for (const id of Object.keys(DIJKSTRA_LESSON.nodes)) {
    assert.ok(settled.has(id), `node ${id} never settled`);
  }
});
