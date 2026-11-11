// Shared by generate_report.js and generate_slides.js: labels, number formats and every number
// the report and slides quote, read live from the berka scorecard tables.
const { connect } = require('./db');

const METRIC = {
  penalty_events: 'Penalty-interest charges', negative_balance_events: 'Overdraft (negative-balance) events',
  dti: 'Loan payment ÷ monthly income', income_sources: 'Number of income sources', monthly_inflow: 'Monthly money in',
  balance_volatility: 'Balance volatility', min_balance: 'Lowest balance', balance_trend: 'Balance trend',
  spend_to_income: 'Spend ÷ income', history_months: 'Account age (months)', has_card: 'Has a card',
  joint_account: 'Joint account (two users)', age_at_loan: 'Age', district_unemployment: 'District unemployment',
};
const CRIT = { payment: 'Payment behaviour', income: 'Income & capacity', balance: 'Balance behaviour', relationship: 'Account relationship', demographics: 'Demographics' };
const VERDICT = { kept: 'Kept', dropped_weak: 'Dropped — weak', dropped_duplicate: 'Dropped — duplicate', dropped_no_added_value: 'Dropped — no added value' };

const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${(100 * Number(v)).toFixed(d)}%`);
const f2 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
const int = (v) => Number(v).toLocaleString('en-US');

async function load() {
  const db = await connect();
  const q = async (sql) => (await db.query(sql)).rows;
  try {
    const d = {
      counts: (await q(`SELECT (SELECT COUNT(*) FROM berka.account) accounts, (SELECT COUNT(*) FROM berka.client) clients,
                 (SELECT COUNT(*) FROM berka.trans) trans, (SELECT COUNT(*) FROM berka.loan) loans,
                 (SELECT COUNT(*) FROM berka.card) cards, (SELECT COUNT(*) FROM berka.district) districts,
                 (SELECT COUNT(*) FROM berka.disposition) dispositions, (SELECT COUNT(*) FROM berka.standing_order) orders,
                 (SELECT MIN(trans_date)::text FROM berka.trans) tmin, (SELECT MAX(trans_date)::text FROM berka.trans) tmax,
                 (SELECT MIN(loan_date)::text FROM berka.loan) lmin, (SELECT MAX(loan_date)::text FROM berka.loan) lmax`))[0],
      status: await q(`SELECT status, COUNT(*) n FROM berka.loan GROUP BY 1 ORDER BY 1`),
      hist: (await q(`SELECT MIN(history_months) mn, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY history_months) med, MAX(history_months) mx,
                       MIN(months_observed) omn, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY months_observed) omed,
                       COUNT(*) FILTER (WHERE split='train') ntr, COUNT(*) FILTER (WHERE split='train' AND is_bad) btr,
                       COUNT(*) FILTER (WHERE split='test') nte, COUNT(*) FILTER (WHERE split='test' AND is_bad) bte,
                       MAX(loan_date) FILTER (WHERE split='train')::text train_end, MIN(loan_date) FILTER (WHERE split='test')::text test_start,
                       ROUND(AVG(amount)) avg_amount, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_months) med_dur
                     FROM berka.loan_features`))[0],
      evidence: await q(`SELECT * FROM berka.metric_evidence ORDER BY ABS(gini_train) DESC`),
      corr: await q(`SELECT * FROM berka.metric_correlation WHERE ABS(spearman) >= 0.5 ORDER BY ABS(spearman) DESC`),
      weights: await q(`SELECT * FROM berka.scorecard_weight ORDER BY weight DESC`),
      critw: await q(`SELECT * FROM berka.criterion_weight ORDER BY weight DESC`),
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
    return d;
  } finally {
    await db.end();
  }
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


module.exports = { METRIC, CRIT, VERDICT, pct, f2, int, load, bandText, valueText };
