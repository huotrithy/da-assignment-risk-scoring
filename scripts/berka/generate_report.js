// Generate docs/Final_Report.docx from the live scorecard tables (no number is typed by hand).
// Needs: npm run scorecard (tables) and node scripts/berka/capture_charts.js (images in docs/img/charts).
// Usage: node scripts/berka/generate_report.js [output.docx]
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ImageRun, AlignmentType, ShadingType, ExternalHyperlink, PageBreak, TableOfContents,
} = require('docx');
const { ROOT, DASHBOARD_URL, METRIC, DETAIL, CRIT, VERDICT, STATUS, pct, f2, int, chart, checkText, load, pairText: pairOf, bandText, valueText } = require('./lib/report_data');

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
// A block of SQL: one shaded paragraph per line. Not passed through t(): SQL keeps the real column names (band, NULL).
const sql = (text) => [...text.trim().split('\n').map((line) => new Paragraph({
  spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
  children: [new TextRun({ text: line.replace(/ /g, ' ') || ' ', font: 'Consolas', size: 14 })],
})), gap()];

// How each candidate metric is calculated (scripts/berka/10_features.sql), over the 12 months before the loan.
const CALC = {
  negative_balance_events: "COUNT(*) FILTER (WHERE balance < 0)",
  penalty_events: "COUNT(*) FILTER (WHERE k_symbol = 'penalty_interest')",
  dti: 'monthly_payment ÷ (total money in ÷ months observed)',
  income_sources: "COUNT(DISTINCT bank || partner_account) FILTER (WHERE operation = 'transfer_in')",
  monthly_inflow: "SUM(amount) FILTER (WHERE type = 'credit') ÷ months observed",
  balance_volatility: 'STDDEV_SAMP(month-end balance) ÷ AVG(month-end balance)',
  min_balance: 'MIN(balance)',
  balance_trend: 'REGR_SLOPE(month-end balance, month) ÷ ABS(AVG(month-end balance))',
  spend_to_income: 'total money out ÷ total money in',
  joint_account: 'the account has more than one disposition (owner + second user)',
  history_months: '(loan_date − open_date) in months',
  has_card: 'a card of the owner with issued_date < loan_date exists',
  age_at_loan: 'AGE(loan_date, birth_date) in years',
  district_unemployment: 'unemployment rate of the owner\'s district (1996, else 1995)',
};
const BY_CRIT = {
  payment: ['negative_balance_events', 'penalty_events'], income: ['dti', 'income_sources', 'monthly_inflow'],
  balance: ['balance_volatility', 'min_balance', 'balance_trend', 'spend_to_income'],
  relationship: ['joint_account', 'history_months', 'has_card'], demographics: ['age_at_loan', 'district_unemployment'],
};
const REPO_URL = 'https://github.com/huotrithy/da-assignment-risk-scoring';
// Source tables (scripts/berka/00_schema.sql): [column, type, description].
const SCHEMA = {
  district: ['One row per region (77 rows).', [
    ['district_id', 'INT, PK', 'District number'],
    ['name', 'TEXT', 'District name'],
    ['region', 'TEXT', 'Region the district belongs to'],
    ['inhabitants', 'INT', 'Number of inhabitants'],
    ['avg_salary', 'NUMERIC', 'Average salary'],
    ['unemployment_95', 'NUMERIC', 'Unemployment rate in 1995 (missing for one district)'],
    ['unemployment_96', 'NUMERIC', 'Unemployment rate in 1996'],
    ['entrepreneurs_per_1000', 'INT', 'Entrepreneurs per 1,000 inhabitants'],
    ['crimes_95', 'INT', 'Crimes committed in 1995 (missing for one district)'],
    ['crimes_96', 'INT', 'Crimes committed in 1996'],
  ]],
  account: ['One row per bank account (4,500 rows).', [
    ['account_id', 'INT, PK', 'Account number'],
    ['district_id', 'INT, FK → district', 'District of the branch'],
    ['frequency', 'TEXT', 'How often statements are issued: monthly, weekly or after_transaction'],
    ['open_date', 'DATE', 'Date the account was opened'],
  ]],
  client: ['One row per person (5,369 rows).', [
    ['client_id', 'INT, PK', 'Client number'],
    ['birth_date', 'DATE', 'Birth date, decoded from the birth number'],
    ['gender', 'CHAR(1)', 'M or F, decoded from the birth number; never used for scoring'],
    ['district_id', 'INT, FK → district', 'District where the client lives'],
  ]],
  disposition: ['One row per right of a client on an account (5,369 rows).', [
    ['disp_id', 'INT, PK', 'Disposition number'],
    ['client_id', 'INT, FK → client', 'The client'],
    ['account_id', 'INT, FK → account', 'The account'],
    ['type', 'TEXT', 'OWNER, or DISPONENT for a second user. Only the owner can take a loan'],
  ]],
  card: ['One row per card (892 rows).', [
    ['card_id', 'INT, PK', 'Card number'],
    ['disp_id', 'INT, FK → disposition', 'The disposition the card was issued to'],
    ['type', 'TEXT', 'junior, classic or gold'],
    ['issued_date', 'DATE', 'Date the card was issued'],
  ]],
  loan: ['One row per loan (682 rows); an account has at most one loan.', [
    ['loan_id', 'INT, PK', 'Loan number'],
    ['account_id', 'INT, FK → account, unique', 'The account the loan belongs to'],
    ['loan_date', 'DATE', 'Loan start date'],
    ['amount', 'NUMERIC', 'Amount of the loan'],
    ['duration_months', 'INT', 'Term of the loan in months'],
    ['monthly_payment', 'NUMERIC', 'Monthly payment'],
    ['status', 'CHAR(1)', 'A finished and paid, B finished and not paid, C running and on time, D running and behind'],
    ['is_bad', 'BOOLEAN', 'True for status B or D (defaulted); added when the data is loaded'],
  ]],
  trans: ['One row per transaction (1,056,320 rows).', [
    ['trans_id', 'INT, PK', 'Transaction number'],
    ['account_id', 'INT, FK → account', 'The account'],
    ['trans_date', 'DATE', 'Date of the transaction'],
    ['type', 'TEXT', 'credit (money in) or withdrawal (money out)'],
    ['operation', 'TEXT', 'cash_deposit, transfer_in, cash_withdrawal, card_withdrawal or transfer_out; empty for interest'],
    ['amount', 'NUMERIC', 'Amount of the transaction'],
    ['balance', 'NUMERIC', 'Balance of the account after the transaction'],
    ['k_symbol', 'TEXT', 'Purpose: interest, penalty_interest, household, pension, insurance, statement_fee, loan_payment'],
    ['bank', 'TEXT', 'Bank code of the other party'],
    ['partner_account', 'TEXT', 'Account of the other party'],
  ]],
  standing_order: ['One row per permanent payment order (6,471 rows); not used by the scorecard.', [
    ['order_id', 'INT, PK', 'Order number'],
    ['account_id', 'INT, FK → account', 'The paying account'],
    ['bank_to', 'TEXT', 'Bank of the recipient'],
    ['account_to', 'TEXT', 'Account of the recipient'],
    ['amount', 'NUMERIC', 'Amount paid each time'],
    ['k_symbol', 'TEXT', 'Purpose: household, insurance, loan_payment or leasing'],
  ]],
};
// Scripts printed in Appendix C, read from disk so the report always shows the code that ran.
const SCRIPTS = [
  ['C.1 Preprocessing', 'The raw files are read, dates and birth numbers are decoded, the Czech codes are translated to English and the rows are loaded into PostgreSQL.',
    ['lib/parse.js', 'load_berka.js']],
  ['C.2 Feature extraction', 'One row of candidate metrics per loan, from the 12 months before the loan start date.', ['10_features.sql']],
  ['C.3 Scorecard logic', 'The pair test, buckets, points, weights and thresholds are calculated from the training loans and stored in the scorecard tables.',
    ['lib/scorecard.js', 'fit_scorecard.js']],
  ['C.4 Scoring', 'Every loan gets its points, score and grade from the stored buckets, weights and thresholds.', ['20_score.sql']],
  ['C.5 Checking the result', 'The Gini function and the views behind the result tables.', ['30_validate.sql']],
];

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
  const jointW = d.weights.find((w) => w.metric === 'joint_account');
  const jointRank = d.weights.findIndex((w) => w.metric === 'joint_account') + 1;
  const rankWord = ['', 'largest', 'second-largest', 'third-largest', 'fourth-largest'][jointRank] || `${jointRank}th-largest`;
  const gradeRow = (split) => d.byGrade.filter((g) => g.split === split).map((g) => pct(g.bad_rate)).join(' / ');
  const pairText = (a, b) => pairOf(d, a, b);
  // Decision per grade. Grade C passes the approve line but is the closest to it, so a person reviews it.
  const DECISION = { A: 'Approve', B: 'Approve', C: 'To be reviewed', D: 'Reject', E: 'Reject' };
  const gradeOf = (split, g) => d.byGrade.find((r) => r.split === split && r.grade === g) || { n: 0, n_bad: 0 };
  const rate = (bad, n) => (Number(n) ? pct(Number(bad) / Number(n)) : '—');

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
  add(bullet(B('Metrics: '), `${d.evidence.length} candidate metrics were tested; ${kept.length} were kept. The others were too weak or repeated a stronger metric (section 5).`));
  add(bullet(B('Weights: '), 'a stronger metric counts more: the weight of a metric is its share of the total strength of the kept metrics.'));
  add(bullet(B('Points: '), 'each metric is split into buckets and scored by rank: 100 points for the bucket with the lowest real default rate, down to 10 for the highest.'));
  add(bullet(B('Score: '), 'the weighted sum of points; a higher score is safer and the maximum is 100.'));
  add(bullet(B('Approval: '), `a loan is approved only where the default rate is below the average. On the test loans, ${pct(S.test.bad_rate_approved)} of the approved loans defaulted, against ${pct(S.test.bad_rate_rejected)} of the rejected loans.`));
  add(P(`The scorecard was learned on the earliest ${int(S.train.n)} loans and checked on the latest ${int(S.test.n)}, which it never saw. It separates repaid from defaulted loans with a Gini of ${f2(S.train.gini)} on the training loans and ${f2(S.test.gini)} on the test loans, and the default rate rises steadily from grade A to grade E. The test set contains only ${S.test.n_bad} defaulted loans, so the test figures show a direction rather than a precise rate.`));
  add(H2('1.1 Business problem and goal'));
  add(P('A loan that is not repaid is a loss for the bank. Checking each application by hand is slow, and two loan officers can decide differently on the same customer. The goal is a score that treats every applicant the same way:'));
  add(bullet('A score out of 100 and a risk grade from A to E for every loan.'));
  add(bullet('Only data the bank already has is used: accounts and transactions, with no credit bureau.'));
  add(bullet('The same score can be used when an application arrives and as a batch scan to select customers for loan offers.'));
  add(bullet('The score is explainable: every metric, point and weight is visible.'));
  add(bullet('Every choice is tested on real loan outcomes.'));
  add(H2('1.2 Key terms'));
  add(table(['Term', 'Meaning'], [
    ['Loan start date', 'The date the loan was granted. Only data from before this date is used to score the loan.'],
    ['Defaulted loan', `A loan that was not repaid (status B) or is behind on payments (status D): ${nBad} of ${int(d.counts.loans)} loans.`],
    ['Default rate', 'The share of loans in a group that defaulted, e.g. 10% = 1 in 10 loans.'],
    ['Overdraft', 'The account spends more than it holds, so the balance drops below zero.'],
    ['Metric', 'One number measured for each loan, e.g. balance volatility.'],
    ['Bucket and points', 'A bucket is a value range of a metric. Points are given by rank: 100 for the bucket with the lowest default rate, 10 for the highest.'],
    ['Weight', 'How much a metric counts in the score. A stronger metric counts more; all weights add up to 100%.'],
    ['Gini coefficient', 'The strength of a metric or of the score: how often it tells a defaulted loan from a repaid one. 0 = coin flip, 1 = perfect (section 4.4).'],
    ['Train / test', 'The older 70% of loans build the scorecard; the newer 30% are kept back to check it.'],
  ]));
  add(gap());

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
  add(H2('3.1 Source tables'));
  add(P('The eight source tables are listed one by one. PK marks the primary key and FK a foreign key. The definitions are in scripts/berka/00_schema.sql.'));
  for (const [name, [about, cols]] of Object.entries(SCHEMA)) {
    add(P(B(name + '. '), about));
    add(table(['Column', 'Type', 'Description'], cols));
    add(gap());
  }
  add(H2('3.2 Data sample'));
  add(P('The first loans in the data (table loan):'));
  add(table(['loan_id', 'account_id', 'loan_date', 'amount', 'duration_months', 'monthly_payment', 'status'], d.sampleLoans.map((l) => [
    l.loan_id, l.account_id, l.loan_date, int(l.amount), l.duration_months, int(l.monthly_payment), l.status])));
  add(gap());
  add(P(`Transactions shortly before loan ${d.examples[0].score.loan_id} was granted (table trans). The partner bank and account are left out because they are sensitive. The data holds a date but no time, so the order of transactions within one day is not known.`));
  add(table(['trans_id', 'trans_date', 'type', 'operation', 'amount', 'balance', 'k_symbol'], d.sampleTrans.map((r) => [
    r.trans_id, r.trans_date, r.type, r.operation ?? '—', int(r.amount), int(r.balance), r.k_symbol ?? '—'])));
  add(gap());
  add(P('From these tables one row of metrics is calculated per loan (table loan_features). The two loans below are the worked examples of section 8:'));
  add(table(['loan_id', 'split', 'months_observed', 'negative_balance_events', 'dti', 'income_sources', 'balance_volatility', 'balance_trend', 'joint_account'], d.sampleFeatures.map((f) => [
    f.loan_id, f.split, Number(f.months_observed).toFixed(1), f.negative_balance_events, f.dti === null ? '—' : Number(f.dti).toFixed(2), f.income_sources,
    f.balance_volatility === null ? '—' : Number(f.balance_volatility).toFixed(2), f.balance_trend === null ? '—' : Number(f.balance_trend).toFixed(3), f.joint_account])));
  add(gap());
  add(H2('3.3 Scorecard tables'));
  add(table(['Scorecard table', 'One row per', 'Holds'], [
    ['loan_features', 'loan', '14 candidate metrics from the 12 months before the loan; train/test flag'],
    ['metric_evidence', 'candidate metric', 'Gini, default rate per group, verdict and reason'],
    ['metric_correlation', 'pair of metrics', 'rank correlation'],
    ['scorecard_band', 'metric × bucket', 'value range, points, default rate'],
    ['scorecard_weight', 'kept metric', 'Gini coefficient and weight'],
    ['scorecard_param', 'setting', 'grade thresholds, approve line, short-history constant'],
    ['loan_metric_points, loan_score', 'loan (× metric)', 'points, score, grade, decision'],
    ['validation_* views', 'split / grade', 'Gini, approval and default rates'],
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
  add(P('The table shows how each candidate metric is calculated from the transactions of the 12 months before the loan. The full query is in Appendix C.2.'));
  add(table(['Criterion', 'Metric', 'Calculation'], Object.entries(BY_CRIT).flatMap(([c, ms]) => ms.map((m) => [CRIT[c], METRIC[m], CALC[m]]))));
  add(gap());
  add(P('Month-end balance is the balance after the last transaction of each month. Months observed is the number of months between the account opening (or 12 months before the loan, if later) and the loan start date. Gender is available in the data but is never used as a scoring input.'));
  add(H2('4.4 Selection rules'));
  add(bullet(B('Strength: '), 'how well the metric tells a defaulted loan from a repaid one, measured on the training loans with a pair test (explained below). A metric with a strength below 0.10 is dropped as weak.'));
  add(bullet(B('Duplicates: '), 'Spearman rank correlation between every pair of metrics. At 0.5 or above (either sign) the two metrics describe the same behaviour, so the weaker one is dropped. This stops one behaviour being scored twice.'));
  add(bullet(B('Usable buckets: '), 'the default rate must move in one direction across at least two buckets (section 4.5).'));
  add(P('The pair test works like a quiz for the metric. Every repaid loan is paired with every defaulted loan, and for each pair we ask: does the metric point at the loan that defaulted? A metric that knows nothing is right in half of the pairs, like a coin flip; a perfect metric is right in all of them. The example below uses five loans and balance trend. The claim of this metric is that a growing balance is safer than a shrinking one, so a pair is right when the defaulted loan has the lower trend.'));
  add(table(['Loan', 'Outcome', 'Balance trend per month'], [['A', 'repaid', '+0.05'], ['B', 'repaid', '+0.03'], ['C', 'repaid', '−0.01'], ['X', 'defaulted', '−0.005'], ['Y', 'defaulted', '−0.04']]));
  add(gap());
  add(table(['Pair', 'Loan with the lower trend', 'Metric is'], [['A – X', 'X', 'right'], ['A – Y', 'Y', 'right'], ['B – X', 'X', 'right'], ['B – Y', 'Y', 'right'], ['C – X', 'C', 'wrong'], ['C – Y', 'Y', 'right']]));
  add(gap());
  add(P(`The metric is right in 5 of the 6 pairs, or 83%. The strength rescales this share so that a coin flip gives 0 and a perfect metric gives 1: strength = 2 × (share of pairs right) − 1, here 2 × 0.83 − 1 = 0.67. This number is known as the Gini coefficient. A pair in which both loans have the same value counts as half right. On the real data the training set has ${int(S.train.n - S.train.n_bad)} repaid and ${S.train.n_bad} defaulted loans, so every metric is tested on ${int((S.train.n - S.train.n_bad) * S.train.n_bad)} pairs. The sign of the result also shows which direction is safe, so the direction is not assumed. The same test applied to the final score gives ${f2(S.train.gini)} on the training loans: the repaid loan has the higher score in ${pct((Number(S.train.gini) + 1) / 2, 0)} of pairs.`));
  add(H2('4.5 Buckets and points'));
  add(P('Each kept metric is cut into buckets at the quartiles of its training values (two buckets for yes/no metrics). Neighbouring buckets are merged until the default rate rises or falls steadily. Points are then given by rank: the bucket with the lowest default rate earns 100 points and the one with the highest earns 10, evenly spaced in between (100 / 70 / 40 / 10 for four buckets, 100 / 55 / 10 for three, 100 / 10 for two). A missing value is placed in the riskier bucket. The bucket limits are fixed numbers, so the points of a customer do not depend on who else is scored.'));
  {
    const m = 'dti', e = ev[m], bands = d.bands.filter((b) => b.metric === m);
    const q = [e.bad_rate_q1, e.bad_rate_q2, e.bad_rate_q3, e.bad_rate_q4].map((v) => pct(v, 0));
    add(P(`Example: ${METRIC[m].toLowerCase()}. Sorted by the metric and cut into four groups, the training loans defaulted ${q.join(', ')} of the time. The third group (${q[2]}) is lower than the second (${q[1]}), so the default rate does not move in one direction. The two groups are merged into one bucket, which leaves ${bands.length} buckets:`));
    add(table(['Bucket', 'Training loans', 'Defaulted', 'Default rate', 'Points'], bands.map((b) => [
      bandText(b), b.n_train, Math.round(Number(b.bad_rate) * Number(b.n_train)), pct(b.bad_rate, 0), Number(b.points).toFixed(0)])));
    add(gap());
    add(P('Groups are merged for three reasons. A higher value should always mean more risk, or always less. A small group can be out of order by chance. And merging keeps the points simple and in one direction. A merged bucket counts its loans together, so its default rate lies between those of the two groups. The points depend only on the order of the buckets, not on the size of the default rates.'));
  }
  add(H2('4.6 Weights'));
  add(P('The weight of a metric is its Gini coefficient divided by the total of the kept metrics, so a metric that separates repaid from defaulted loans better counts more, and all weights add up to 100%. Each metric has its own weight; metrics are not grouped into weighted criteria.'));
  add(H2('4.7 Short history'));
  add(P('Metrics measured over the 12-month window — overdraft events, balance volatility and loan payment ÷ income — are less reliable when few months were observed. Their points are pulled toward the training average in proportion to how little history there is:'));
  add(code('points = average + (points − average) × months ÷ (months + k)'));
  add(P(`k was chosen from 3, 6 and 12 as the value giving the best training Gini (k = ${P_.shrink_k}). A customer with only a short clean record cannot reach the full 100 points.`));
  {
    const k = P_.shrink_k, m = 'balance_volatility';
    const avg = Number(d.avgPoints.find((r) => r.metric === m).avg_points), a0 = avg.toFixed(0), gapPts = (100 - avg).toFixed(0);
    const pts = (months, p) => (avg + (p - avg) * months / (months + k)).toFixed(0);
    const trust = (mo) => pct(mo / (mo + k), 0);
    add(P(`The formula can be read as: points = average + gap × trust, where the gap is the bucket points minus the average, and the trust is months ÷ (months + ${k}). Example: ${METRIC[m].toLowerCase()}, safest bucket, ${k} months of history.`));
    add(table(['Step', 'Question', 'Calculation', 'Result'], [
      ['1', 'What points does the bucket give?', 'from the bucket', '100'],
      ['2', `How far is that from the average customer (${a0})?`, `100 − ${a0}`, `gap of ${gapPts}`],
      ['3', `How much are ${k} months of data trusted?`, `${k} ÷ (${k} + ${k})`, trust(k)],
      ['4', 'Add that share of the gap to the average', `${a0} + ${gapPts} × ${trust(k)}`, pts(k, 100)],
    ]));
    add(gap());
    add(P('With more months the customer keeps more of the gap:'));
    add(table(['Months of history', 'Share of the gap kept', 'Points'], [1, 3, 6, 12].map((mo) => [String(mo), `${mo} ÷ ${mo + k} = ${trust(mo)}`, pts(mo, 100)])));
    add(gap());
    add(P(`The adjustment works in both directions: with ${k} months of history, the riskiest bucket (10 points) becomes ${pts(k, 10)} points.`));
  }
  add(H2('4.8 Score, grades and approval'));
  add(code('score = Σ (weight × points)          higher = safer, maximum 100'));
  add(P(`The approve line is set on the training scores. Starting from the highest scores, each tenth of the loans is approved only while its own default rate stays below the average default rate (${pct(P_.portfolio_bad_rate)}). The approved range is split into thirds for grades A, B and C, and the rejected range in half for D and E.`));
  {
    const range = { A: `≥ ${P_.grade_A.toFixed(1)}`, B: `${P_.grade_B.toFixed(1)} – ${P_.grade_A.toFixed(1)}`, C: `${P_.grade_C.toFixed(1)} – ${P_.grade_B.toFixed(1)}`,
      D: `${P_.grade_D.toFixed(1)} – ${P_.grade_C.toFixed(1)}`, E: `< ${P_.grade_D.toFixed(1)}` };
    add(table(['Grade', 'Score', 'Training loans', 'Defaulted', 'Default rate', 'Decision'], [
      ...['A', 'B', 'C', 'D', 'E'].map((g) => { const r = gradeOf('train', g); return [g, range[g], r.n, r.n_bad, rate(r.n_bad, r.n), DECISION[g]]; }),
      ['Total', '', S.train.n, S.train.n_bad, pct(P_.portfolio_bad_rate), ''],
    ]));
    add(gap());
    add(P(`Grades A to C default less often than the average loan, and grades D and E more often. Grade C sits just above the approve line (${P_.grade_C.toFixed(1)}), so these loans are reviewed by a person before the decision. In the result figures of this report grades A to C are counted as approved.`));
  }

  // 5
  add(H('5. Evidence for each metric'));
  add(P('The table lists every candidate metric with its strength, the default rate across its value groups (lowest value first) and the decision. A positive Gini means a higher value is riskier; a negative Gini means a higher value is safer.'));
  add(table(['Metric', 'Gini', 'Default rate by group (low → high)', 'Decision'], d.evidence.map((e) => [
    METRIC[e.metric], Number(e.gini_train).toFixed(2),
    [e.bad_rate_q1, e.bad_rate_q2, e.bad_rate_q3, e.bad_rate_q4].filter((v) => v !== null).map((v) => pct(v, 0)).join(' / '),
    VERDICT[e.verdict]])));
  add(gap());
  add(figure('metric_strength.png', 'Figure 1. Strength of each candidate metric (|Gini|, training loans). Blue = kept, grey = dropped; dashed line = 0.10.'));
  add(figure('metric_quartiles.png', 'Figure 2. Real default rate across each metric\'s value groups (training loans). Yes/no metrics show two groups.'));
  add(P(`${kept.length} of the ${d.evidence.length} candidates were kept. The strongest is balance volatility: loans in the most volatile quarter defaulted ${pct(ev.balance_volatility.bad_rate_q4, 0)} of the time, against ${pct(ev.balance_volatility.bad_rate_q1, 0)} in the most stable quarter. Borrowers with an overdraft in the year before the loan defaulted ${pct(ev.negative_balance_events.bad_rate_q2, 0)} of the time, against ${pct(ev.negative_balance_events.bad_rate_q1, 0)} of the rest. Age (Gini ${f2(ev.age_at_loan.gini_train)}), district unemployment and the spending ratio carry almost no signal.`));
  add(H2('5.1 Why each dropped metric was dropped'));
  for (const e of dropped) add(bullet(B(`${METRIC[e.metric]}: `), e.reason.replace(/negative_balance_events|balance_volatility|balance_trend|[a-z_]+_[a-z_]+/g, (m) => METRIC[m] || m)));
  add(P(`A large difference between groups is not enough on its own. Only ${d.card.n} of the ${d.card.n_all} training borrowers had a card before their loan, and ${d.card.bad} of them defaulted. The group is too small to separate repaid from defaulted loans across the whole portfolio, so card ownership scores low overall even though card holders look safe.`));
  add(P(`Rank correlation was checked for every pair of metrics (Figure 3). ${METRIC.penalty_events} and overdraft events (${pairText('penalty_events', 'negative_balance_events')}), and lowest balance and balance volatility (${pairText('min_balance', 'balance_volatility')}), describe the same behaviour, so the weaker metric of each pair was dropped. Spend ÷ income and balance trend also overlap (${pairText('spend_to_income', 'balance_trend')}); spend ÷ income had already been dropped as weak.`));
  add(figure('correlation.png', 'Figure 3. Rank correlation between candidate metrics (training loans). Values shown where |r| ≥ 0.5.', 560));

  // 6
  add(H('6. The scorecard'));
  add(H2('6.1 Kept metrics'));
  add(P(`The scorecard uses ${kept.length} metrics. Each one answers a question about the customer and is measured over the 12 months before the loan start date.`));
  add(table(['Metric', 'Question', 'Why it signals risk', 'How it is measured'], d.weights.map((w) => [METRIC[w.metric], `${DETAIL[w.metric][0]}`, DETAIL[w.metric][1], DETAIL[w.metric][2]])));
  add(gap());
  add(P('The bucket limits, points and training default rates of every kept metric are listed in Appendix A.'));
  add(H2('6.2 Weights'));
  const strength = (w) => Number(w.strength);
  const strengthTotal = d.weights.reduce((a, w) => a + strength(w), 0);
  const W = Object.fromEntries(d.weights.map((w) => [w.metric, Number(w.weight)]));
  const topW = d.weights[0], lastW = d.weights[d.weights.length - 1];
  add(P('The weights follow from the Gini coefficient of each kept metric (section 4.6). "Pairs right" is the share of repaid–defaulted pairs in which the metric points at the defaulted loan.'));
  add(table(['Metric', 'Pairs right', 'Gini coefficient', 'Weight'], [
    ...d.weights.map((w) => [METRIC[w.metric], pct((1 + strength(w)) / 2, 0), strength(w).toFixed(2), pct(w.weight)]),
    ['Total', '', strengthTotal.toFixed(2), '100.0%'],
  ]));
  add(gap());
  add(P(`Each weight is the Gini coefficient of the metric divided by the total (${strengthTotal.toFixed(2)}). For ${METRIC[topW.metric].toLowerCase()}: ${strength(topW).toFixed(2)} ÷ ${strengthTotal.toFixed(2)} = ${pct(topW.weight)}. It counts about ${(Number(topW.weight) / Number(lastW.weight)).toFixed(0)} times as much as ${METRIC[lastW.metric].toLowerCase()} (${pct(lastW.weight)}). Age and district unemployment did not pass the pair test (Gini ${f2(ev.age_at_loan.gini_train)} and ${f2(ev.district_unemployment.gini_train)}), so no demographic metric is in the score. Gender was never a candidate.`));
  add(figure('weights.png', 'Figure 4. Weight of each kept metric in the score.', 520));
  add(H2('6.3 Short history'));
  add(P(`Section 4.7 describes how a short history is handled. The effect: loans on accounts less than six months old were approved ${pct(hist['<6'].approval_rate)} of the time, against ${pct(hist['12+'].approval_rate)} for accounts of a year or more. Their real default rate was also higher (${pct(hist['<6'].bad_rate)} against ${pct(hist['12+'].bad_rate)}).`));
  add(table(['Account age at loan start', 'Loans', 'Real default rate', 'Average score', 'Approved'], d.history.map((h) => [
    `${h.history_bucket} months`, h.n, pct(h.bad_rate), Number(h.avg_score).toFixed(1), pct(h.approval_rate)])));
  add(gap());

  // 7
  add(H('7. Results'));
  add(table(['Set', 'Loans', 'Defaulted', 'Gini', 'Approved', 'Default rate if approved', 'Default rate if rejected'], d.summary.map((s) => [
    s.split === 'train' ? 'Train' : 'Test', s.n, s.n_bad, f2(s.gini), pct(s.approval_rate), pct(s.bad_rate_approved), pct(s.bad_rate_rejected)])));
  add(gap());
  add(P(`The table below shows the test loans by grade. These ${S.test.n} loans were not used to build the scorecard.`));
  const gradeTable = (split, label) => table(['Grade', `${label} loans`, 'Defaulted', 'Default rate', 'Decision'], [
    ...['A', 'B', 'C', 'D', 'E'].map((g) => { const r = gradeOf(split, g); return [g, r.n, r.n_bad, rate(r.n_bad, r.n), DECISION[g]]; }),
    ['Total', S[split].n, S[split].n_bad, rate(S[split].n_bad, S[split].n), ''],
  ]);
  add(gradeTable('test', 'Test'));
  add(gap());
  add(figure('bad_rate_by_grade.png', 'Figure 5. Share of loans that really defaulted, by grade (blue = approved grades, red = rejected).', 560));
  add(P(`The default rate rises from grade A to grade E on both sets (train ${gradeRow('train')}; test ${gradeRow('test')}). The test Gini (${f2(S.test.gini)}) is higher than the training Gini (${f2(S.train.gini)}), but the test set holds only ${S.test.n_bad} defaulted loans, so this difference should not be read as an improvement.`));
  add(figure('score_distribution.png', 'Figure 6. Score distribution with the grade thresholds (dashed).', 600));

  // 8
  add(H('8. Worked examples'));
  for (const [i, ex] of d.examples.entries()) {
    const s = ex.score;
    add(H2(`8.${i + 1} Loan ${s.loan_id} — grade ${s.grade}, score ${Number(s.score).toFixed(2)}`));
    add(P(`Loan of ${int(s.amount)} over ${s.duration_months} months (${int(s.monthly_payment)} a month), granted ${s.loan_date}.`));
    add(table(['Metric', 'Value', 'Bucket points', 'Points after short-history adjustment', 'Weight', 'Adds to score'], ex.points.map((p) => [
      METRIC[p.metric], valueText(p.metric, p.raw_value), Number(p.band_points).toFixed(1), Number(p.points).toFixed(1), pct(p.weight), (Number(p.weight) * Number(p.points)).toFixed(2)])));
    add(code(ex.points.map((p) => `${Number(p.weight).toFixed(3)}×${Number(p.points).toFixed(1)}`).join(' + ') + ` = ${Number(s.score).toFixed(2)}`));
    add(P(`Decision: ${DECISION[s.grade].toLowerCase()}. What really happened: status ${s.status} — ${STATUS[s.status].toLowerCase()}.`));
  }

  // 9
  add(H('9. Dashboard'));
  add(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(t('The interactive dashboard is available at ')), new ExternalHyperlink({ link: DASHBOARD_URL, children: [new TextRun({ text: t(DASHBOARD_URL), style: 'Hyperlink' })] }), new TextRun(t('. It reads the same tables as this report and has four pages:'))] }));
  add(bullet(B('Portfolio: '), 'loans per grade, the real default rate per grade on training and test loans, and the score distribution.'));
  add(bullet(B('Evidence: '), 'strength of every candidate metric, default rate across value groups, correlations, weights, and the checks on unseen loans.'));
  add(bullet(B('Criteria by grade: '), 'average criterion points for each grade.'));
  add(bullet(B('Loan drill-down: '), 'for any loan, each metric\'s value, bucket, points and weight, its 12 months of money in and out and balance before the loan, and finally what really happened.'));
  add(figure('example_balance.png', 'Figure 7. Drill-down example: month-end balance in the 12 months before a loan.', 480));

  // 10
  add(H('10. Why a scorecard and not machine learning'));
  add(P('A machine learning model would be quicker to build. The scorecard was chosen because of the purpose of this project.'));
  add(bullet(B('It shows the analytics. '), 'Each metric is measured, tested, grouped and weighted step by step; a model would do these steps out of sight.'));
  add(bullet(B('Every choice has evidence. '), 'Each kept metric has a pair-test result and a default rate per group that can be checked.'));
  add(bullet(B('Every score can be explained. '), 'Value → bucket → points → weight: a customer can be told exactly why a loan was rejected.'));
  add(bullet(B('The data is small. '), `${int(d.counts.loans)} loans, ${nBad} of them defaulted: a simple method is less likely to fit noise.`));
  add(P('Machine learning fits better in other situations:'));
  add(bullet(B('A production system at a real bank. '), 'With far more loans and metrics, a model usually predicts better.'));
  add(bullet(B('Patterns between metrics. '), 'A model can find combinations of metrics that a scorecard scores one at a time.'));
  add(bullet(B('Regular updates. '), 'A model can be retrained automatically as new loans arrive.'));
  // The logistic-regression figure comes from an earlier fit of the same metrics; it is not stored in the scorecard tables.
  add(P(`A version with weights learned by logistic regression was also tested on the same data. It was only slightly more accurate on the test loans (Gini 0.94 against ${f2(S.test.gini)}).`));

  // 11
  add(H('11. Sensitive data and data quality'));
  add(P('The data is already anonymised: it holds no names, addresses or real account numbers. Some fields are still sensitive and are handled as follows.'));
  add(table(['Sensitive field', 'Handling'], [
    ['Birth date', 'Used only to calculate age; never shown.'],
    ['Gender', 'Decoded from the birth number but never used for scoring (fairness).'],
    ['Partner account and bank', 'Used only to count income sources; never shown.'],
    ['Amounts and balances', 'Shown in the dashboard only as monthly totals for one loan.'],
    ['Risk score and grade', 'They decide approval or rejection, so access should be restricted.'],
  ]));
  add(gap());
  add(P('Data quality issues found and how they were handled:'));
  add(table(['Issue', 'Handling'], [
    ['Czech codes in the coded fields', 'Translated to English when the data is loaded.'],
    ['Dates stored as YYMMDD text', 'Converted to dates.'],
    ['No partner bank or account on cash, fee and interest transactions', 'Income sources are counted only from incoming bank transfers.'],
    ['Cards issued after the loan start date', 'Only cards issued before the loan count, so no later information enters the score.'],
    ['Accounts with a short history before the loan', 'Points are pulled toward the average (section 4.7).'],
    ['No date for when a second user joined an account', 'Joint-account status is treated as known on the loan start date; stated as a limitation.'],
    ['Running loans may still default', 'Stated as a limitation (section 12).'],
  ]));
  add(gap());

  // 12
  add(H('12. Limitations and next steps'));
  add(bullet(`Few defaulted loans: ${nBad} in total and ${S.test.n_bad} in the test set. Test results show a direction, not precise rates.`));
  add(bullet('One bank in one country in the 1990s. The method transfers to other data; the exact weights and thresholds would need to be calculated again.'));
  add(bullet('No declared income: income is estimated from money coming into the account.'));
  add(bullet('Each account has at most one loan, so repayment of earlier loans cannot be measured. Overdrafts and penalty interest are the closest signal available.'));
  add(bullet(`Joint account carries the ${rankWord} weight (${pct(jointW?.weight)}) because none of the joint-account training loans defaulted. With more data this weight could change.`));
  add(bullet('The data has no date for when a second user joined an account, so joint-account status may have changed after the loan start date. It is the only kept metric that cannot be checked point in time.'));
  add(bullet(`Most test loans are still running (only ${d.finished.find((f) => f.view_name === 'finished_A_vs_B' && f.split === 'test')?.n ?? 0} have finished), so some may still default.`));
  add(P('Next steps:'));
  add(bullet(B('Use more loans. '), 'Learn the scorecard again on the bank\'s own, larger loan history.'));
  add(bullet(B('Add credit-bureau data. '), 'It shows repayment at other banks.'));
  add(bullet(B('Re-check regularly. '), 'Every 6 to 12 months; fit the scorecard again if the default rate per grade drifts.'));
  add(bullet(B('Human review for grade C. '), 'Borderline loans get a second look before the decision.'));

  // Appendix
  add(H('Appendix A. Bucket limits and points'));
  add(table(['Metric', 'Bucket', 'Points', 'Training default rate', 'Training loans'], d.bands.map((b) => [
    METRIC[b.metric], bandText(b), Number(b.points).toFixed(1), pct(b.bad_rate), b.n_train])));
  add(gap());
  add(H('Appendix B. How to reproduce'));
  add(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(t('The code, data pipeline and dashboard are in the repository ')), new ExternalHyperlink({ link: REPO_URL, children: [new TextRun({ text: t(REPO_URL), style: 'Hyperlink' })] }), new TextRun(t('.'))] }));
  add(code('npm install'));
  add(code('node scripts/berka/run_all.js --reload    # download, load, features, fit, score, validate'));
  add(code('docker compose up -d --build              # dashboard on port 8502'));
  add(code('node scripts/berka/capture_charts.js && node scripts/berka/generate_report.js'));
  add(P('Pipeline details and every stored constant are described in scripts/berka/README.md.'));
  add(H('Appendix C. Scripts'));
  add(P('The scripts below are printed as they are in the folder scripts/berka of the repository. They run in this order.'));
  for (const [title, about, files] of SCRIPTS) {
    add(H2(title));
    add(P(about));
    for (const f of files) {
      add(P(B(`scripts/berka/${f}`)));
      add(sql(fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n').replace(/\t/g, '    ')));
    }
  }

  return body;
}

const REQUIRED = ['1. Executive summary', '2. The data', '3. Data model', '4. Method', '5. Evidence for each metric', '6. The scorecard',
  '7. Results', '8. Worked examples', '9. Dashboard', '10. Why a scorecard and not machine learning', '11. Sensitive data and data quality', '12. Limitations and next steps', 'Appendix A. Bucket limits and points', 'Appendix B. How to reproduce', 'Appendix C. Scripts'];

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
