// Fit the scorecard on the TRAINING loans and store every learned constant in the database.
// Usage: node scripts/berka/fit_scorecard.js   (needs berka.loan_features from 10_features.sql)
//
// Steps: evidence per candidate metric -> drop weak / duplicate metrics -> bands and points ->
// short-history shrinkage -> logistic regression weights -> grade cut-offs.
const { connect, runFile } = require('./lib/db');
const sc = require('./lib/scorecard');

// Candidate metrics. window = measured over the 12 months before the loan (shrunk for short history).
const CANDIDATES = [
  { metric: 'penalty_events', criterion: 'payment', window: true },
  { metric: 'negative_balance_events', criterion: 'payment', window: true },
  { metric: 'dti', criterion: 'income', window: true },
  { metric: 'income_sources', criterion: 'income', window: false },
  { metric: 'monthly_inflow', criterion: 'income', window: false },
  { metric: 'balance_volatility', criterion: 'balance', window: true },
  { metric: 'min_balance', criterion: 'balance', window: true },
  { metric: 'balance_trend', criterion: 'balance', window: false },
  { metric: 'spend_to_income', criterion: 'balance', window: false },
  { metric: 'history_months', criterion: 'relationship', window: false },
  { metric: 'has_card', criterion: 'relationship', window: false, binary: true },
  { metric: 'joint_account', criterion: 'relationship', window: false, binary: true },
  { metric: 'age_at_loan', criterion: 'demographics', window: false },
  { metric: 'district_unemployment', criterion: 'demographics', window: false },
];
const CRITERIA = ['payment', 'income', 'balance', 'relationship', 'demographics'];
const MIN_GINI = 0.10;      // below this a metric barely separates good from bad
const MAX_CORR = 0.5;       // |Spearman| at or above this = the two metrics measure the same thing
const SHRINK_KS = [3, 6, 12];
const L2 = 1.0;

const num = (v) => (v === null || v === undefined ? null : Number(v));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const r3 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);

function quartileBadRates(x, y) {
  const rows = x.map((v, i) => [v, y[i]]).filter(([v]) => v !== null).sort((a, b) => a[0] - b[0]);
  return [0, 1, 2, 3].map((q) => {
    const g = rows.slice(Math.floor((q * rows.length) / 4), Math.floor(((q + 1) * rows.length) / 4));
    return g.length ? g.reduce((s, r) => s + r[1], 0) / g.length : null;
  });
}

// Bands + points for one metric, learned on train.
function buildBands(c, values, y) {
  const g = sc.gini(values, y);
  const cuts = c.binary ? [0] : sc.quantileCuts(values, 4);
  const nullBand = g > 0 ? cuts.length : 0;           // missing value -> the riskier end
  const raw = values.map((v) => (v === null ? nullBand : sc.assignBand(v, cuts)));
  const bp = sc.bandPoints(raw, y);
  const bands = bp.points.map((points, gi) => {
    const members = bp.mapBand.map((m, b) => (m === gi ? b : null)).filter((b) => b !== null);
    const lo = Math.min(...members), hi = Math.max(...members);
    return { band: gi, lower: lo === 0 ? null : cuts[lo - 1], upper: hi === cuts.length ? null : cuts[hi],
      points, bad_rate: bp.badRate[gi], n_train: bp.n[gi] };
  });
  return { bands, nullBand: bp.mapBand[nullBand], pointsOf: (v) => bp.points[bp.mapBand[v === null ? nullBand : sc.assignBand(v, cuts)]] };
}

function scoreRows(rows, metrics, k) {
  // points per metric per row, with shrinkage for window metrics
  return metrics.map((m) => {
    const p = rows.map((r) => m.pointsOf(r[m.metric]));
    if (!m.window) return p;
    const avg = mean(p);
    return p.map((v, i) => sc.shrink(v, avg, rows[i].months_observed, k));
  });
}

function fitWith(train, y, metrics, k) {
  const P = scoreRows(train, metrics, k);                    // [metric][row]
  const X = train.map((_, i) => metrics.map((_, j) => P[j][i] / 100));
  const model = sc.fitLogistic(X, y, { l2: L2 });
  const sds = metrics.map((_, j) => sd(P[j].map((v) => v / 100)));
  const weights = sc.weightsFromCoef(model.coef, sds);
  const scores = train.map((_, i) => metrics.reduce((s, _, j) => s + weights[j] * P[j][i], 0));
  return { model, weights, scores, gini: -sc.gini(scores, y) };   // higher score = safer, so flip sign
}

async function main() {
  const db = await connect();
  try {
    const { rows } = await db.query('SELECT * FROM berka.loan_features ORDER BY loan_date, loan_id');
    for (const r of rows) for (const k of Object.keys(r)) if (typeof r[k] === 'string' && k !== 'split' && k !== 'status' && !/date/.test(k)) r[k] = num(r[k]);
    const train = rows.filter((r) => r.split === 'train');
    const y = train.map((r) => (r.is_bad ? 1 : 0));
    const yAll = rows.map((r) => (r.is_bad ? 1 : 0));

    // 1. Evidence per candidate
    const ev = CANDIDATES.map((c) => {
      const x = train.map((r) => num(r[c.metric]));
      const q = quartileBadRates(x, y);
      return { ...c, x, gini: sc.gini(x, y), giniAll: sc.gini(rows.map((r) => num(r[c.metric])), yAll), q };
    });

    // 2. Correlation between candidates (train)
    const corr = [];
    for (let i = 0; i < ev.length; i++) for (let j = i + 1; j < ev.length; j++)
      corr.push({ a: ev[i].metric, b: ev[j].metric, r: sc.rankCorr(ev[i].x, ev[j].x) });
    const corrOf = (a, b) => corr.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)).r;

    // 3. Selection: weak first, then keep the stronger of each correlated pair
    for (const e of ev) {
      if (Math.abs(e.gini) < MIN_GINI) { e.verdict = 'dropped_weak'; e.reason = `|Gini| ${Math.abs(e.gini).toFixed(2)} < ${MIN_GINI}: barely separates good from bad loans`; }
    }
    const strong = ev.filter((e) => !e.verdict).sort((a, b) => Math.abs(b.gini) - Math.abs(a.gini));
    const kept = [];
    for (const e of strong) {
      const twin = kept.find((k) => Math.abs(corrOf(e.metric, k.metric)) >= MAX_CORR);
      if (twin) { e.verdict = 'dropped_duplicate'; e.reason = `rank correlation ${corrOf(e.metric, twin.metric).toFixed(2)} with ${twin.metric} (stronger, |Gini| ${Math.abs(twin.gini).toFixed(2)}): would count the same behaviour twice`; }
      else kept.push(e);
    }

    // 4. Bands and points; drop metrics whose bands all merge into one
    let metrics = [];
    for (const e of kept) {
      const b = buildBands(e, e.x, y);
      if (b.bands.length < 2) { e.verdict = 'dropped_weak'; e.reason = 'bad rate not monotonic in any banding: all bands merged into one'; continue; }
      metrics.push(Object.assign(e, b));
    }

    // 5. Regression; a metric with a non-negative coefficient adds nothing once the others are known
    let best;
    for (;;) {
      best = null;
      for (const k of SHRINK_KS) {
        const f = fitWith(train, y, metrics, k);
        if (!best || f.gini > best.gini + 1e-9) best = { ...f, k };
      }
      const bad = best.model.coef.findIndex((c) => c >= 0);
      if (bad < 0) break;
      const e = metrics[bad];
      e.verdict = 'dropped_no_added_value';
      e.reason = 'regression coefficient points the wrong way once the other metrics are included: no added information';
      metrics = metrics.filter((_, j) => j !== bad);
    }
    for (const m of metrics) { m.verdict = 'kept'; m.reason = `|Gini| ${Math.abs(m.gini).toFixed(2)}, bad rate falls steadily across its bands`; }

    // 6. Grade cut-offs on train scores
    const pbr = mean(y);
    const cut = sc.gradeCutoffs(best.scores, y, pbr);

    // 7. Store
    await db.query('BEGIN');
    await runFile(db, '01_constants_schema.sql');
    await db.query('TRUNCATE berka.metric_evidence, berka.metric_correlation, berka.scorecard_band, berka.scorecard_weight, berka.criterion_weight, berka.scorecard_param');
    for (const e of ev)
      await db.query('INSERT INTO berka.metric_evidence VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [e.metric, e.criterion, r3(e.gini), r3(e.giniAll), ...e.q.map(r3), e.verdict, e.reason]);
    for (const c of corr) await db.query('INSERT INTO berka.metric_correlation VALUES ($1,$2,$3)', [c.a, c.b, r3(c.r)]);
    for (const [j, m] of metrics.entries()) {
      for (const b of m.bands)
        await db.query('INSERT INTO berka.scorecard_band VALUES ($1,$2,$3,$4,$5,$6,$7)', [m.metric, b.band, b.lower, b.upper, b.points, r3(b.bad_rate), b.n_train]);
      await db.query('INSERT INTO berka.scorecard_weight VALUES ($1,$2,$3,$4,$5,$6)',
        [m.metric, m.criterion, best.model.coef[j].toFixed(4), best.weights[j].toFixed(4), m.nullBand, m.window]);
    }
    for (const c of CRITERIA)
      await db.query('INSERT INTO berka.criterion_weight VALUES ($1,$2)', [c, metrics.reduce((s, m, j) => s + (m.criterion === c ? best.weights[j] : 0), 0).toFixed(4)]);
    const params = { shrink_k: best.k, approve_cutoff: cut.approve, grade_A: cut.A, grade_B: cut.B, grade_C: cut.C, grade_D: cut.D,
      l2: L2, train_gini: best.gini, portfolio_bad_rate: pbr, n_train: train.length, n_train_bad: y.reduce((s, v) => s + v, 0) };
    for (const [n, v] of Object.entries(params)) await db.query('INSERT INTO berka.scorecard_param VALUES ($1,$2)', [n, Math.round(v * 10000) / 10000]);
    await db.query('COMMIT');

    // 8. Summary
    console.log('Evidence:');
    console.table(ev.map((e) => ({ metric: e.metric, gini: r3(e.gini), verdict: e.verdict })));
    console.log('Kept metrics:');
    console.table(metrics.map((m, j) => ({ metric: m.metric, criterion: m.criterion, coef: +best.model.coef[j].toFixed(3), weight: +(100 * best.weights[j]).toFixed(1), bands: m.bands.map((b) => b.points).join('/') })));
    console.log('shrink k', best.k, '| train Gini', best.gini.toFixed(3), '| cut-offs', JSON.stringify(Object.fromEntries(Object.entries(cut).map(([k, v]) => [k, +v.toFixed(2)]))));
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
