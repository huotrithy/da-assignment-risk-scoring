// Scorecard maths: pure functions, no database. y is 0/1 with 1 = bad loan.

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(v);

// Area under the ROC curve: chance a random bad scores higher than a random good. Ties count half.
function auc(x, y) {
  const p = x.map((v, i) => [v, y[i]]).filter(([v, t]) => isNum(v) && isNum(t)).sort((a, b) => a[0] - b[0]);
  let sumPos = 0, nPos = 0;
  for (let i = 0; i < p.length;) {
    let j = i;
    while (j < p.length && p[j][0] === p[i][0]) j++;
    const rank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (p[k][1]) { sumPos += rank; nPos++; }
    i = j;
  }
  const nNeg = p.length - nPos;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

// Gini = 2*AUC - 1. Positive: higher x = riskier. Negative: higher x = safer.
const gini = (x, y) => 2 * auc(x, y) - 1;

function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    for (let k = i; k < j; k++) r[idx[k][1]] = (i + j - 1) / 2;
    i = j;
  }
  return r;
}

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

// Spearman rank correlation over rows where both values exist.
function rankCorr(a, b) {
  const keep = a.map((v, i) => i).filter((i) => isNum(a[i]) && isNum(b[i]));
  return pearson(ranks(keep.map((i) => a[i])), ranks(keep.map((i) => b[i])));
}

// Cut points at the 1/n … (n-1)/n quantiles; duplicates and the maximum removed so no band is empty.
function quantileCuts(x, nBands) {
  const s = x.filter(isNum).sort((a, b) => a - b);
  const cuts = [];
  for (let k = 1; k < nBands; k++) {
    const v = s[Math.ceil((k * s.length) / nBands) - 1];
    if (v < s[s.length - 1] && !cuts.includes(v)) cuts.push(v);
  }
  return cuts;
}

// Band index: values <= cuts[0] -> 0, …, above the last cut -> cuts.length.
function assignBand(v, cuts) {
  for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]) return i;
  return cuts.length;
}

function rateOf(groups) {
  return groups.map((g) => g.bad / g.n);
}

// Bands (0..k-1, ordered by metric value) -> merged bands with monotonic bad rate and 0–100 points.
// Points come from weight of evidence: ln(share of goods / share of bads), +0.5 smoothing,
// scaled so the safest band = 100 and the riskiest = 0.
function bandPoints(bands, y) {
  const k = Math.max(...bands) + 1;
  let groups = Array.from({ length: k }, (_, b) => ({ members: [b], n: 0, bad: 0 }));
  bands.forEach((b, i) => { groups[b].n++; groups[b].bad += y[i]; });
  groups = groups.filter((g) => g.n > 0);
  const r0 = rateOf(groups);
  const increasing = r0[r0.length - 1] >= r0[0];
  let merged = true;
  while (merged && groups.length > 1) {
    merged = false;
    const r = rateOf(groups);
    for (let i = 0; i < groups.length - 1; i++) {
      if (increasing ? r[i + 1] < r[i] : r[i + 1] > r[i]) {
        const a = groups[i], b = groups[i + 1];
        groups.splice(i, 2, { members: [...a.members, ...b.members], n: a.n + b.n, bad: a.bad + b.bad });
        merged = true;
        break;
      }
    }
  }
  const G = groups.reduce((s, g) => s + g.n - g.bad, 0), B = groups.reduce((s, g) => s + g.bad, 0);
  const woe = groups.map((g) => Math.log(((g.n - g.bad + 0.5) / G) / ((g.bad + 0.5) / B)));
  const lo = Math.min(...woe), hi = Math.max(...woe);
  const points = woe.map((w) => (hi === lo ? 50 : Math.round((100 * (w - lo)) / (hi - lo) * 100) / 100));
  const mapBand = new Array(k).fill(null);
  groups.forEach((g, gi) => g.members.forEach((m) => { mapBand[m] = gi; }));
  return { points, badRate: rateOf(groups), n: groups.map((g) => g.n), mapBand };
}

// Credibility weighting: few months observed -> points pulled toward the average.
const shrink = (points, avg, months, k) => avg + ((points - avg) * months) / (months + k);

// L2-regularised logistic regression by batch gradient descent. Deterministic (zero start).
function fitLogistic(X, y, { l2 = 1.0, iters = 5000, lr = 0.5 } = {}) {
  const n = X.length, p = X[0].length;
  let b0 = 0;
  const w = new Array(p).fill(0);
  for (let it = 0; it < iters; it++) {
    let g0 = 0;
    const g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      let z = b0;
      for (let j = 0; j < p; j++) z += w[j] * X[i][j];
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      g0 += e;
      for (let j = 0; j < p; j++) g[j] += e * X[i][j];
    }
    b0 -= (lr * g0) / n;
    for (let j = 0; j < p; j++) w[j] -= lr * (g[j] / n + (l2 * w[j]) / n);
  }
  return { intercept: b0, coef: w };
}

// Weight of each metric = |coef| x spread of its points, normalised to sum 1.
function weightsFromCoef(coef, sd) {
  const raw = coef.map((c, i) => Math.abs(c) * sd[i]);
  const tot = raw.reduce((s, v) => s + v, 0);
  return raw.map((v) => v / tot);
}

const quantileDesc = (sortedDesc, q) => sortedDesc[Math.min(sortedDesc.length - 1, Math.max(0, Math.ceil(q * sortedDesc.length) - 1))];

// Grade cut-offs (spec §6b). Walk score deciles from the top; approve a decile only while its own
// bad rate is below the portfolio average. A/B/C split the approved range in thirds, D/E the rejected range in half.
function gradeCutoffs(scores, y, portfolioBadRate) {
  const rows = scores.map((s, i) => [s, y[i]]).sort((a, b) => b[0] - a[0]);
  const desc = rows.map((r) => r[0]);
  let approve = desc[0];
  for (let d = 1; d <= 10; d++) {
    const lo = quantileDesc(desc, d / 10);
    const hi = d === 1 ? Infinity : quantileDesc(desc, (d - 1) / 10);
    const band = rows.filter(([s]) => s >= lo && s < hi);
    if (band.length === 0) continue;
    const rate = band.reduce((t, r) => t + r[1], 0) / band.length;
    if (rate >= portfolioBadRate) break;
    approve = lo;
  }
  const approved = desc.filter((s) => s >= approve);
  const rejected = desc.filter((s) => s < approve);
  const A = quantileDesc(approved, 1 / 3), B = quantileDesc(approved, 2 / 3);
  const D = rejected.length ? quantileDesc(rejected, 1 / 2) : approve;
  return { A, B, C: approve, approve, D: Math.min(D, approve) };
}

function grade(score, c) {
  if (score >= c.A) return 'A';
  if (score >= c.B) return 'B';
  if (score >= c.C) return 'C';
  if (score >= c.D) return 'D';
  return 'E';
}

module.exports = { auc, gini, rankCorr, quantileCuts, assignBand, bandPoints, shrink, fitLogistic, weightsFromCoef, gradeCutoffs, grade };
