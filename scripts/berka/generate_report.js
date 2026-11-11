// Generate docs/Stage3_Report.docx from the live scorecard tables (no number is typed by hand).
// Needs: npm run scorecard (tables) and node scripts/berka/capture_charts.js (images in docs/img/stage3).
// Usage: node scripts/berka/generate_report.js
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ImageRun, AlignmentType, ShadingType, ExternalHyperlink, PageBreak, TableOfContents,
} = require('docx');
const { connect } = require('./lib/db');

const ROOT = path.join(__dirname, '..', '..');
const IMG = path.join(ROOT, 'docs', 'img', 'stage3');
const OUT = path.join(ROOT, 'docs', 'Stage3_Report.docx');
const DASHBOARD_URL = 'https://da-assignment.iamrithy.com/';

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

// ------------------------------------------------------------------ docx helpers
const headings = [];
const allText = [];
const t = (s) => { allText.push(String(s)); return String(s); };
const H = (text, level = HeadingLevel.HEADING_1) => { headings.push(text); return new Paragraph({ text: t(text), heading: level, spacing: { before: 240, after: 120 } }); };
const H2 = (text) => H(text, HeadingLevel.HEADING_2);
const P = (...runs) => new Paragraph({
  spacing: { after: 120 },
  children: runs.map((r) => (typeof r === 'string' ? new TextRun(t(r)) : r)),
});
const B = (s) => new TextRun({ text: t(s), bold: true });
const bullet = (...runs) => new Paragraph({
  bullet: { level: 0 }, spacing: { after: 60 },
  children: runs.map((r) => (typeof r === 'string' ? new TextRun(t(r)) : r)),
});
const code = (s) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t(s), font: 'Consolas', size: 20 })] });

function table(header, rows, widths) {
  const cell = (txt, bold, fill) => new TableCell({
    width: widths ? { size: widths, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: t(txt), bold, size: 18 })] })],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h) => cell(h, true, 'DCE6F2')) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
    ],
  });
}
const gap = () => new Paragraph({ text: '', spacing: { after: 120 } });

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(file, caption, widthPx = 600) {
  const fp = path.join(IMG, file);
  if (!fs.existsSync(fp)) throw new Error(`missing image ${fp} — run capture_charts.js`);
  const { w, h } = pngSize(fp);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: fs.readFileSync(fp), transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: t(caption), italics: true, size: 18 })] }),
  ];
}

// ------------------------------------------------------------------ data
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

// ------------------------------------------------------------------ document
function build(d) {
  const P_ = d.param;
  const S = Object.fromEntries(d.summary.map((r) => [r.split, r]));
  const kept = d.evidence.filter((e) => e.verdict === 'kept');
  const dropped = d.evidence.filter((e) => e.verdict !== 'kept');
  const ev = Object.fromEntries(d.evidence.map((e) => [e.metric, e]));
  const nBad = d.status.filter((s) => s.status === 'B' || s.status === 'D').reduce((a, s) => a + Number(s.n), 0);
  const gradeRow = (split) => d.byGrade.filter((g) => g.split === split).map((g) => pct(g.bad_rate)).join(' / ');
  const hist = Object.fromEntries(d.history.map((h) => [h.history_bucket, h]));
  const corrOf = (a, b) => d.corr.find((c) => (c.metric_a === a && c.metric_b === b) || (c.metric_a === b && c.metric_b === a));
  const pairText = (a, b) => { const c = corrOf(a, b); return c ? Number(c.spearman).toFixed(2) : '< 0.5'; };

  const body = [];
  const add = (...x) => body.push(...x.flat());

  // Title
  add(new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t('Retail Credit Risk Scoring'), bold: true, size: 56 })] }));
  add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: t('Stage 3 Report — An Evidence-Based Scorecard on Real Bank Data'), size: 32 })] }));
  add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: t('Data Analytics Assignment · November 2026'), size: 24, color: '666666' })] }));
  add(new Paragraph({ children: [new PageBreak()] }));
  add(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: t('Contents'), bold: true, size: 32, color: '2E74B5' })] }));
  add(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }));
  add(new Paragraph({ children: [new PageBreak()] }));

  // 1
  add(H('1. Executive summary'));
  add(P(`This stage rebuilds the credit risk scorecard on real bank data. The Berka / PKDD'99 dataset holds ${int(d.counts.accounts)} accounts, ${int(d.counts.trans)} transactions and ${int(d.counts.loans)} loans from one Czech bank (1993–1998), with the real outcome of every loan: ${nBad} loans (${pct(nBad / d.counts.loans)}) were not repaid.`));
  add(P('Because the outcome is known, every part of the scorecard is now decided by data rather than judgement:'));
  add(bullet(B('Metrics: '), `${d.evidence.length} candidate metrics were tested; ${kept.length} were kept. Age, region, spending ratio and card ownership were dropped because they did not separate good from bad loans; three more were dropped because they duplicated a stronger metric.`));
  add(bullet(B('Weights: '), 'learned by logistic regression, for each metric and therefore for each criterion.'));
  add(bullet(B('Points: '), "set from each band's real bad-loan rate."));
  add(bullet(B('Score: '), '0 to 100. The Stage 2 scaling to 300–850 is removed.'));
  add(bullet(B('Cut-offs: '), `a loan is approved only in score ranges where the real bad rate is below the average. ${pct(d.overall.appr, 0)} of loans would be approved; ${pct(d.overall.bad_appr)} of approved loans went bad, against ${pct(d.overall.bad_rej)} of rejected loans.`));
  add(P(`The scorecard was learned on the earliest ${int(S.train.n)} loans and checked on the latest ${int(S.test.n)}, which it never saw. It separates good from bad loans with a Gini of ${f2(S.train.gini)} on the training loans and ${f2(S.test.gini)} on the test loans, and the bad rate rises steadily from grade A to grade E. The test set contains only ${S.test.n_bad} bad loans, so the test figures show a direction rather than a precise rate.`));

  // 2
  add(H('2. What changed since Stage 2'));
  add(P('Stage 2 scored synthetic customers produced by a data generator. The generator created each customer\'s behaviour from a risk level chosen in advance, so the data could not show whether a metric really predicts default: any check would only find the rules the generator was given. Stage 3 moves to real data with known outcomes so that each choice can be tested.'));
  add(table(['Item', 'Stage 2', 'Stage 3'], [
    ['Data', 'Synthetic customers from a generator', `${int(d.counts.loans)} real loans with known outcomes`],
    ['Metrics', '12, chosen by judgement', `${d.evidence.length} candidates tested, ${kept.length} kept by evidence`],
    ['Weights', '35 / 25 / 20 / 10 / 10, by judgement', 'Learned by logistic regression'],
    ['Points', '100 / 70 / 40 / 10 by quartile rank', 'From each band\'s real bad rate'],
    ['Score scale', '300–850 (× 5.5 + 300)', '0–100, no scaling'],
    ['Cut-offs', 'By judgement', 'Approve only where the bad rate is below average'],
    ['Validation', 'Not possible (no real outcome)', 'Train / test split, Gini, bad rate per grade'],
  ]));
  add(gap());

  // 3
  add(H('3. The data'));
  add(P(`Source: the PKDD'99 Discovery Challenge financial dataset ("Berka dataset"), published at lisp.vse.cz/pkdd99 and on Kaggle. It is real, anonymised data from one Czech bank. Transactions run from ${d.counts.tmin} to ${d.counts.tmax}; loans were granted between ${d.counts.lmin} and ${d.counts.lmax}.`));
  add(table(['Table', 'Rows', 'Content'], [
    ['account', int(d.counts.accounts), 'Branch district, statement frequency, opening date'],
    ['client', int(d.counts.clients), 'Birth date and gender (encoded in the birth number), district'],
    ['disposition', int(d.counts.dispositions), 'Which client may use which account: owner or second user'],
    ['card', int(d.counts.cards), 'Card type and issue date'],
    ['loan', int(d.counts.loans), 'Date, amount, duration, monthly payment, status'],
    ['trans', int(d.counts.trans), 'Every transaction with the balance after it and its purpose'],
    ['standing_order', int(d.counts.orders), 'Permanent payment orders'],
    ['district', int(d.counts.districts), 'Regional statistics: salary, unemployment, crime'],
  ]));
  add(gap());
  add(H2('3.1 Outcome'));
  add(table(['Loan status', 'Meaning', 'Loans', 'Counted as'], d.status.map((s) => [s.status,
    { A: 'Finished, fully paid', B: 'Finished, not paid', C: 'Running, paid on time so far', D: 'Running, in debt' }[s.status], int(s.n),
    s.status === 'B' || s.status === 'D' ? 'Bad' : 'Good'])));
  add(gap());
  add(H2('3.2 History available before each loan'));
  add(P(`Accounts were open for ${Number(d.hist.mn).toFixed(1)} to ${Number(d.hist.mx).toFixed(1)} months before their loan (median ${Number(d.hist.med).toFixed(1)}). Every metric uses the 12 months before the loan date; ${d.hist.omn} to 13 calendar months of transactions fall in that window (median ${d.hist.omed}). The average loan is ${int(d.hist.avg_amount)} with a median term of ${d.hist.med_dur} months.`));
  add(H2('3.3 Training and test loans'));
  add(P(`Loans are ordered by date. The earliest 70% (${d.hist.ntr} loans, ${d.hist.btr} bad, up to ${d.hist.train_end}) are the training set: every constant in the scorecard is learned from them. The latest 30% (${d.hist.nte} loans, ${d.hist.bte} bad, from ${d.hist.test_start}) are the test set and are used only to check the result. Splitting by date mirrors real use: a scorecard is built on past loans and applied to new ones.`));

  // 4
  add(H('4. Data model'));
  add(P('The data is loaded into PostgreSQL schema "berka" in two layers. The source layer keeps the bank\'s eight tables, with Czech codes translated into English. The scorecard layer is derived from it.'));
  add(table(['Relationship', 'Type'], [
    ['district → account, client', 'one district has many accounts and clients'],
    ['client ↔ account via disposition', 'many-to-many: an account can have an owner and a second user'],
    ['disposition → card', 'a disposition can have one card'],
    ['account → loan', 'an account has at most one loan'],
    ['account → trans, standing_order', 'one account has many transactions and orders'],
  ]));
  add(gap());
  add(table(['Scorecard table', 'One row per', 'Holds'], [
    ['loan_features', 'loan', '14 candidate metrics from the 12 months before the loan; train/test flag'],
    ['metric_evidence', 'candidate metric', 'Gini, bad rate per group, verdict and reason'],
    ['metric_correlation', 'pair of metrics', 'rank correlation'],
    ['scorecard_band', 'metric × band', 'value range, points, bad rate'],
    ['scorecard_weight / criterion_weight', 'metric / criterion', 'regression coefficient and weight'],
    ['scorecard_param', 'setting', 'grade cut-offs, approve line, short-history constant'],
    ['loan_metric_points, loan_score', 'loan (× metric)', 'points, score, grade, decision'],
    ['validation_* views', 'split / grade', 'Gini, approval and bad rates, robustness checks'],
  ]));
  add(gap());

  // 5
  add(H('5. Method'));
  add(H2('5.1 Point-in-time metrics'));
  add(P('Every metric is calculated from transactions dated in the 12 months before the loan date. Nothing on or after the loan date is used, so the score only uses what the bank knew when it made the decision. An automated check confirms that no loan uses a later transaction. The same rule applies to cards: only cards issued before the loan count. Most cards in the data were issued after the loan, and counting them would have made card ownership look far more predictive than it really is.'));
  add(H2('5.2 Candidate metrics'));
  add(table(['Criterion', 'Candidate metrics'], [
    [CRIT.payment, `${METRIC.penalty_events}; ${METRIC.negative_balance_events}`],
    [CRIT.income, `${METRIC.dti}; ${METRIC.income_sources}; ${METRIC.monthly_inflow}`],
    [CRIT.balance, `${METRIC.balance_volatility}; ${METRIC.min_balance}; ${METRIC.balance_trend}; ${METRIC.spend_to_income}`],
    [CRIT.relationship, `${METRIC.history_months}; ${METRIC.has_card}; ${METRIC.joint_account}`],
    [CRIT.demographics, `${METRIC.age_at_loan}; ${METRIC.district_unemployment}`],
  ]));
  add(P('Gender is available in the data but is never used as a scoring input.'));
  add(H2('5.3 Selection rules'));
  add(bullet(B('Strength: '), 'Gini of the metric against the outcome on the training loans. 0 means no better than chance, 1 means perfect. A metric below 0.10 is dropped as weak.'));
  add(bullet(B('Duplicates: '), 'Spearman rank correlation between every pair of metrics. At 0.5 or above (either sign) the two metrics describe the same behaviour, so the weaker one is dropped. This stops one behaviour being scored twice.'));
  add(bullet(B('Usable bands: '), 'the bad rate must move in one direction across at least two bands.'));
  add(bullet(B('Added value: '), 'after the regression, a metric whose effect points the wrong way adds nothing once the others are known and is dropped.'));
  add(H2('5.4 Bands and points'));
  add(P('Each kept metric is cut into bands at the quartiles of its training values (two bands for yes/no metrics). Neighbouring bands are merged until the bad rate rises or falls steadily. The points of a band come from its weight of evidence — the log of the share of good loans divided by the share of bad loans in that band — scaled so that the safest band earns 100 and the riskiest earns 0. A missing value is placed in the riskier band. The band limits are fixed numbers, so a customer\'s points do not depend on who else is scored.'));
  add(H2('5.5 Weights'));
  add(P(`A logistic regression predicts whether a loan went bad from the points of the kept metrics, with a small penalty (L2 = ${P_.l2}) that keeps the weights stable when a metric separates the groups very sharply. Each metric's weight is the size of its coefficient multiplied by how much its points vary, scaled so all weights add up to 100%. A criterion's weight is the sum of its metrics' weights, so both levels come from the same calculation.`));
  add(H2('5.6 Short history'));
  add(P('Metrics measured over the 12-month window — overdraft events, balance volatility and debt-to-income — are less reliable when few months were observed. Their points are pulled toward the training average in proportion to how little history there is:'));
  add(code('points = average + (points − average) × months ÷ (months + k)'));
  add(P(`k was chosen from 3, 6 and 12 as the value giving the best training Gini (k = ${P_.shrink_k}). A customer with only a short clean record cannot reach the full 100 points.`));
  add(H2('5.7 Score, grades and approval'));
  add(code('score = Σ (weight × points)          range 0–100'));
  add(P(`The approve line is set on the training scores. Starting from the highest scores, each tenth of the loans is approved only while its own bad rate stays below the average bad rate (${pct(P_.portfolio_bad_rate)}). The approved range is split into thirds for grades A, B and C, and the rejected range in half for D and E.`));
  add(table(['Grade', 'Score', 'Decision'], [
    ['A', `≥ ${P_.grade_A.toFixed(2)}`, 'Approve'], ['B', `${P_.grade_B.toFixed(2)} – ${P_.grade_A.toFixed(2)}`, 'Approve'],
    ['C', `${P_.grade_C.toFixed(2)} – ${P_.grade_B.toFixed(2)}`, 'Approve'], ['D', `${P_.grade_D.toFixed(2)} – ${P_.grade_C.toFixed(2)}`, 'Reject'],
    ['E', `< ${P_.grade_D.toFixed(2)}`, 'Reject'],
  ]));
  add(gap());

  // 6
  add(H('6. Evidence for each metric'));
  add(P('The table lists every candidate metric with its strength, the bad rate across its value groups (lowest value first) and the decision. A positive Gini means a higher value is riskier; a negative Gini means a higher value is safer.'));
  add(table(['Metric', 'Criterion', 'Gini', 'Bad rate by group (low → high)', 'Decision'], d.evidence.map((e) => [
    METRIC[e.metric], CRIT[e.criterion], Number(e.gini_train).toFixed(2),
    [e.bad_rate_q1, e.bad_rate_q2, e.bad_rate_q3, e.bad_rate_q4].filter((v) => v !== null).map((v) => pct(v, 0)).join(' / '),
    VERDICT[e.verdict]])));
  add(gap());
  add(figure('metric_strength.png', 'Figure 1. Strength of each candidate metric (|Gini|, training loans). Blue = kept, grey = dropped; dashed line = 0.10.'));
  add(figure('metric_quartiles.png', 'Figure 2. Real bad rate across each metric\'s value groups (training loans). Yes/no metrics show two groups.'));
  add(H2('6.1 Why each dropped metric was dropped'));
  for (const e of dropped) add(bullet(B(`${METRIC[e.metric]}: `), e.reason.replace(/negative_balance_events|balance_volatility|balance_trend|[a-z_]+_[a-z_]+/g, (m) => METRIC[m] || m)));
  add(P(`A large difference between groups is not enough on its own. Only ${d.card.n} of the ${d.card.n_all} training borrowers had a card before their loan, and ${d.card.bad} of them went bad. The group is too small to separate good from bad loans across the whole portfolio, so card ownership scores low overall even though card holders look safe.`));
  add(figure('correlation.png', 'Figure 3. Rank correlation between candidate metrics (training loans). Values shown where |r| ≥ 0.5.', 560));

  // 7
  add(H('7. Questions raised at the Stage 2 review'));
  add(H2('7.1 Why these metrics, and what supports them?'));
  add(P(`In Stage 2 the metrics came from judgement. In Stage 3 each one is tested against real loan outcomes (section 6). ${kept.length} of ${d.evidence.length} candidates passed. The strongest is balance volatility: loans in the most volatile quarter went bad ${pct(ev.balance_volatility.bad_rate_q4, 0)} of the time, against ${pct(ev.balance_volatility.bad_rate_q1, 0)} in the most stable quarter. Every borrower with an overdraft in the year before the loan went bad (${pct(ev.negative_balance_events.bad_rate_q2, 0)}), against ${pct(ev.negative_balance_events.bad_rate_q1, 0)} of the rest. Several Stage 2 assumptions did not hold: age (Gini ${f2(ev.age_at_loan.gini_train)}), region and the spending ratio carry almost no signal, and were dropped.`));
  add(H2('7.2 Why these weights?'));
  add(P('The Stage 2 weights (35 / 25 / 20 / 10 / 10) were set by judgement. The Stage 3 weights come from a logistic regression on the training loans: a metric that moves the prediction more, and varies more between customers, gets a larger share of the score.'));
  add(table(['Metric', 'Criterion', 'Weight'], d.weights.map((w) => [METRIC[w.metric], CRIT[w.criterion], pct(w.weight)])));
  add(gap());
  add(table(['Criterion', 'Weight'], d.critw.map((c) => [CRIT[c.criterion], pct(c.weight)])));
  add(gap());
  add(figure('weights.png', 'Figure 4. Weight of each kept metric in the score.', 520));
  add(H2('7.3 Why multiply by 5.5 and add 300?'));
  add(P('That step only moved the score onto the familiar 300–850 range of commercial credit scores; it added no information and raised questions about the constants. Stage 3 removes it. The score is the weighted sum of points, from 0 to 100, and the grade cut-offs are set directly on that scale.'));
  add(H2('7.4 Are on-time and delinquency metrics biased for customers with little history?'));
  add(P(`Yes — a customer with one month of clean history looked as good as one with years of it. Stage 3 handles this in two ways. First, every window metric is a rate per month rather than a total. Second, points are pulled toward the average when few months were observed (section 5.6). The result: customers whose account was less than six months old were approved ${pct(hist['<6'].approval_rate)} of the time, against ${pct(hist['12+'].approval_rate)} for accounts of a year or more, and their real bad rate (${pct(hist['<6'].bad_rate)}) was indeed higher (${pct(hist['12+'].bad_rate)} for a year or more). Short history is not rewarded.`));
  add(table(['Account age at loan', 'Loans', 'Real bad rate', 'Average score', 'Approved'], d.history.map((h) => [
    `${h.history_bucket} months`, h.n, pct(h.bad_rate), Number(h.avg_score).toFixed(1), pct(h.approval_rate)])));
  add(gap());
  add(H2('7.5 Do some metrics count the same thing twice?'));
  add(P(`Yes. The concern raised — spend-to-income and balance trend — is confirmed by the data: their rank correlation is ${pairText('spend_to_income', 'balance_trend')}. Stage 3 checks every pair (Figure 3) and keeps only the stronger metric of any pair at 0.5 or above. Penalty interest and overdraft events (${pairText('penalty_events', 'negative_balance_events')}) and lowest balance and balance volatility (${pairText('min_balance', 'balance_volatility')}) were also merged this way.`));
  add(H2('7.6 Should metrics inside a criterion have their own weights?'));
  add(P('Yes. Stage 2 averaged the metrics inside a criterion equally. In Stage 3 each metric has its own weight from the regression, and the criterion weight is simply the sum (section 7.2). Inside Balance behaviour, for example, balance volatility carries about twice the weight of balance trend.'));
  add(H2('7.7 How much data is there?'));
  add(P(`Six years of transactions (${d.counts.tmin} to ${d.counts.tmax}), ${int(d.counts.trans)} transactions over ${int(d.counts.accounts)} accounts, and ${int(d.counts.loans)} loans. Each loan is scored on the 12 months before it; accounts had ${Number(d.hist.mn).toFixed(1)} to ${Number(d.hist.mx).toFixed(1)} months of history at the loan date (median ${Number(d.hist.med).toFixed(1)}). Section 3 gives the full breakdown.`));

  // 8
  add(H('8. Results'));
  add(table(['Set', 'Loans', 'Bad', 'Gini', 'Approved', 'Bad rate if approved', 'Bad rate if rejected'], d.summary.map((s) => [
    s.split === 'train' ? 'Train' : 'Test', s.n, s.n_bad, f2(s.gini), pct(s.approval_rate), pct(s.bad_rate_approved), pct(s.bad_rate_rejected)])));
  add(gap());
  add(table(['Grade', 'Train loans', 'Train bad rate', 'Test loans', 'Test bad rate'], ['A', 'B', 'C', 'D', 'E'].map((g) => {
    const tr = d.byGrade.find((r) => r.split === 'train' && r.grade === g) || {};
    const te = d.byGrade.find((r) => r.split === 'test' && r.grade === g) || {};
    return [g, tr.n ?? 0, pct(tr.bad_rate), te.n ?? 0, pct(te.bad_rate)];
  })));
  add(gap());
  add(figure('bad_rate_by_grade.png', 'Figure 5. Share of loans that really went bad, by grade (blue = approved grades, red = rejected).', 560));
  add(P(`The bad rate rises from grade A to grade E on both sets (train ${gradeRow('train')}; test ${gradeRow('test')}). The test Gini (${f2(S.test.gini)}) is higher than the training Gini (${f2(S.train.gini)}), but the test set holds only ${S.test.n_bad} bad loans, so this difference should not be read as an improvement.`));
  add(figure('score_distribution.png', 'Figure 6. Score distribution with the grade cut-offs (dashed).', 600));
  add(H2('8.1 Robustness checks'));
  add(P('Running loans (status C) may still go bad later. The scorecard was therefore also checked on finished loans only and on loans issued at least a year before the data ends.'));
  add(table(['Check', 'Set', 'Loans', 'Bad', 'Gini'], d.finished.map((f) => [
    f.view_name === 'finished_A_vs_B' ? 'Finished loans only' : 'Loans at least 12 months old',
    f.split === 'train' ? 'Train' : 'Test', f.n, f.n_bad, f.gini === null ? '— (no bad loans)' : f2(f.gini)])));
  add(gap());
  add(figure('criteria_by_grade.png', 'Figure 7. Average criterion points by grade.', 520));

  // 9
  add(H('9. Worked examples'));
  for (const [i, ex] of d.examples.entries()) {
    const s = ex.score;
    add(H2(`9.${i + 1} Loan ${s.loan_id} — grade ${s.grade}, score ${Number(s.score).toFixed(2)}`));
    add(P(`Loan of ${int(s.amount)} over ${s.duration_months} months (${int(s.monthly_payment)} a month), granted ${s.loan_date}.`));
    add(table(['Metric', 'Value', 'Band points', 'Points after short-history adjustment', 'Weight', 'Adds to score'], ex.points.map((p) => [
      METRIC[p.metric], valueText(p.metric, p.raw_value), Number(p.band_points).toFixed(1), Number(p.points).toFixed(1), pct(p.weight), (Number(p.weight) * Number(p.points)).toFixed(2)])));
    add(code(ex.points.map((p) => `${Number(p.weight).toFixed(3)}×${Number(p.points).toFixed(1)}`).join(' + ') + ` = ${Number(s.score).toFixed(2)}`));
    const out = { A: 'finished and fully paid', B: 'finished but not paid', C: 'still running and paid on time', D: 'still running and in debt' }[s.status];
    add(P(`Decision: ${s.approved ? 'approve' : 'reject'}. What really happened: status ${s.status} — ${out}.`));
  }

  // 10
  add(H('10. Dashboard'));
  add(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(t('The interactive dashboard is available at ')), new ExternalHyperlink({ link: DASHBOARD_URL, children: [new TextRun({ text: t(DASHBOARD_URL), style: 'Hyperlink' })] }), new TextRun(t('. It reads the same tables as this report and has four pages:'))] }));
  add(bullet(B('Portfolio: '), 'loans per grade, the real bad rate per grade on training and test loans, and the score distribution.'));
  add(bullet(B('Evidence: '), 'strength of every candidate metric, bad rate across value groups, correlations, weights, and the checks on unseen loans.'));
  add(bullet(B('Criteria by grade: '), 'average criterion points for each grade.'));
  add(bullet(B('Loan drill-down: '), 'for any loan, each metric\'s value, band, points and weight, its 12 months of money in and out and balance before the loan, and finally what really happened.'));
  add(figure('example_balance.png', 'Figure 8. Drill-down example: month-end balance in the 12 months before a loan.', 480));

  // 11
  add(H('11. Limitations'));
  add(bullet(`Few bad loans: ${nBad} in total and ${S.test.n_bad} in the test set. Test results show a direction, not precise rates.`));
  add(bullet('One bank in one country in the 1990s. The method transfers to other data; the exact weights and cut-offs would need to be learned again.'));
  add(bullet('No declared income: income is estimated from money coming into the account.'));
  add(bullet('Each account has at most one loan, so repayment of earlier loans cannot be measured. Overdrafts and penalty interest are the closest signal available.'));
  add(bullet(`Joint account carries the largest weight (${pct(d.weights.find((w) => w.metric === 'joint_account')?.weight)}) because none of the joint-account training loans went bad. With more data this weight would likely shrink.`));
  add(bullet(`Most test loans are still running (only ${d.finished.find((f) => f.view_name === 'finished_A_vs_B' && f.split === 'test')?.n ?? 0} have finished), so some may still go bad.`));

  // Appendix
  add(H('Appendix A. Band limits and points'));
  add(table(['Metric', 'Band', 'Points', 'Training bad rate', 'Training loans'], d.bands.map((b) => [
    METRIC[b.metric], bandText(b), Number(b.points).toFixed(1), pct(b.bad_rate), b.n_train])));
  add(gap());
  add(H('Appendix B. How to reproduce'));
  add(code('npm install'));
  add(code('node scripts/berka/run_all.js --reload    # download, load, features, fit, score, validate'));
  add(code('docker compose up -d --build              # dashboard on port 8502'));
  add(code('node scripts/berka/capture_charts.js && node scripts/berka/generate_report.js'));
  add(P('Pipeline details and every stored constant are described in scripts/berka/README.md.'));

  return body;
}

const REQUIRED = ['1. Executive summary', '2. What changed since Stage 2', '3. The data', '4. Data model', '5. Method',
  '6. Evidence for each metric', '7. Questions raised at the Stage 2 review', '8. Results', '9. Worked examples',
  '10. Dashboard', '11. Limitations', 'Appendix A. Band limits and points', 'Appendix B. How to reproduce'];

async function main() {
  const d = await load();
  const body = build(d);
  const missing = REQUIRED.filter((h) => !headings.includes(h));
  if (missing.length) throw new Error(`missing sections: ${missing.join(', ')}`);
  const bad = allText.filter((s) => /undefined|NaN|\[object/.test(s));
  if (bad.length) throw new Error(`bad text: ${bad.slice(0, 3).join(' | ')}`);
  const doc = new Document({
    features: { updateFields: true },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: body }],
  });
  fs.writeFileSync(OUT, await Packer.toBuffer(doc));
  console.log(`saved ${path.relative(ROOT, OUT)} — ${headings.length} headings, ${allText.length} text blocks`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
