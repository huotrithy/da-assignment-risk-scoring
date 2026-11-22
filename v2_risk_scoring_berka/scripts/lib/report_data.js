// Shared by generate_report.js and generate_slides.js: labels, number formats, paths, and every number
// the report and slides quote, read live from the berka scorecard tables.
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..', '..', '..');
const IMG = path.join(ROOT, 'docs', 'img', 'charts');
const DASHBOARD_URL = 'https://da-assignment.iamrithy.com/';

const METRIC = {
  penalty_events: 'Penalty-interest charges', negative_balance_events: 'Overdraft (negative-balance) events',
  dti: 'Loan payment ÷ monthly income', income_sources: 'Number of income sources', monthly_inflow: 'Monthly money in',
  balance_volatility: 'Balance volatility', min_balance: 'Lowest balance', balance_trend: 'Balance trend',
  spend_to_income: 'Spend ÷ income', history_months: 'Account age (months)', has_card: 'Has a card',
  joint_account: 'Joint account (two users)', age_at_loan: 'Age', district_unemployment: 'District unemployment',
};
// Kept metrics: the question, why it signals risk, how it is measured.
const DETAIL = {
  negative_balance_events: ['Has the account gone below zero?',
    'An overdraft means the money ran out. Each account has only one loan, so this is the closest sign of missed payments.',
    'Number of transactions that left a negative balance'],
  dti: ['Can the customer afford the monthly loan payment?',
    'The bigger the share of income the loan takes, the less is left for living costs.',
    'Monthly loan payment ÷ average money in per month (money in ÷ months observed)'],
  income_sources: ['Does money come from more than one source?',
    'A second source cushions the customer if one stops.',
    'Number of different accounts sending money in by bank transfer'],
  balance_volatility: ['Is the balance steady, or does it swing?',
    'Big swings point to irregular income or spending, which makes repayments harder to plan.',
    'Spread (standard deviation) of month-end balances ÷ their average'],
  balance_trend: ['Is the balance growing or shrinking?',
    'A shrinking balance means more money goes out than comes in.',
    'Change in month-end balance per month (slope) ÷ average balance'],
  joint_account: ['Does a second person use the account?',
    'Two people behind one account can mean a second income. None of the joint-account training loans defaulted.',
    'The account has a second user (disposition type DISPONENT)'],
};
const CRIT = { payment: 'Payment behaviour', income: 'Income & capacity', balance: 'Balance behaviour', relationship: 'Account relationship', demographics: 'Demographics' };
const VERDICT = { kept: 'Kept', dropped_weak: 'Dropped — weak', dropped_duplicate: 'Dropped — duplicate', dropped_no_added_value: 'Dropped — no added value' };
// Loan status meanings (B and D count as defaulted: berka.loan.is_bad).
const STATUS = { A: 'Finished, fully paid', B: 'Finished, not paid', C: 'Running, paid on time so far', D: 'Running, behind on payments' };

const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${(100 * Number(v)).toFixed(d)}%`);
const f2 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
const int = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US'));

// A chart PNG from docs/img/charts with its pixel size; fails early if capture_charts.js has not run.
function chart(file) {
  const fp = path.join(IMG, file);
  if (!fs.existsSync(fp)) throw new Error(`missing image ${fp} — run capture_charts.js`);
  const data = fs.readFileSync(fp);
  return { path: fp, data, w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
}

// Throws if any generated text contains a missing value (or a pattern the caller bans).
function checkText(texts, banned) {
  const bad = texts.filter((s) => /undefined|NaN|\[object|\bnull\b/.test(s) || (banned && banned.test(s)));
  if (bad.length) throw new Error(`bad text: ${bad.slice(0, 3).join(' | ')}`);
}

async function load() {
  const db = await connect();
  const q = async (sql) => (await db.query(sql)).rows;
  try {
    const d = {
      counts: (await q(`SELECT (SELECT COUNT(*) FROM berka.account) accounts, (SELECT COUNT(*) FROM berka.client) clients,
                 t.trans, (SELECT COUNT(*) FROM berka.loan) loans,
                 (SELECT COUNT(*) FROM berka.card) cards, (SELECT COUNT(*) FROM berka.district) districts,
                 (SELECT COUNT(*) FROM berka.disposition) dispositions, (SELECT COUNT(*) FROM berka.standing_order) orders,
                 t.tmin, t.tmax,
                 (SELECT MIN(loan_date)::text FROM berka.loan) lmin, (SELECT MAX(loan_date)::text FROM berka.loan) lmax
               FROM (SELECT COUNT(*) trans, MIN(trans_date)::text tmin, MAX(trans_date)::text tmax FROM berka.trans) t`))[0],
      status: await q(`SELECT status, BOOL_OR(is_bad) AS is_bad, COUNT(*) n FROM berka.loan GROUP BY 1 ORDER BY 1`),
      hist: (await q(`SELECT MIN(history_months) mn, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY history_months) med, MAX(history_months) mx,
                       MIN(months_observed) omn, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY months_observed) omed,
                       MAX(loan_date) FILTER (WHERE split='train')::text train_end, MIN(loan_date) FILTER (WHERE split='test')::text test_start,
                       ROUND(AVG(amount)) avg_amount, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_months) med_dur
                     FROM berka.loan_features`))[0],
      evidence: await q(`SELECT * FROM berka.metric_evidence ORDER BY ABS(gini_train) DESC`),
      corr: await q(`SELECT * FROM berka.metric_correlation WHERE ABS(spearman) >= 0.5 ORDER BY ABS(spearman) DESC`),
      weights: await q(`SELECT * FROM berka.scorecard_weight ORDER BY weight DESC`),
      critw: await q(`SELECT * FROM berka.criterion_weight ORDER BY weight DESC`),
      tenths: await q(`SELECT d AS tenth, COUNT(*)::int n, MIN(score) lo, MAX(score) hi, SUM(is_bad::int)::int n_bad, AVG(is_bad::int) bad_rate
                        FROM (SELECT *, NTILE(10) OVER (ORDER BY score DESC, loan_id) d FROM berka.loan_score WHERE split = 'train') x GROUP BY d ORDER BY d`),
      avgPoints: await q(`SELECT p.metric, AVG(p.band_points) avg_points FROM berka.loan_metric_points p JOIN berka.loan_features f USING (loan_id) WHERE f.split = 'train' GROUP BY 1`),
      pointsByGrade: await q(`SELECT s.grade, p.metric, AVG(p.points) pts FROM berka.loan_metric_points p JOIN berka.loan_score s USING (loan_id) GROUP BY 1, 2`),
      bands: await q(`SELECT b.*, w.weight FROM berka.scorecard_band b JOIN berka.scorecard_weight w USING (metric) ORDER BY w.weight DESC, b.band`),
      param: Object.fromEntries((await q(`SELECT name, value FROM berka.scorecard_param`)).map((r) => [r.name, Number(r.value)])),
      summary: await q(`SELECT * FROM berka.validation_summary ORDER BY split DESC`),
      byGrade: await q(`SELECT * FROM berka.validation_by_grade ORDER BY split DESC, grade`),
      finished: await q(`SELECT * FROM berka.validation_finished ORDER BY view_name, split DESC`),
      history: await q(`SELECT * FROM berka.validation_history ORDER BY CASE history_bucket WHEN '<6' THEN 0 WHEN '6-12' THEN 1 ELSE 2 END`),
      card: (await q(`SELECT COUNT(*) FILTER (WHERE has_card = 1) n, COUNT(*) FILTER (WHERE has_card = 1 AND is_bad) bad, COUNT(*) n_all FROM berka.loan_features WHERE split = 'train'`))[0],
      overall: (await q(`SELECT AVG(approved::int) appr, AVG(is_bad::int) FILTER (WHERE approved) bad_appr,
                          AVG(is_bad::int) FILTER (WHERE NOT approved) bad_rej FROM berka.loan_score`))[0],
    };
    const top = (await q(`SELECT loan_id FROM berka.loan_score ORDER BY score DESC, loan_id LIMIT 1`))[0].loan_id;
    const low = (await q(`SELECT loan_id FROM berka.loan_score ORDER BY score ASC, loan_id LIMIT 1`))[0].loan_id;
    d.examples = [];
    for (const id of [top, low]) {
      d.examples.push({
        score: (await q(`SELECT s.*, l.loan_date::text, l.amount, l.duration_months, l.monthly_payment FROM berka.loan_score s JOIN berka.loan l USING (loan_id) WHERE loan_id = ${id}`))[0],
        points: await q(`SELECT p.*, w.weight FROM berka.loan_metric_points p JOIN berka.scorecard_weight w USING (metric) WHERE loan_id = ${id} ORDER BY w.weight DESC`),
      });
    }
    // Data samples for the report: a few loans, and the last transactions before the first worked example.
    d.sampleLoans = await q(`SELECT loan_id, account_id, loan_date::text, amount, duration_months, monthly_payment, status FROM berka.loan ORDER BY loan_date, loan_id LIMIT 4`);
    d.sampleTrans = (await q(`SELECT t.trans_id, t.trans_date::text, t.type, t.operation, t.amount, t.balance, t.k_symbol
                              FROM berka.trans t JOIN berka.loan l USING (account_id)
                              WHERE l.loan_id = ${top} AND t.trans_date < l.loan_date - 7 ORDER BY t.trans_date DESC, t.trans_id DESC LIMIT 6`)).reverse();
    d.sampleFeatures = (await q(`SELECT loan_id, split, months_observed, negative_balance_events, dti, income_sources, balance_volatility, balance_trend, joint_account
                                 FROM berka.loan_features WHERE loan_id IN (${top}, ${low}) ORDER BY loan_id`));
    // Lookups both generators use.
    d.S = Object.fromEntries(d.summary.map((r) => [r.split, r]));                 // validation by split
    d.ev = Object.fromEntries(d.evidence.map((e) => [e.metric, e]));              // evidence by metric
    d.kept = d.evidence.filter((e) => e.verdict === 'kept');
    d.nBad = d.status.filter((s) => s.is_bad).reduce((a, s) => a + Number(s.n), 0);
    d.histBy = Object.fromEntries(d.history.map((h) => [h.history_bucket, h]));   // validation by history bucket
    return d;
  } finally {
    await db.end();
  }
}

// Rank correlation of two metrics as text ('< 0.5' when below the stored threshold).
function pairText(d, a, b) {
  const c = d.corr.find((r) => (r.metric_a === a && r.metric_b === b) || (r.metric_a === b && r.metric_b === a));
  return c ? Number(c.spearman).toFixed(2) : '< 0.5';
}

function bandText(b) {
  if (b.metric === 'joint_account' || b.metric === 'has_card') return b.lower === null ? 'no' : 'yes';
  const fmt = (v) => (['dti', 'balance_volatility', 'balance_trend', 'spend_to_income'].includes(b.metric) ? Number(v).toFixed(2) : Number(v).toFixed(0));
  if (b.lower === null && b.upper === null) return 'any';
  if (b.lower === null) return `≤ ${fmt(b.upper)}`;
  if (b.upper === null) return `> ${fmt(b.lower)}`;
  return `> ${fmt(b.lower)} to ≤ ${fmt(b.upper)}`;
}
function valueText(metric, v) {
  if (v === null) return 'missing';
  if (metric === 'joint_account' || metric === 'has_card') return Number(v) ? 'yes' : 'no';
  const n = Number(v);
  return Number.isInteger(n) || Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(2);
}

module.exports = { ROOT, IMG, DASHBOARD_URL, METRIC, DETAIL, CRIT, VERDICT, STATUS, pct, f2, int, chart, checkText, load, pairText, bandText, valueText };
