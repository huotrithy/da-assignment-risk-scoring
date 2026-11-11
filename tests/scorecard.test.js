const test = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../scripts/berka/lib/scorecard');

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

test('bandPoints gives the safest band 100 and the riskiest 0', () => {
  const r = sc.bandPoints([0, 0, 1, 1, 2, 2], [0, 0, 0, 1, 1, 1]);
  assert.equal(r.points[0], 100);
  assert.equal(r.points[r.points.length - 1], 0);
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

test('fitLogistic stays finite on a perfectly separating column', () => {
  const m = sc.fitLogistic([[1], [1], [0], [0]], [0, 0, 1, 1], { l2: 1 });
  assert.ok(Number.isFinite(m.intercept) && m.coef.every(Number.isFinite));
  assert.ok(m.coef[0] < 0);
});

test('weightsFromCoef normalises |coef| to 1', () => {
  const w = sc.weightsFromCoef([-2, 1]);
  close(w[0], 2 / 3);
  close(w[1], 1 / 3);
});

test('weighted score ranks loans the same way as the regression', () => {
  // metric 0 has a big coefficient but small spread; the score must still follow the model
  const coef = [-3, -1];
  const w = sc.weightsFromCoef(coef, [0.1, 1]);
  const a = [1, 0], b = [0, 1];                         // points/100 of two loans
  const lin = (p) => coef[0] * p[0] + coef[1] * p[1];   // lower = safer
  const score = (p) => w[0] * p[0] + w[1] * p[1];       // higher = safer
  assert.equal(lin(a) < lin(b), score(a) > score(b));
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
