const test = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../scripts/lib/scorecard');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

test('auc is 1 when every bad scores above every good', () => {
  assert.equal(sc.auc([1, 2, 3, 4], [0, 0, 1, 1]), 1);
});

test('auc counts ties as half', () => {
  assert.equal(sc.auc([1, 1], [0, 1]), 0.5);
});

test('auc ignores null values', () => {
  assert.equal(sc.auc([1, null, 3], [0, 1, 1]), 1);
});

test('gini is negative when higher values are safer', () => {
  assert.equal(sc.gini([1, 2, 3, 4], [1, 1, 0, 0]), -1);
});

test('rankCorr is -1 for perfectly reversed order', () => {
  close(sc.rankCorr([1, 2, 3], [3, 2, 1]), -1);
});

test('quantileCuts on heavy ties gives unique cuts and no empty band', () => {
  const x = [0, 0, 0, 0, 0, 0, 1, 2];
  const cuts = sc.quantileCuts(x, 4);
  assert.equal(new Set(cuts).size, cuts.length);
  const counts = new Array(cuts.length + 1).fill(0);
  x.forEach((v) => counts[sc.assignBand(v, cuts)]++);
  assert.ok(counts.every((c) => c > 0), `empty band in ${counts}`);
});

test('assignBand puts values above the last cut in the top band', () => {
  assert.equal(sc.assignBand(10, [1, 5]), 2);
  assert.equal(sc.assignBand(1, [1, 5]), 0);
});

test('bandPoints gives the safest band 100 and the riskiest 10', () => {
  const r = sc.bandPoints([0, 0, 1, 1, 2, 2], [0, 0, 0, 1, 1, 1]);
  assert.equal(r.points[0], 100);
  assert.equal(r.points[r.points.length - 1], 10);
  for (let i = 1; i < r.badRate.length; i++) assert.ok(r.badRate[i] >= r.badRate[i - 1]);
});

test('bandPoints merges bands until bad rate is monotonic', () => {
  // band 1 is safer than band 0 -> not monotonic -> merged
  const bands = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];
  const y =     [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0];
  const r = sc.bandPoints(bands, y);
  const uniq = r.badRate.slice();
  const inc = uniq.every((v, i) => i === 0 || v >= uniq[i - 1]);
  const dec = uniq.every((v, i) => i === 0 || v <= uniq[i - 1]);
  assert.ok(inc || dec, `not monotonic: ${uniq}`);
  assert.equal(r.mapBand.length, 3);
  assert.equal(r.badRate.length, 2);
  assert.equal(r.mapBand[0], r.mapBand[1]);
});

test('shrink pulls short histories toward the average', () => {
  close(sc.shrink(100, 60, 3, 6), 73.3333333, 1e-4);
  close(sc.shrink(100, 60, 1e9, 6), 100, 1e-4);
});

test('bandPoints ranks four bands 100/70/40/10, in either direction', () => {
  const bands = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
  const up = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1];
  assert.deepEqual(sc.bandPoints(bands, up).points, [100, 70, 40, 10]);
  assert.deepEqual(sc.bandPoints(bands, up.slice().reverse()).points, [10, 40, 70, 100]);
});

test('weightsFromStrength gives each metric its share of the total strength', () => {
  const w = sc.weightsFromStrength([-0.4, 0.2]);
  close(w[0], 2 / 3);
  close(w[1], 1 / 3);
});

test('gradeCutoffs approves only above-average-safety scores and orders grades', () => {
  const scores = [], y = [];
  for (let i = 0; i < 100; i++) { scores.push(90 + (i % 10)); y.push(i % 50 === 0 ? 1 : 0); }   // 2% bad
  for (let i = 0; i < 100; i++) { scores.push(30 + (i % 20)); y.push(i % 5 < 2 ? 1 : 0); }    // 40% bad
  const c = sc.gradeCutoffs(scores, y, 0.21);
  assert.ok(c.approve > 49 && c.approve <= 90, `approve ${c.approve}`);
  assert.ok(c.A >= c.B && c.B >= c.C && c.C >= c.approve && c.approve >= c.D, JSON.stringify(c));
});

test('grade maps scores using the cut-offs', () => {
  const c = { A: 80, B: 70, C: 60, approve: 60, D: 40 };
  assert.equal(sc.grade(85, c), 'A');
  assert.equal(sc.grade(60, c), 'C');
  assert.equal(sc.grade(59.9, c), 'D');
  assert.equal(sc.grade(10, c), 'E');
});
