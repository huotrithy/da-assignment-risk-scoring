// Generate docs/Final_Report.docx from the live scorecard tables (no number is typed by hand).
// Needs: npm run scorecard (tables) and node scripts/berka/capture_charts.js (images in docs/img/charts).
// Usage: node scripts/berka/generate_report.js [output.docx]
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ImageRun, AlignmentType, ShadingType, ExternalHyperlink, PageBreak, TableOfContents,
} = require('docx');
const { ROOT, DASHBOARD_URL, METRIC, CRIT, VERDICT, STATUS, pct, f2, int, chart, checkText, load, pairText: pairOf, bandText, valueText } = require('./lib/report_data');

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'docs', 'Final_Report.docx');

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

function figure(file, caption, widthPx = 600) {
  const { data, w, h } = chart(file);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data, transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: t(caption), italics: true, size: 18 })] }),
  ];
}

// ------------------------------------------------------------------ document
function build(d) {
  const P_ = d.param;
  const { S, kept, ev, nBad, histBy: hist } = d;
  const dropped = d.evidence.filter((e) => e.verdict !== 'kept');
  const weak = d.evidence.filter((e) => e.verdict === 'dropped_weak').map((e) => METRIC[e.metric]);
  const dups = d.evidence.filter((e) => e.verdict === 'dropped_duplicate').map((e) => METRIC[e.metric]);
  const listOf = (a) => { const l = a.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1))); return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l.join(''); };
  const jointW = d.weights.find((w) => w.metric === 'joint_account');
  const jointRank = d.weights.findIndex((w) => w.metric === 'joint_account') + 1;
  const rankWord = ['', 'largest', 'second-largest', 'third-largest', 'fourth-largest'][jointRank] || `${jointRank}th-largest`;
  const gradeRow = (split) => d.byGrade.filter((g) => g.split === split).map((g) => pct(g.bad_rate)).join(' / ');
  const pairText = (a, b) => pairOf(d, a, b);

  const body = [];
  const add = (...x) => body.push(...x.flat());

  // Title
  add(new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t('Retail Credit Risk Scoring'), bold: true, size: 56 })] }));
  add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: t('Credit Risk Scoring Report — An Evidence-Based Scorecard on Real Bank Data'), size: 32 })] }));
  add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: t('Data Analytics Assignment · November 2026'), size: 24, color: '666666' })] }));
  add(new Paragraph({ children: [new PageBreak()] }));
  add(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: t('Contents'), bold: true, size: 32, color: '2E74B5' })] }));
  add(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }));
  add(new Paragraph({ children: [new PageBreak()] }));

  // 1
  add(H('1. Executive summary'));
  add(P(`This report describes a credit risk scorecard built on real bank data. The Berka / PKDD'99 dataset holds ${int(d.counts.accounts)} accounts, ${int(d.counts.trans)} transactions and ${int(d.counts.loans)} loans from one Czech bank (1993–1998), with the real outcome of every loan: ${nBad} loans (${pct(nBad / d.counts.loans)}) were not repaid.`));
  add(P('Because the outcome is known, every part of the scorecard is decided by the data:'));
  add(bullet(B('Metrics: '), `${d.evidence.length} candidate metrics were tested; ${kept.length} were kept. ${listOf(weak)} were dropped because they did not separate repaid from defaulted loans; ${listOf(dups).replace(/^./, (c) => c.toLowerCase())} were dropped because they duplicated a stronger metric.`));
  add(bullet(B('Weights: '), 'a stronger metric counts more: the weight of a metric is its share of the total strength of the kept metrics.'));
  add(bullet(B('Points: '), 'each metric is split into buckets and scored by rank: 100 points for the bucket with the lowest real default rate, down to 10 for the highest.'));
  add(bullet(B('Score: '), 'the weighted sum of points; a higher score is safer and the maximum is 100.'));
  add(bullet(B('Thresholds: '), `a loan is approved only in score ranges where the real default rate is below the average. On the test loans, ${pct(S.test.approval_rate, 0)} would be approved; ${pct(S.test.bad_rate_approved)} of approved loans defaulted, against ${pct(S.test.bad_rate_rejected)} of rejected loans (all loans: ${pct(d.overall.appr, 0)} approved, ${pct(d.overall.bad_appr)} vs ${pct(d.overall.bad_rej)}).`));
  add(P(`The scorecard was learned on the earliest ${int(S.train.n)} loans and checked on the latest ${int(S.test.n)}, which it never saw. It separates repaid from defaulted loans with a Gini of ${f2(S.train.gini)} on the training loans and ${f2(S.test.gini)} on the test loans, and the default rate rises steadily from grade A to grade E. The test set contains only ${S.test.n_bad} defaulted loans, so the test figures show a direction rather than a precise rate.`));

  // 2
  add(H('2. The data'));
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
  add(H2('2.1 Outcome'));
  add(table(['Loan status', 'Meaning', 'Loans', 'Counted as'], d.status.map((s) => [s.status,
    STATUS[s.status], int(s.n), s.is_bad ? 'Defaulted' : 'Repaid / on time'])));
  add(gap());
  add(H2('2.2 History available before each loan'));
  add(P(`Every metric uses the transactions of the 12 months before the loan start date. Some accounts were opened less than 12 months before their loan, so less history is available for them: the age of the account at the loan start date ranges from ${Number(d.hist.mn).toFixed(1)} to ${Number(d.hist.mx).toFixed(1)} months (median ${Number(d.hist.med).toFixed(1)}). Section 4.7 explains how a short history is handled. The average loan is ${int(d.hist.avg_amount)} with a median term of ${d.hist.med_dur} months.`));
  add(H2('2.3 Training and test loans'));
  add(P(`Loans are ordered by date. The earliest 70% (${S.train.n} loans, ${S.train.n_bad} defaulted, up to ${d.hist.train_end}) are the training set: every constant in the scorecard is learned from them. The latest 30% (${S.test.n} loans, ${S.test.n_bad} defaulted, from ${d.hist.test_start}) are the test set and are used only to check the result. Splitting by date mirrors real use: a scorecard is built on past loans and applied to new ones.`));

  // 3
  add(H('3. Data model'));
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
    ['metric_evidence', 'candidate metric', 'Gini, default rate per group, verdict and reason'],
    ['metric_correlation', 'pair of metrics', 'rank correlation'],
    ['scorecard_band', 'metric × bucket', 'value range, points, default rate'],
    ['scorecard_weight / criterion_weight', 'metric / criterion', 'strength and weight'],
    ['scorecard_param', 'setting', 'grade thresholds, approve line, short-history constant'],
    ['loan_metric_points, loan_score', 'loan (× metric)', 'points, score, grade, decision'],
    ['validation_* views', 'split / grade', 'Gini, approval and default rates, robustness checks'],
  ]));
  add(gap());

  // 4
  add(H('4. Method'));
  add(H2('4.1 Overview'));
  add(P('The scorecard is built in six steps. Steps 2 to 5 use only the training loans; step 6 checks the result on the test loans.'));
  add(bullet(B('1. Measure. '), `For every loan, ${d.evidence.length} candidate metrics are calculated from the 12 months before the loan start date (sections 4.2 and 4.3).`));
  add(bullet(B('2. Test each metric. '), 'The strength of each metric is measured against the real outcome. A metric that does not separate repaid from defaulted loans is dropped (section 4.4).'));
  add(bullet(B('3. Remove duplicates. '), 'When two metrics move together, only the stronger one is kept (section 4.4).'));
  add(bullet(B('4. Give points. '), 'Each kept metric is split into buckets. Points are given by rank: 100 for the safest bucket, 10 for the riskiest (section 4.5).'));
  add(bullet(B('5. Set weights. '), 'A stronger metric counts more: weight = strength ÷ total strength. The weights add up to 100% (section 4.6).'));
  add(bullet(B('6. Score and check. '), 'The score is the sum of weight × points. The approve line and the grades are set on the training scores (section 4.8), and the result is checked on the test loans (section 7).'));
  add(H2('4.2 Point-in-time metrics'));
  add(P('Every metric is calculated from transactions dated in the 12 months before the loan start date. Nothing on or after the loan start date is used, so the score only uses what the bank knew when it made the decision. An automated check confirms that no loan uses a later transaction. The same rule applies to cards: only cards issued before the loan count. Most cards in the data were issued after the loan, and counting them would have made card ownership look far more predictive than it really is.'));
  add(H2('4.3 Candidate metrics'));
  add(table(['Criterion', 'Candidate metrics'], [
    [CRIT.payment, `${METRIC.penalty_events}; ${METRIC.negative_balance_events}`],
    [CRIT.income, `${METRIC.dti}; ${METRIC.income_sources}; ${METRIC.monthly_inflow}`],
    [CRIT.balance, `${METRIC.balance_volatility}; ${METRIC.min_balance}; ${METRIC.balance_trend}; ${METRIC.spend_to_income}`],
    [CRIT.relationship, `${METRIC.history_months}; ${METRIC.has_card}; ${METRIC.joint_account}`],
    [CRIT.demographics, `${METRIC.age_at_loan}; ${METRIC.district_unemployment}`],
  ]));
  add(P('Gender is available in the data but is never used as a scoring input.'));
  add(H2('4.4 Selection rules'));
  add(bullet(B('Strength: '), 'how well the metric tells a defaulted loan from a repaid one, measured on the training loans with a pair test (explained below). A metric with a strength below 0.10 is dropped as weak.'));
  add(bullet(B('Duplicates: '), 'Spearman rank correlation between every pair of metrics. At 0.5 or above (either sign) the two metrics describe the same behaviour, so the weaker one is dropped. This stops one behaviour being scored twice.'));
  add(bullet(B('Usable buckets: '), 'the default rate must move in one direction across at least two buckets (section 4.5).'));
  add(P('The pair test works like a quiz for the metric. Every repaid loan is paired with every defaulted loan, and for each pair we ask: does the metric point at the loan that defaulted? A metric that knows nothing is right in half of the pairs, like a coin flip; a perfect metric is right in all of them. The example below uses five loans and balance volatility, where a higher value should mean more risk.'));
  add(table(['Loan', 'Outcome', 'Balance volatility'], [['A', 'repaid', '0.2'], ['B', 'repaid', '0.3'], ['C', 'repaid', '0.6'], ['X', 'defaulted', '0.5'], ['Y', 'defaulted', '0.8']]));
  add(gap());
  add(table(['Pair', 'Loan with the higher value', 'Metric is'], [['A – X', 'X', 'right'], ['A – Y', 'Y', 'right'], ['B – X', 'X', 'right'], ['B – Y', 'Y', 'right'], ['C – X', 'C', 'wrong'], ['C – Y', 'Y', 'right']]));
  add(gap());
  add(P(`The metric is right in 5 of the 6 pairs, or 83%. The strength rescales this share so that a coin flip gives 0 and a perfect metric gives 1: strength = 2 × (share of pairs right) − 1, here 2 × 0.83 − 1 = 0.67. This number is known as the Gini coefficient. A pair in which both loans have the same value counts as half right. On the real data the training set has ${int(S.train.n - S.train.n_bad)} repaid and ${S.train.n_bad} defaulted loans, so every metric is tested on ${int((S.train.n - S.train.n_bad) * S.train.n_bad)} pairs. The sign of the result also shows which direction is safe, so the direction is not assumed. The same test applied to the final score gives ${f2(S.train.gini)} on the training loans: the repaid loan has the higher score in ${pct((Number(S.train.gini) + 1) / 2, 0)} of pairs.`));
  add(H2('4.5 Buckets and points'));
  add(P('Each kept metric is cut into buckets at the quartiles of its training values (two buckets for yes/no metrics). Neighbouring buckets are merged until the default rate rises or falls steadily. Points are then given by rank: the bucket with the lowest default rate earns 100 points and the one with the highest earns 10, evenly spaced in between (100 / 70 / 40 / 10 for four buckets, 100 / 55 / 10 for three, 100 / 10 for two). A missing value is placed in the riskier bucket. The bucket limits are fixed numbers, so the points of a customer do not depend on who else is scored.'));
  add(H2('4.6 Weights'));
  add(P('The weight of a metric is its strength divided by the total strength of the kept metrics, so a metric that separates repaid from defaulted loans better counts more, and all weights add up to 100%. The weight of a criterion is the sum of the weights of its metrics, so both levels come from the same calculation.'));
  add(H2('4.7 Short history'));
  add(P('Metrics measured over the 12-month window — overdraft events, balance volatility and loan payment ÷ income — are less reliable when few months were observed. Their points are pulled toward the training average in proportion to how little history there is:'));
  add(code('points = average + (points − average) × months ÷ (months + k)'));
  add(P(`k was chosen from 3, 6 and 12 as the value giving the best training Gini (k = ${P_.shrink_k}). A customer with only a short clean record cannot reach the full 100 points.`));
  add(H2('4.8 Score, grades and approval'));
  add(code('score = Σ (weight × points)          higher = safer, maximum 100'));
  add(P(`The approve line is set on the training scores. Starting from the highest scores, each tenth of the loans is approved only while its own default rate stays below the average default rate (${pct(P_.portfolio_bad_rate)}). The approved range is split into thirds for grades A, B and C, and the rejected range in half for D and E.`));
  add(table(['Grade', 'Score', 'Decision'], [
    ['A', `≥ ${P_.grade_A.toFixed(2)}`, 'Approve'], ['B', `${P_.grade_B.toFixed(2)} – ${P_.grade_A.toFixed(2)}`, 'Approve'],
    ['C', `${P_.grade_C.toFixed(2)} – ${P_.grade_B.toFixed(2)}`, 'Approve'], ['D', `${P_.grade_D.toFixed(2)} – ${P_.grade_C.toFixed(2)}`, 'Reject'],
    ['E', `< ${P_.grade_D.toFixed(2)}`, 'Reject'],
  ]));
  add(gap());

  // 5
  add(H('5. Evidence for each metric'));
  add(P('The table lists every candidate metric with its strength, the default rate across its value groups (lowest value first) and the decision. A positive Gini means a higher value is riskier; a negative Gini means a higher value is safer.'));
  add(table(['Metric', 'Criterion', 'Gini', 'Default rate by group (low → high)', 'Decision'], d.evidence.map((e) => [
    METRIC[e.metric], CRIT[e.criterion], Number(e.gini_train).toFixed(2),
    [e.bad_rate_q1, e.bad_rate_q2, e.bad_rate_q3, e.bad_rate_q4].filter((v) => v !== null).map((v) => pct(v, 0)).join(' / '),
    VERDICT[e.verdict]])));
  add(gap());
  add(figure('metric_strength.png', 'Figure 1. Strength of each candidate metric (|Gini|, training loans). Blue = kept, grey = dropped; dashed line = 0.10.'));
  add(figure('metric_quartiles.png', 'Figure 2. Real default rate across each metric\'s value groups (training loans). Yes/no metrics show two groups.'));
  add(P(`${kept.length} of the ${d.evidence.length} candidates were kept. The strongest is balance volatility: loans in the most volatile quarter defaulted ${pct(ev.balance_volatility.bad_rate_q4, 0)} of the time, against ${pct(ev.balance_volatility.bad_rate_q1, 0)} in the most stable quarter. Borrowers with an overdraft in the year before the loan defaulted ${pct(ev.negative_balance_events.bad_rate_q2, 0)} of the time, against ${pct(ev.negative_balance_events.bad_rate_q1, 0)} of the rest. Age (Gini ${f2(ev.age_at_loan.gini_train)}), district unemployment and the spending ratio carry almost no signal.`));
  add(H2('5.1 Why each dropped metric was dropped'));
  for (const e of dropped) add(bullet(B(`${METRIC[e.metric]}: `), e.reason.replace(/negative_balance_events|balance_volatility|balance_trend|[a-z_]+_[a-z_]+/g, (m) => METRIC[m] || m)));
  add(P(`Account age, the most direct measure of history length, was dropped on the edge of the rule: its rank correlation with balance trend is ${pairText('history_months', 'balance_trend')}, right at the 0.5 limit.`));
  add(P(`A large difference between groups is not enough on its own. Only ${d.card.n} of the ${d.card.n_all} training borrowers had a card before their loan, and ${d.card.bad} of them defaulted. The group is too small to separate repaid from defaulted loans across the whole portfolio, so card ownership scores low overall even though card holders look safe.`));
  add(P(`Rank correlation was checked for every pair of metrics (Figure 3). ${METRIC.penalty_events} and overdraft events (${pairText('penalty_events', 'negative_balance_events')}), and lowest balance and balance volatility (${pairText('min_balance', 'balance_volatility')}), describe the same behaviour, so the weaker metric of each pair was dropped. Spend ÷ income and balance trend also overlap (${pairText('spend_to_income', 'balance_trend')}); spend ÷ income had already been dropped as weak.`));
  add(figure('correlation.png', 'Figure 3. Rank correlation between candidate metrics (training loans). Values shown where |r| ≥ 0.5.', 560));

  // 6
  add(H('6. The scorecard'));
  add(H2('6.1 Weights'));
  const strength = (w) => Number(w.strength);
  const strengthTotal = d.weights.reduce((a, w) => a + strength(w), 0);
  const W = Object.fromEntries(d.weights.map((w) => [w.metric, Number(w.weight)]));
  const CW = Object.fromEntries(d.critw.map((c) => [c.criterion, Number(c.weight)]));
  add(P('The weights follow from the strength of each kept metric (section 4.6). "Pairs right" is the share of repaid–defaulted pairs in which the metric points at the defaulted loan.'));
  add(table(['Metric', 'Criterion', 'Pairs right', 'Strength', 'Weight'], [
    ...d.weights.map((w) => [METRIC[w.metric], CRIT[w.criterion], pct((1 + strength(w)) / 2, 0), strength(w).toFixed(2), pct(w.weight)]),
    ['Total', '', '', strengthTotal.toFixed(2), '100.0%'],
  ]));
  add(gap());
  add(P(`Each weight is the strength of the metric divided by the total strength (${strengthTotal.toFixed(2)}). The weight of a criterion is the sum of the weights of its metrics. For example, ${CRIT.income} (${pct(CW.income)}) is ${METRIC.dti.toLowerCase()} (${pct(W.dti)}) plus ${METRIC.income_sources.toLowerCase()} (${pct(W.income_sources)}). ${CRIT.demographics} has no kept metric, so its weight is 0%.`));
  add(table(['Criterion', 'Weight'], d.critw.map((c) => [CRIT[c.criterion], pct(c.weight)])));
  add(gap());
  add(figure('weights.png', 'Figure 4. Weight of each kept metric in the score.', 520));
  add(P(`Metrics inside a criterion do not count equally. Inside ${CRIT.balance}, balance volatility carries about ${(W.balance_volatility / W.balance_trend).toFixed(1)} times the weight of balance trend.`));
  add(H2('6.2 Short history'));
  add(P(`A customer with one month of clean history should not look as good as one with years of it. Two things prevent this. First, money-based metrics are averaged over the months actually observed, and the payment metric is scored as "any overdraft in the window", so a short record cannot look perfect simply because little has happened yet. Second, points are pulled toward the average when few months were observed (section 4.7). As a result, customers whose account was less than six months old were approved ${pct(hist['<6'].approval_rate)} of the time, against ${pct(hist['12+'].approval_rate)} for accounts of a year or more. Their real default rate (${pct(hist['<6'].bad_rate)}) was also higher (${pct(hist['12+'].bad_rate)} for a year or more).`));
  add(table(['Account age at loan start', 'Loans', 'Real default rate', 'Average score', 'Approved'], d.history.map((h) => [
    `${h.history_bucket} months`, h.n, pct(h.bad_rate), Number(h.avg_score).toFixed(1), pct(h.approval_rate)])));
  add(gap());

  // 7
  add(H('7. Results'));
  add(table(['Set', 'Loans', 'Defaulted', 'Gini', 'Approved', 'Default rate if approved', 'Default rate if rejected'], d.summary.map((s) => [
    s.split === 'train' ? 'Train' : 'Test', s.n, s.n_bad, f2(s.gini), pct(s.approval_rate), pct(s.bad_rate_approved), pct(s.bad_rate_rejected)])));
  add(gap());
  add(table(['Grade', 'Train loans', 'Train default rate', 'Test loans', 'Test default rate'], ['A', 'B', 'C', 'D', 'E'].map((g) => {
    const tr = d.byGrade.find((r) => r.split === 'train' && r.grade === g) || {};
    const te = d.byGrade.find((r) => r.split === 'test' && r.grade === g) || {};
    return [g, tr.n ?? 0, pct(tr.bad_rate), te.n ?? 0, pct(te.bad_rate)];
  })));
  add(gap());
  add(figure('bad_rate_by_grade.png', 'Figure 5. Share of loans that really defaulted, by grade (blue = approved grades, red = rejected).', 560));
  add(P(`The default rate rises from grade A to grade E on both sets (train ${gradeRow('train')}; test ${gradeRow('test')}). The test Gini (${f2(S.test.gini)}) is higher than the training Gini (${f2(S.train.gini)}), but the test set holds only ${S.test.n_bad} defaulted loans, so this difference should not be read as an improvement.`));
  add(figure('score_distribution.png', 'Figure 6. Score distribution with the grade thresholds (dashed).', 600));
  add(H2('7.1 Robustness checks'));
  add(P('Running loans (status C) may still default later. The scorecard was therefore also checked on finished loans only and on loans issued at least a year before the data ends.'));
  add(table(['Check', 'Set', 'Loans', 'Defaulted', 'Gini'], d.finished.map((f) => [
    f.view_name === 'finished_A_vs_B' ? 'Finished loans only' : 'Loans at least 12 months old',
    f.split === 'train' ? 'Train' : 'Test', f.n, f.n_bad, f.gini === null ? '— (no defaults)' : f2(f.gini)])));
  add(gap());
  add(figure('criteria_by_grade.png', 'Figure 7. Average criterion points by grade.', 520));

  // 8
  add(H('8. Worked examples'));
  for (const [i, ex] of d.examples.entries()) {
    const s = ex.score;
    add(H2(`8.${i + 1} Loan ${s.loan_id} — grade ${s.grade}, score ${Number(s.score).toFixed(2)}`));
    add(P(`Loan of ${int(s.amount)} over ${s.duration_months} months (${int(s.monthly_payment)} a month), granted ${s.loan_date}.`));
    add(table(['Metric', 'Value', 'Bucket points', 'Points after short-history adjustment', 'Weight', 'Adds to score'], ex.points.map((p) => [
      METRIC[p.metric], valueText(p.metric, p.raw_value), Number(p.band_points).toFixed(1), Number(p.points).toFixed(1), pct(p.weight), (Number(p.weight) * Number(p.points)).toFixed(2)])));
    add(code(ex.points.map((p) => `${Number(p.weight).toFixed(3)}×${Number(p.points).toFixed(1)}`).join(' + ') + ` = ${Number(s.score).toFixed(2)}`));
    add(P(`Decision: ${s.approved ? 'approve' : 'reject'}. What really happened: status ${s.status} — ${STATUS[s.status].toLowerCase()}.`));
  }

  // 9
  add(H('9. Dashboard'));
  add(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(t('The interactive dashboard is available at ')), new ExternalHyperlink({ link: DASHBOARD_URL, children: [new TextRun({ text: t(DASHBOARD_URL), style: 'Hyperlink' })] }), new TextRun(t('. It reads the same tables as this report and has four pages:'))] }));
  add(bullet(B('Portfolio: '), 'loans per grade, the real default rate per grade on training and test loans, and the score distribution.'));
  add(bullet(B('Evidence: '), 'strength of every candidate metric, default rate across value groups, correlations, weights, and the checks on unseen loans.'));
  add(bullet(B('Criteria by grade: '), 'average criterion points for each grade.'));
  add(bullet(B('Loan drill-down: '), 'for any loan, each metric\'s value, bucket, points and weight, its 12 months of money in and out and balance before the loan, and finally what really happened.'));
  add(figure('example_balance.png', 'Figure 8. Drill-down example: month-end balance in the 12 months before a loan.', 480));

  // 10
  add(H('10. Limitations'));
  add(bullet(`Few defaulted loans: ${nBad} in total and ${S.test.n_bad} in the test set. Test results show a direction, not precise rates.`));
  add(bullet('One bank in one country in the 1990s. The method transfers to other data; the exact weights and thresholds would need to be calculated again.'));
  add(bullet('No declared income: income is estimated from money coming into the account.'));
  add(bullet('Each account has at most one loan, so repayment of earlier loans cannot be measured. Overdrafts and penalty interest are the closest signal available.'));
  add(bullet(`Joint account carries the ${rankWord} weight (${pct(jointW?.weight)}) because none of the joint-account training loans defaulted. With more data this weight could change.`));
  add(bullet('The data has no date for when a second user joined an account, so joint-account status may have changed after the loan start date. It is the only kept metric that cannot be checked point in time.'));
  add(bullet(`Most test loans are still running (only ${d.finished.find((f) => f.view_name === 'finished_A_vs_B' && f.split === 'test')?.n ?? 0} have finished), so some may still default.`));

  // Appendix
  add(H('Appendix A. Bucket limits and points'));
  add(table(['Metric', 'Bucket', 'Points', 'Training default rate', 'Training loans'], d.bands.map((b) => [
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

const REQUIRED = ['1. Executive summary', '2. The data', '3. Data model', '4. Method', '5. Evidence for each metric', '6. The scorecard',
  '7. Results', '8. Worked examples', '9. Dashboard', '10. Limitations', 'Appendix A. Bucket limits and points', 'Appendix B. How to reproduce'];

async function main() {
  const d = await load();
  const body = build(d);
  const missing = REQUIRED.filter((h) => !headings.includes(h));
  if (missing.length) throw new Error(`missing sections: ${missing.join(', ')}`);
  checkText(allText, /previous version|previous review|300–850|\bband(s|ing)?\b/i);
  const doc = new Document({
    features: { updateFields: true },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: body }],
  });
  fs.writeFileSync(OUT, await Packer.toBuffer(doc));
  console.log(`saved ${path.relative(ROOT, OUT)} — ${headings.length} headings, ${allText.length} text blocks`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
