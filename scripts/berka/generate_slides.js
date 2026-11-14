// Generate docs/Final_Presentation.pptx (previous-version context + new-version evidence in one deck) from the live
// scorecard tables, in the visual style of the previous deck
// (archive/previous_version/presentations/Previous_Presentation.pptx). Needs capture_charts.js images in docs/img/charts.
// Usage: node scripts/berka/generate_slides.js [output.pptx]
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { ROOT, DASHBOARD_URL, METRIC, CRIT, VERDICT, STATUS, pct, f2, int, chart, checkText, load, pairText, bandText, valueText } = require('./lib/report_data');

const ICONS = path.join(ROOT, 'docs', 'img', 'icons');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'docs', 'Final_Presentation.pptx');

// v2 style
const NAVY = '1F3864', BLUE = '4472C4', PANEL = 'EEF2F9', INK = '404040', MUTED = '7F7F7F', CODEBG = 'F2F2F2';
const GREEN = '2E7D32', RED = 'C62828', ORANGE = 'EF6C00';
const FONT = 'Calibri';
const H = 7.5;

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = 'Retail Credit Risk Scoring';

const texts = [];
const tx = (s) => { texts.push(String(s)); return String(s); };

// Plain-language description of every candidate metric (12 months before the loan start date).
const MEANING = {
  penalty_events: 'Times the bank charged penalty interest',
  negative_balance_events: 'Transactions that left the balance below zero',
  dti: 'Monthly loan payment ÷ average money in per month',
  income_sources: 'Different accounts sending money in',
  monthly_inflow: 'Average money coming in per month',
  balance_volatility: 'How much the month-end balance swings',
  min_balance: 'Lowest balance reached',
  balance_trend: 'Whether the balance is growing or shrinking',
  spend_to_income: 'Money going out ÷ money coming in',
  history_months: 'Months since the account was opened',
  has_card: 'Owner had a card issued before the loan',
  joint_account: 'A second person may use the account',
  age_at_loan: "Owner's age when the loan started",
  district_unemployment: "Unemployment rate in the owner's district",
};
// Criterion slides: the question, why it signals risk, how it is measured.
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

function image(slide, file, x, y, w, h) {
  const c = chart(file);
  const scale = Math.min(w / c.w, h / c.h);
  const iw = c.w * scale, ih = c.h * scale;
  slide.addImage({ path: c.path, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
}

function content(section, title) {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText(tx(section.toUpperCase()), { x: 0.6, y: 0.33, w: 9, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: BLUE, charSpacing: 2 });
  s.addText(tx(title), { x: 0.6, y: 0.62, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: NAVY });
  return s;
}
function panel(s, x, y, w, h, accent, heading, bullets, opts = {}) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: PANEL }, line: { color: PANEL } });
  if (accent) s.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h, fill: { color: accent }, line: { color: accent } });
  let top = y + 0.12;
  if (heading) { s.addText(tx(heading), { x: x + 0.22, y: top, w: w - 0.35, h: 0.4, fontFace: FONT, fontSize: 17, bold: true, color: NAVY }); top += 0.45; }
  if (bullets && bullets.length) {
    s.addText(bullets.map((b) => (typeof b === 'string'
      ? { text: tx(b), options: { bullet: true, breakLine: true } }
      : { text: tx(b.text), options: { bullet: b.sub ? { indent: 18 } : true, indentLevel: b.sub ? 1 : 0, fontSize: b.sub ? 12 : undefined, color: b.sub ? MUTED : undefined, bold: b.bold, breakLine: true } })),
    { x: x + 0.22, y: top, w: w - 0.35, h: y + h - top - 0.1, fontFace: FONT, fontSize: opts.size || 14, color: INK, valign: 'top', paraSpaceAfter: 4 });
  }
}
function note(s, text) {
  s.addText(tx(text), { x: 0.6, y: 6.9, w: 12.1, h: 0.35, fontFace: FONT, fontSize: 11, italic: true, color: MUTED });
}
function table(s, header, rows, x, y, w, colW, opts = {}) {
  const fs_ = opts.size || 12;
  const head = header.map((h) => ({ text: tx(h), options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: fs_ } }));
  const body = rows.map((r, i) => r.map((c) => (typeof c === 'object' && c !== null
    ? { text: tx(c.text), options: { fontSize: fs_, fill: { color: c.fill || (i % 2 ? 'FFFFFF' : 'F7F9FC') }, color: c.color || INK, bold: c.bold } }
    : { text: tx(c), options: { fontSize: fs_, fill: { color: i % 2 ? 'FFFFFF' : 'F7F9FC' }, color: INK } })));
  s.addTable([head, ...body], { x, y, w, colW, fontFace: FONT, border: { type: 'solid', pt: 0.5, color: 'D9D9D9' }, valign: 'middle', margin: 0.05, rowH: opts.rowH || 0.32 });
}
function code(s, text, x, y, w, h, size = 16) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: CODEBG }, line: { color: CODEBG } });
  s.addText(tx(text), { x: x + 0.25, y, w: w - 0.5, h, fontFace: 'Consolas', fontSize: size, color: INK, valign: 'middle' });
}
function tile(s, x, y, w, h, big, small) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: PANEL }, line: { color: PANEL } });
  s.addText(tx(big), { x: x + 0.2, y: y + 0.1, w: w - 0.3, h: h * 0.5, fontFace: FONT, fontSize: 26, bold: true, color: NAVY, valign: 'bottom' });
  s.addText(tx(small), { x: x + 0.2, y: y + h * 0.55, w: w - 0.3, h: h * 0.42, fontFace: FONT, fontSize: 12, color: INK, valign: 'top' });
}
// A white line icon (docs/img/icons, from make_icons.js) on a coloured circle.
function icon(s, name, x, y, size, color) {
  const fp = path.join(ICONS, `${name}.png`);
  if (!fs.existsSync(fp)) throw new Error(`missing icon ${fp} — run make_icons.js`);
  s.addShape(pptx.ShapeType.ellipse, { x, y, w: size, h: size, fill: { color }, line: { color } });
  const pad = size * 0.22;
  s.addImage({ path: fp, x: x + pad, y: y + pad, w: size - 2 * pad, h: size - 2 * pad });
}
// Cards side by side: icon on top, a heading and one short explanation. items = [icon, heading, text, colour]
function iconCards(s, items, x, y, w, h, opts = {}) {
  const gap = 0.2, cw = (w - gap * (items.length - 1)) / items.length, d = opts.icon || 0.9;
  items.forEach(([name, head, text, color], i) => {
    const cx = x + i * (cw + gap);
    s.addShape(pptx.ShapeType.rect, { x: cx, y, w: cw, h, fill: { color: PANEL }, line: { color: PANEL } });
    icon(s, name, cx + (cw - d) / 2, y + 0.3, d, color || BLUE);
    s.addText(tx(head), { x: cx + 0.2, y: y + 0.4 + d, w: cw - 0.4, h: 0.5, fontFace: FONT, fontSize: opts.head || 18, bold: true, color: NAVY, align: 'center', valign: 'middle' });
    s.addText(tx(text), { x: cx + 0.25, y: y + 1.0 + d, w: cw - 0.5, h: h - d - 1.1, fontFace: FONT, fontSize: opts.size || 14, color: INK, align: 'center', valign: 'top' });
  });
}
// A list as rows: icon on the left, a heading and one line of explanation. items = [icon, heading, text]
function iconRows(s, items, x, y, w, rowH, color, opts = {}) {
  const d = Math.min(0.62, rowH - 0.2);
  items.forEach(([name, head, text], i) => {
    const ry = y + i * rowH;
    icon(s, name, x, ry + (rowH - d) / 2, d, color);
    s.addText([{ text: tx(head), options: { bold: true, fontSize: opts.head || 16, color: NAVY, breakLine: true } }, { text: tx(text), options: { fontSize: opts.size || 14, color: INK } }],
      { x: x + d + 0.2, y: ry, w: w - d - 0.2, h: rowH, fontFace: FONT, valign: 'middle' });
  });
}
const chipColor = (p) => (p >= 99.5 ? GREEN : p >= 60 ? '7CB342' : p >= 40 ? 'F9A825' : p >= 10 ? ORANGE : RED);

async function main() {
  const d = await load();
  const P = d.param;
  const { S, ev, kept, nBad, histBy: hist } = d;
  const W_ = Object.fromEntries(d.weights.map((w) => [w.metric, Number(w.weight)]));
  const CW = Object.fromEntries(d.critw.map((c) => [c.criterion, Number(c.weight)]));
  const corr = (a, b) => pairText(d, a, b);
  const twinOf = (m) => d.corr.filter((c) => c.metric_a === m || c.metric_b === m)
    .map((c) => ({ m: c.metric_a === m ? c.metric_b : c.metric_a, r: Number(c.spearman) }))
    .filter((c) => ev[c.m] && ev[c.m].verdict === 'kept').sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  const verdictText = (e) => (e.verdict === 'dropped_duplicate' && twinOf(e.metric)
    ? `Dropped — duplicate of ${METRIC[twinOf(e.metric).m].toLowerCase()} (r = ${twinOf(e.metric).r.toFixed(2)})`
    : VERDICT[e.verdict]);
  const share = (g) => (Number(g) + 1) / 2;   // Gini -> share of (repaid, defaulted) pairs ranked correctly
  const nDisponent = Number(d.counts.dispositions) - Number(d.counts.accounts);

  // Small bar chart of the real default rate per value group, drawn as shapes so it stays sharp at any size.
  const TWO_GROUPS = { has_card: ['No', 'Yes'], joint_account: ['No', 'Yes'], negative_balance_events: ['None', 'Any'],
    penalty_events: ['None', 'Any'], income_sources: ['None', '1+'] };
  function miniBars(s, e, x, y, w, h, sub) {
    const vals = [e.bad_rate_q1, e.bad_rate_q2, e.bad_rate_q3, e.bad_rate_q4].filter((v) => v !== null && v !== undefined).map(Number);
    const labels = TWO_GROUPS[e.metric] || ['Q1', 'Q2', 'Q3', 'Q4'];
    const color = e.verdict === 'kept' ? BLUE : 'A6A6A6';
    const max = Math.max(...vals) > 0.4 ? 1 : 0.4;
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText(tx(METRIC[e.metric]), { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: 0.4, fontFace: FONT, fontSize: sub ? 14 : 16, bold: true, color: NAVY });
    if (sub) s.addText(tx(sub), { x: x + 0.15, y: y + 0.45, w: w - 0.3, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTED });
    const top = y + (sub ? 1.15 : 0.9), bottom = y + h - 0.45, ph = bottom - top;
    const px = x + 0.3, pw = w - 0.6, slot = pw / vals.length, bw = slot * 0.62;
    s.addText(tx(`scale 0–${max * 100}%`), { x: x + w - 1.3, y: y + h - 0.2, w: 1.25, h: 0.18, fontFace: FONT, fontSize: 8, color: MUTED, align: 'right' });
    vals.forEach((v, i) => {
      const bh = Math.max((v / max) * ph, 0.02), bx = px + i * slot + (slot - bw) / 2;
      s.addShape(pptx.ShapeType.rect, { x: bx, y: bottom - bh, w: bw, h: bh, fill: { color }, line: { color } });
      s.addText(pct(v, 0), { x: bx - 0.2, y: bottom - bh - 0.3, w: bw + 0.4, h: 0.28, fontFace: FONT, fontSize: 13, bold: true, color: INK, align: 'center', valign: 'bottom' });
      s.addText(tx(labels[i]), { x: bx - 0.2, y: bottom + 0.03, w: bw + 0.4, h: 0.26, fontFace: FONT, fontSize: 12, color: MUTED, align: 'center' });
    });
    s.addShape(pptx.ShapeType.line, { x: px, y: bottom, w: pw, h: 0, line: { color: 'BFBFBF', width: 1 } });
  }
  const GROUPS_NOTE = 'Loans are split into four equal groups by the metric value (Q1 lowest → Q4 highest). Bar = share of the group that defaulted (training loans). Yes/no metrics show two groups.';

  const order = ['title', 'problem', 'whySwitch', 'approach', 'changed', 'recap', 'terms', 'berka', 'volume', 'tables', 'model', 'workflow', 'window', 'method',
    'candidates', 'gini', 'strength', 'groupsKept', 'groupsDropped', 'duplicates', 'critPayment', 'critIncome', 'critBalance', 'critRelationship',
    'points', 'weights', 'score', 'history', 'results', 'example', 'gradeA', 'dashboard', 'quality', 'limits', 'end'];
  const slideNo = (k) => order.indexOf(k) + 1;
  const builders = {};

  builders.title = () => {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addText(tx('DATA ANALYTICS 1 — ASSIGNMENT'), { x: 0.9, y: 2.0, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: 'A9C1E8', charSpacing: 2 });
    s.addText(tx('Retail Credit Risk Scoring'), { x: 0.9, y: 2.5, w: 11.5, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF' });
    s.addText(tx('An evidence-based scorecard on real bank data'), { x: 0.9, y: 3.5, w: 11.5, h: 0.6, fontFace: FONT, fontSize: 24, color: 'FFFFFF' });
    s.addShape(pptx.ShapeType.rect, { x: 0.9, y: 4.4, w: 1.2, h: 0.06, fill: { color: 'A9C1E8' }, line: { color: 'A9C1E8' } });
    s.addNotes(tx('This version brings together the previous design and the new evidence: the same scorecard idea, now built and proven on real bank data with known loan outcomes.'));
  };

  builders.problem = () => {
    const s = content('Recap', 'Business problem & goal');
    panel(s, 0.6, 1.55, 5.0, 5.0, RED, 'Problem');
    iconRows(s, [
      ['alert', 'Defaults cost money', 'Every loan that is not repaid is a loss for the bank'],
      ['clock', 'Manual review is slow', 'A loan officer checks each application by hand'],
      ['users', 'Decisions are inconsistent', 'Two officers can decide differently on the same customer'],
    ], 0.9, 2.2, 4.5, 1.35, RED);
    panel(s, 5.9, 1.55, 6.8, 5.0, GREEN, 'Goal');
    iconRows(s, [
      ['target', 'Score every applicant the same way', 'A score from 0 to 100 and a risk grade A–E'],
      ['bank', 'Use only the data the bank already has', 'Accounts and transactions — no credit bureau'],
      ['refresh', 'Score in two ways', 'When an application arrives, and as a batch scan to make loan offers'],
      ['eye', 'Keep it explainable', 'Every metric, point and weight is visible'],
      ['check', 'Prove every choice', 'Each one is tested on real loan outcomes'],
    ], 6.2, 2.1, 6.3, 0.86, GREEN);
    s.addNotes(tx('Same business problem as the previous version. The new version adds the last goal: every choice is now backed by real loan outcomes.'));
  };

  builders.whySwitch = () => {
    const s = content('Recap', 'Why we switched to a new dataset');
    iconCards(s, [
      ['database', 'Previous data', 'UCI German Credit (1,000 loans with coded applicant fields), plus accounts and transactions we generated ourselves for 800 customers', MUTED],
      ['alert', 'What was lacking', 'The behaviour was generated from a risk level we assigned, so metrics, weights and thresholds could only be argued, not proven', RED],
      ['check', 'Now: a real dataset', `Berka: ${int(d.counts.trans)} real transactions and ${int(d.counts.loans)} real loans with known outcomes, so every choice can be tested`, GREEN],
    ], 0.6, 1.6, 12.1, 4.7, { icon: 1.2, head: 22, size: 17 });
    s.addNotes(tx('The gap in the previous version: the behaviour data was generated by us, so any test was circular. Berka has both real behaviour and real outcomes for the same accounts.'));
  };

  builders.approach = () => {
    const s = content('Recap', 'Our approach in one line');
    s.addText(tx('Analyse past loans to prove which metrics matter, then use those metrics to score a loan.'),
      { x: 0.6, y: 1.45, w: 12.1, h: 0.8, fontFace: FONT, fontSize: 24, bold: true, color: BLUE, valign: 'middle' });
    const cards = [
      ['search', '1 · Prove', 'Past loans, outcome known', `On the ${S.train.n} earliest loans we know who repaid and who defaulted. We test every metric against that outcome and keep only the ones that matter.`, BLUE],
      ['calc', '2 · Score', 'Any loan', 'The proven metrics give points, the points give a score from 0 to 100, and the score gives a grade and a decision.', NAVY],
      ['flask', '3 · Check', 'Newer loans, not used before', `We score the ${S.test.n} latest loans and compare with what really happened: ${pct(S.test.bad_rate_approved)} of the approved loans defaulted, ${pct(S.test.bad_rate_rejected, 0)} of the rejected.`, GREEN],
    ];
    cards.forEach(([ic, head, sub, text, color], i) => {
      const x = 0.6 + i * 4.1, y = 2.45, w = 3.7, h = 3.6;
      s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: PANEL }, line: { color: PANEL } });
      s.addShape(pptx.ShapeType.rect, { x, y, w, h: 0.07, fill: { color }, line: { color } });
      icon(s, ic, x + 0.25, y + 0.3, 0.9, color);
      s.addText([{ text: tx(head), options: { fontSize: 22, bold: true, color: NAVY, breakLine: true } }, { text: tx(sub), options: { fontSize: 12, color: MUTED } }],
        { x: x + 1.3, y: y + 0.3, w: w - 1.4, h: 0.9, fontFace: FONT, valign: 'middle' });
      s.addText(tx(text), { x: x + 0.25, y: y + 1.45, w: w - 0.5, h: 2.0, fontFace: FONT, fontSize: 16, color: INK, valign: 'top' });
      if (i < 2) s.addText('→', { x: x + w, y: y + 1.4, w: 0.4, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: MUTED, align: 'center', valign: 'middle' });
    });
    s.addText(tx('Same scorecard idea as the previous version. The real dataset closes its gap: the metrics can now be proven on real loan outcomes.'),
      { x: 0.6, y: 6.25, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 15, italic: true, color: NAVY });
    s.addNotes(tx('The whole project in one line. We build on the previous version: the same scorecard of criteria, metrics, points and weights. What is new is the proof. Because the new dataset has real loan outcomes, we can analyse past loans to show which metrics matter, and then check the scorecard on loans it has not seen.'));
  };
  builders.changed = () => {
    const s = content('Recap', 'What changed from the previous version to the new version');
    table(s, ['', 'Previous version', 'New version'], [
      [{ text: 'Data', bold: true }, 'UCI German Credit + generated customers', `Berka: ${int(d.counts.loans)} real loans with known outcome`],
      [{ text: 'Metrics', bold: true }, '12, chosen by judgement', `${d.evidence.length} tested, ${kept.length} kept by evidence`],
      [{ text: 'Weights', bold: true }, '35 / 25 / 20 / 10 / 10 (judgement)', 'Learned by logistic regression, per metric'],
      [{ text: 'Points', bold: true }, '100 / 70 / 40 / 10 by rank', "From each bucket's real default rate"],
      [{ text: 'Thresholds', bold: true }, 'Judgement', 'Approve only where the default rate is below average'],
      [{ text: 'Proof', bold: true }, 'Not possible: no real outcome', 'Train / test split, Gini, default rate by grade'],
    ], 0.6, 1.55, 12.1, [2.0, 5.0, 5.1], { size: 15, rowH: 0.6 });
    s.addNotes(tx('One row per part of the scorecard. The structure is the same as the previous version; each part is now learned from and checked against real outcomes.'));
  };

  builders.recap = () => {
    const s = content('Recap', 'Questions from the previous review, answered with data');
    const wb = W_.balance_volatility, wt = W_.balance_trend, wd = W_.dti, wi = W_.income_sources;
    table(s, ['#', 'Question raised', 'Answer', 'Slide'], [
      ['1', 'Why these metrics? Any proof?', `Tested on ${int(d.counts.loans)} real loans; ${kept.length} of ${d.evidence.length} kept`, String(slideNo('strength'))],
      ['2', 'Why 35% payment, 25% income …?', 'Weights learned by logistic regression', String(slideNo('weights'))],
      ['3', 'Short history biases on-time / delinquency', 'Averaged over months actually seen; pulled toward average when history is short', String(slideNo('history'))],
      ['4', 'Spend-to-income and balance trend overlap', 'Duplicate metrics removed', String(slideNo('duplicates'))],
      ['5', 'Metrics inside a criterion should have own weights',
        `Not all metrics are equal, so each has its own weight — e.g. balance behaviour: volatility ${pct(wb)} vs trend ${pct(wt)}; income: loan payment ÷ income ${pct(wd)} vs income sources ${pct(wi)}`, String(slideNo('weights'))],
      ['6', 'How much data? How many months?', `${int(d.counts.trans)} transactions over 6 years; each loan scored on the 12 months before it`, String(slideNo('volume'))],
    ], 0.6, 1.55, 12.1, [0.5, 4.0, 6.6, 1.0], { size: 14, rowH: 0.7 });
    s.addNotes(tx('These are the questions from our previous presentation. Each has a slide; the common answer is that we now use real loan outcomes, so we can prove each choice.'));
  };

  builders.terms = () => {
    const s = content('Recap', 'Key terms used in this presentation');
    table(s, ['Term', 'Meaning'], [
      [{ text: 'Loan start date', bold: true }, 'The date the loan was granted. Only data from before this date is used to score the loan.'],
      [{ text: 'Defaulted loan', bold: true }, `A loan that was not repaid (status B) or is behind on payments (status D) — ${nBad} of ${int(d.counts.loans)} loans`],
      [{ text: 'Default rate', bold: true }, 'The share of loans in a group that defaulted, e.g. 10% = 1 in 10 loans'],
      [{ text: 'Overdraft', bold: true }, 'The account spends more than it holds, so the balance drops below zero (e.g. −2,000)'],
      [{ text: 'Criterion', bold: true }, 'A group of related metrics, e.g. Balance behaviour. There are 5 criteria.'],
      [{ text: 'Metric', bold: true }, 'One number measured for each loan, e.g. balance volatility'],
      [{ text: 'Bucket → points', bold: true }, 'A value range of a metric gets 0–100 points; 100 = the bucket with the lowest default rate'],
      [{ text: 'Weight', bold: true }, 'How much a metric counts in the score; learned from the data, all weights add up to 100%'],
      [{ text: 'Gini', bold: true }, `How well a metric or the score separates repaid from defaulted loans: 0 = coin flip, 1 = perfect (slide ${slideNo('gini')})`],
      [{ text: 'Train / test', bold: true }, 'The older 70% of loans build the scorecard; the newer 30% are kept back to check it'],
    ], 0.6, 1.45, 12.1, [2.4, 9.7], { size: 14, rowH: 0.48 });
    s.addNotes(tx('A short glossary so the rest of the slides read easily. "Defaulted" covers both loans that ended unpaid and running loans already behind on payments.'));
  };

  builders.berka = () => {
    const s = content('1 · Data', 'The Berka dataset: a real Czech bank, 1993–1998');
    iconCards(s, [
      ['bank', 'Real bank data', 'Anonymised data from one Czech bank, published for the PKDD 1999 Discovery Challenge', NAVY],
      ['table', 'Six years of activity', `${int(d.counts.accounts)} accounts and ${int(d.counts.trans)} transactions over 6 years`, BLUE],
      ['check', 'Known loan outcomes', `${int(d.counts.loans)} loans, each marked repaid or defaulted, so every metric can be tested`, GREEN],
    ], 0.6, 1.6, 12.1, 4.5, { icon: 1.2, head: 22, size: 17 });
    note(s, 'Loaded into PostgreSQL schema "berka", with the Czech codes translated to English.');
    s.addNotes(tx('Berka is a well-known public bank dataset. What matters for us: real transactions and real loan outcomes.'));
  };

  builders.volume = () => {
    const s = content('1 · Data', 'How much data we have');
    const tiles = [
      ['table', int(d.counts.trans), `transactions, ${d.counts.tmin.slice(0, 4)}–${d.counts.tmax.slice(0, 4)} (6 years)`, BLUE],
      ['bank', int(d.counts.accounts), 'accounts', BLUE],
      ['money', int(d.counts.loans), `loans, ${d.counts.lmin.slice(0, 4)}–${d.counts.lmax.slice(0, 4)}`, BLUE],
      ['alert', `${nBad} (${pct(nBad / d.counts.loans)})`, 'loans that defaulted (status B or D)', RED],
    ];
    tiles.forEach(([ic, big, small, color], i) => {
      const x = 0.6 + (i % 2) * 4.15, y = 1.55 + Math.floor(i / 2) * 1.6;
      s.addShape(pptx.ShapeType.rect, { x, y, w: 4.0, h: 1.45, fill: { color: PANEL }, line: { color: PANEL } });
      icon(s, ic, x + 0.25, y + 0.3, 0.85, color);
      s.addText([{ text: tx(big), options: { fontSize: 26, bold: true, color: NAVY, breakLine: true } }, { text: tx(small), options: { fontSize: 13, color: INK } }],
        { x: x + 1.3, y, w: 2.6, h: 1.45, fontFace: FONT, valign: 'middle' });
    });
    table(s, ['Status', 'Meaning', 'Loans', ''], d.status.map((r) => [r.status,
      { A: 'Finished, paid', B: 'Finished, not paid', C: 'Running, on time', D: 'Running, behind' }[r.status], int(r.n),
      { text: r.is_bad ? 'Defaulted' : 'Repaid / on time', color: r.is_bad ? RED : GREEN, bold: true }]),
    8.95, 1.55, 3.75, [0.6, 1.35, 0.6, 1.2], { size: 12, rowH: 0.61 });
    panel(s, 0.6, 4.9, 12.1, 1.3, BLUE, null, [
      `Train: the earliest ${S.train.n} loans (${S.train.n_bad} defaulted) — the scorecard is learned here`,
      `Test: the latest ${S.test.n} loans (${S.test.n_bad} defaulted) — kept back, used only to check the result`,
    ], { size: 16 });
    s.addNotes(tx(`Six years of transactions and ${int(d.counts.loans)} loans with a known outcome. We split the loans by date: learn on the older ones, test on the newer ones, like a bank would.`));
  };

  builders.tables = () => {
    const s = content('1 · Data', 'The 8 tables in the dataset');
    table(s, ['Table', 'Rows', 'One row is…', 'Key columns', 'Used for'], [
      ['district', int(d.counts.districts), 'a region', 'unemployment, average salary, inhabitants', 'district unemployment (dropped: no signal)'],
      ['account', int(d.counts.accounts), 'a bank account', 'open date, statement frequency, district', 'account age'],
      ['client', int(d.counts.clients), 'a person', 'birth date, gender (from the birth number), district', 'age; gender never used'],
      ['disposition', int(d.counts.dispositions), "a person's right on an account", `owner (${int(d.counts.accounts)}) or second user (${int(nDisponent)})`, 'joint account'],
      ['card', int(d.counts.cards), 'a card issued to a disposition', 'type, issue date', 'has a card (only cards issued before the loan)'],
      ['loan', int(d.counts.loans), 'a loan (at most one per account)', 'start date, amount, term, monthly payment, status', 'outcome; loan payment ÷ income'],
      ['trans', int(d.counts.trans), 'a transaction', 'date, in / out, amount, balance after, purpose, partner account', 'most metrics'],
      ['standing_order', int(d.counts.orders), 'a permanent payment order', 'recipient, amount, purpose', 'not used'],
    ], 0.6, 1.5, 12.1, [1.6, 1.1, 2.6, 3.9, 2.9], { size: 13, rowH: 0.58 });
    note(s, 'Disposition = who may use an account: every account has one owner; some also have a second user (e.g. a partner). Only the owner can take a loan.');
    s.addNotes(tx('One row per table. The transactions table is where almost every metric comes from. Disposition links people to accounts: the owner, and optionally a second user.'));
  };

  builders.model = () => {
    const s = content('1 · Data', 'Data model: the 8 source tables');
    const dx = 1.4;   // centre the diagram
    const box = (x, y, w, label, sub, fill = NAVY) => {
      s.addShape(pptx.ShapeType.rect, { x: x + dx, y, w, h: 0.75, fill: { color: fill }, line: { color: fill } });
      s.addText([{ text: tx(label), options: { bold: true, fontSize: 14, color: 'FFFFFF', breakLine: true } }, { text: tx(sub), options: { fontSize: 11, color: 'DCE6F2' } }],
        { x: x + dx, y, w, h: 0.75, fontFace: FONT, align: 'center', valign: 'middle' });
    };
    // a line shape runs top-left -> bottom-right; flip it vertically for up-right / down-left directions
    const line = (x1, y1, x2, y2) => s.addShape(pptx.ShapeType.line, { x: Math.min(x1, x2) + dx, y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, line: { color: '8C8C8C', width: 1.25 }, flipV: (x2 - x1) * (y2 - y1) < 0 });
    box(0.6, 1.6, 2.0, 'district', `${d.counts.districts} regions`);
    box(3.0, 1.6, 2.0, 'client', `${int(d.counts.clients)}`);
    box(3.0, 3.0, 2.0, 'disposition', 'owner / 2nd user');
    box(5.4, 3.0, 2.0, 'account', `${int(d.counts.accounts)}`);
    box(3.0, 4.4, 2.0, 'card', `${int(d.counts.cards)}`);
    box(7.9, 1.6, 2.0, 'loan', `${int(d.counts.loans)} · outcome`, BLUE);
    box(7.9, 3.0, 2.0, 'trans', `${int(d.counts.trans)}`);
    box(7.9, 4.4, 2.0, 'standing_order', `${int(d.counts.orders)}`);
    line(2.6, 1.97, 3.0, 1.97); line(4.0, 2.35, 4.0, 3.0); line(5.0, 3.37, 5.4, 3.37); line(4.0, 3.75, 4.0, 4.4);
    line(7.4, 3.37, 7.9, 3.37); line(7.4, 3.2, 7.9, 1.97); line(7.4, 3.55, 7.9, 4.77);
    line(1.6, 2.35, 1.6, 5.6); line(1.6, 5.6, 6.4, 5.6); line(6.4, 5.6, 6.4, 3.75);   // district -> account (routed below)
    s.addText(tx('district also locates each account'), { x: 1.7 + dx, y: 5.62, w: 4.6, h: 0.3, fontFace: FONT, fontSize: 11, italic: true, color: MUTED });
    note(s, 'An account has at most one loan. Gender is decoded from the birth number but never used for scoring.');
    s.addNotes(tx('Clients use accounts through dispositions (owner or second user); accounts have transactions, orders and at most one loan.'));
  };

  builders.workflow = () => {
    const s = content('2 · Workflow', 'End-to-end workflow');
    const steps = [
      ['download', 'Load', 'Download, translate and load the 8 tables', 'load_berka.js'],
      ['bars', 'Features', `${d.evidence.length} metrics per loan from the 12 months before it`, '10_features.sql'],
      ['scale', 'Fit', `Learn the scorecard from the training loans (steps 2–5 on slide ${slideNo('method')})`, 'fit_scorecard.js'],
      ['calc', 'Score', 'Points → score 0–100 → grade', '20_score.sql'],
      ['flask', 'Validate', 'Check the result on the test loans', '30_validate.sql'],
      ['monitor', 'Dashboard', 'Streamlit, live from the tables', 'dashboard/app.py'],
    ];
    steps.forEach(([ic, h, sub, file], i) => {
      const x = 0.6 + i * 2.05, fill = i === steps.length - 1 ? GREEN : i === 2 ? NAVY : '8EA9DB';
      s.addShape(pptx.ShapeType.rect, { x, y: 1.8, w: 1.85, h: 4.3, fill: { color: fill }, line: { color: 'FFFFFF' } });
      icon(s, ic, x + 0.475, 2.1, 0.9, fill === NAVY ? BLUE : fill === GREEN ? '1B5E20' : NAVY);
      s.addText([{ text: tx(`${i + 1} · ${h}`), options: { fontSize: 18, bold: true, breakLine: true } }, { text: tx(sub), options: { fontSize: 13 } }],
        { x: x + 0.1, y: 3.2, w: 1.65, h: 2.0, fontFace: FONT, color: 'FFFFFF', align: 'center', valign: 'top', paraSpaceAfter: 6 });
      s.addText(tx(file), { x: x + 0.05, y: 5.5, w: 1.75, h: 0.4, fontFace: 'Consolas', fontSize: 10, color: 'FFFFFF', align: 'center' });
    });
    s.addNotes(tx('Six steps from raw files to the dashboard. Step 3 is the core: the fit learns every number in the scorecard from the training loans and stores it in the database.'));
  };

  builders.window = () => {
    const s = content('2 · Workflow', 'Point in time: only what the bank knew on the loan start date');
    s.addShape(pptx.ShapeType.line, { x: 0.9, y: 2.6, w: 11.5, h: 0, line: { color: '8C8C8C', width: 2, endArrowType: 'triangle' } });
    s.addShape(pptx.ShapeType.rect, { x: 4.4, y: 2.25, w: 5.0, h: 0.7, fill: { color: BLUE }, line: { color: BLUE } });
    s.addText(tx('All metrics: the 12 months before the loan'), { x: 4.4, y: 2.25, w: 5.0, h: 0.7, fontFace: FONT, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s.addShape(pptx.ShapeType.line, { x: 9.4, y: 1.9, w: 0, h: 1.4, line: { color: RED, width: 3 } });
    s.addText(tx('Loan start date'), { x: 8.5, y: 1.5, w: 1.8, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: RED, align: 'center' });
    s.addText(tx('Account opened'), { x: 0.9, y: 2.75, w: 2.0, h: 0.35, fontFace: FONT, fontSize: 13, color: INK });
    s.addText(tx('After the loan starts: never used'), { x: 9.6, y: 2.75, w: 3.2, h: 0.35, fontFace: FONT, fontSize: 13, italic: true, color: MUTED });
    iconCards(s, [
      ['calendar', 'The year before the loan', 'Every metric is measured from the transactions of the 12 months before the loan start date', BLUE],
      ['lock', 'Nothing after the loan starts', 'Later transactions are never used: the bank could not have seen them when deciding', RED],
      ['check', 'A fair test', 'Using later data would make the score look better than it could ever be in real use', GREEN],
    ], 0.6, 3.6, 12.1, 3.0, { icon: 0.8, head: 18, size: 15 });
    s.addNotes(tx('The single most important rule. Each metric looks only at the 12 months before the loan start date, exactly what the bank could see when deciding.'));
  };

  builders.method = () => {
    const s = content('2 · Workflow', 'Our method, step by step');
    const steps = [
      ['bars', 'Measure', `For every loan, calculate ${d.evidence.length} candidate metrics from the 12 months before it`, 'candidates'],
      ['search', 'Test each metric', 'Do loans with a high value default more often than loans with a low value? If not, drop the metric', 'strength'],
      ['copy', 'Remove duplicates', 'When two metrics move together, keep only the stronger one', 'duplicates'],
      ['layers', 'Give points', 'Split each metric into buckets. A bucket with fewer defaults gets more points (0–100)', 'points'],
      ['scale', 'Learn weights', 'A regression finds how much each metric matters. The weights add up to 100%', 'weights'],
      ['flask', 'Score and check', 'Score = sum of weight × points. Set the approve line, then check on loans not used so far', 'results'],
    ];
    steps.forEach(([ic, head, text, target], i) => {
      const x = 0.6 + (i % 3) * 4.1, y = 1.5 + Math.floor(i / 3) * 2.65, w = 3.9, h = 2.45;
      s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: PANEL }, line: { color: PANEL } });
      icon(s, ic, x + 0.25, y + 0.25, 0.8, i === 5 ? GREEN : BLUE);
      s.addText(tx(`${i + 1} · ${head}`), { x: x + 1.2, y: y + 0.25, w: w - 1.3, h: 0.8, fontFace: FONT, fontSize: 19, bold: true, color: NAVY, valign: 'middle' });
      s.addText(tx(text), { x: x + 0.25, y: y + 1.15, w: w - 0.5, h: 0.95, fontFace: FONT, fontSize: 14, color: INK, valign: 'top' });
      s.addText(tx(`slide ${slideNo(target)}`), { x: x + w - 1.3, y: y + h - 0.35, w: 1.2, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTED, align: 'right' });
    });
    note(s, `Steps 2–5 use only the training loans (the earliest ${S.train.n}). Step 6 checks the result on the test loans (the latest ${S.test.n}).`);
    s.addNotes(tx('The whole method on one slide. We first analyse the data: which metrics really go with default, and which repeat each other. Only then do we give points and weights, and both come from the data. The next slides follow these six steps in order.'));
  };

  builders.candidates = () => {
    const s = content('3 · Criteria & metrics', '5 criteria, 14 candidate metrics');
    const rows = [];
    for (const c of Object.keys(CRIT)) {
      d.evidence.filter((e) => e.criterion === c).forEach((e, i) => rows.push([
        i === 0 ? { text: CRIT[c], bold: true, color: NAVY } : '',
        { text: METRIC[e.metric], bold: e.verdict === 'kept' }, MEANING[e.metric],
        { text: e.verdict === 'kept' ? 'Kept' : VERDICT[e.verdict].replace('Dropped — ', 'Dropped: '), color: e.verdict === 'kept' ? GREEN : MUTED, bold: e.verdict === 'kept' },
      ]));
    }
    table(s, ['Criterion', 'Metric', 'What it measures (12 months before the loan)', 'Result'], rows, 0.6, 1.45, 12.1, [2.2, 3.4, 4.6, 1.9], { size: 12, rowH: 0.33 });
    note(s, `Gender is available but was never a candidate (fairness). Why each metric was kept or dropped: slides ${slideNo('gini')}–${slideNo('duplicates')}.`);
    s.addNotes(tx('Step 1 of the method. Every candidate metric, grouped by criterion, with what it measures in plain words. The last column is the result of steps 2 and 3 on the next slides.'));
  };

  builders.gini = () => {
    const s = content('4 · Evidence', 'What is Gini? How well loans are separated');
    // 10 loans each, ordered by score (low -> high); D = defaulted, R = repaid. 3 defaulted, 7 repaid per row.
    const rows = [
      ['Gini ≈ 0 · mixed (coin flip)', 'RDRRRDRRDR'],
      ['Gini ≈ 0.6 · mostly separated', 'DRDRRDRRRR'],
      ['Gini = 1 · perfect', 'DDDRRRRRRR'],
    ];
    rows.forEach(([label, pat], r) => {
      const y = 1.75 + r * 1.2;
      s.addText(tx(label), { x: 0.6, y, w: 6.8, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: NAVY });
      [...pat].forEach((c, i) => s.addShape(pptx.ShapeType.ellipse, { x: 0.7 + i * 0.66, y: y + 0.42, w: 0.42, h: 0.42, fill: { color: c === 'D' ? RED : GREEN }, line: { color: 'FFFFFF' } }));
    });
    s.addShape(pptx.ShapeType.line, { x: 0.7, y: 5.45, w: 6.4, h: 0, line: { color: '8C8C8C', width: 1.5, endArrowType: 'triangle' } });
    s.addText(tx('lower score  →  higher score'), { x: 0.7, y: 5.5, w: 6.4, h: 0.3, fontFace: FONT, fontSize: 12, color: MUTED, align: 'center' });
    s.addShape(pptx.ShapeType.ellipse, { x: 0.7, y: 6.0, w: 0.25, h: 0.25, fill: { color: GREEN }, line: { color: GREEN } });
    s.addText(tx('repaid'), { x: 1.0, y: 5.93, w: 1.2, h: 0.38, fontFace: FONT, fontSize: 12, color: INK });
    s.addShape(pptx.ShapeType.ellipse, { x: 2.1, y: 6.0, w: 0.25, h: 0.25, fill: { color: RED }, line: { color: RED } });
    s.addText(tx('defaulted'), { x: 2.4, y: 5.93, w: 1.5, h: 0.38, fontFace: FONT, fontSize: 12, color: INK });
    panel(s, 7.6, 1.55, 5.1, 5.1, BLUE, 'How to read it', [
      'Take one repaid and one defaulted loan at random. Does the repaid loan get the higher score?',
      'Right half of the time = coin flip (Gini 0). Right every time = Gini 1',
      { text: `Our score is right for ${pct(share(S.train.gini), 0)} of pairs on the training loans (Gini ${f2(S.train.gini)}) and ${pct(share(S.test.gini), 0)} on the test loans (Gini ${f2(S.test.gini)})`, bold: true },
      'A metric with a Gini below 0.10 is dropped as weak',
    ], { size: 16 });
    s.addNotes(tx('Gini is one number for how well a metric, or the final score, separates repaid from defaulted loans. It is the standard measure for credit scorecards. Formula: 2 × (share of pairs ranked right) − 1.'));
  };

  builders.strength = () => {
    const s = content('4 · Evidence', 'Which metrics really predict default?');
    image(s, 'metric_strength.png', 0.5, 1.45, 7.8, 5.2);
    const weak = d.evidence.filter((e) => e.verdict === 'dropped_weak').map((e) => METRIC[e.metric].toLowerCase());
    panel(s, 8.6, 1.55, 4.1, 5.05, BLUE, 'How to read', [
      'Longer bar = the metric separates repaid from defaulted loans better (Gini)',
      { text: `Strongest: balance volatility (${f2(ev.balance_volatility.gini_train)})`, bold: true },
      `Below 0.10 → dropped as weak: ${weak.join(', ')}`,
      'Grey bars above 0.10 are duplicates (slide ' + slideNo('duplicates') + ')',
    ], { size: 15 });
    note(s, 'Measured on the training loans. Gender was never a candidate (fairness).');
    s.addNotes(tx('Step 2 of the method, and the answer to question 1. Each candidate metric is measured against real outcomes. Several assumptions of the previous version, like age, did not hold up and were dropped.'));
  };

  builders.groupsKept = () => {
    const s = content('4 · Evidence', `Kept metrics: the default rate changes across the groups`);
    kept.forEach((e, i) => miniBars(s, e, 0.6 + (i % 3) * 4.1, 1.45 + Math.floor(i / 3) * 2.7, 3.9, 2.55));
    note(s, GROUPS_NOTE);
    s.addNotes(tx(`The same test without any formula: the share of loans that really defaulted, per value group. For the ${kept.length} kept metrics the default rate is clearly different between the groups. Balance volatility goes from ${pct(ev.balance_volatility.bad_rate_q1, 0)} in the most stable group to ${pct(ev.balance_volatility.bad_rate_q4, 0)} in the most volatile.`));
  };
  builders.groupsDropped = () => {
    const s = content('4 · Evidence', 'Dropped metrics: flat bars, or a repeat of a kept metric');
    const dropped = d.evidence.filter((e) => e.verdict !== 'kept');
    const why = (e) => (e.verdict === 'dropped_duplicate' && twinOf(e.metric) ? `Dropped: repeats ${METRIC[twinOf(e.metric).m].toLowerCase()}`
      : e.verdict === 'dropped_weak' ? 'Dropped: no clear difference' : VERDICT[e.verdict].replace(' — ', ': '));
    dropped.forEach((e, i) => miniBars(s, e, 0.6 + (i % 4) * 3.075, 1.45 + Math.floor(i / 4) * 2.7, 2.875, 2.55, why(e)));
    note(s, GROUPS_NOTE);
    s.addNotes(tx('The metrics we dropped. Most have flat bars: the default rate is about the same whatever the value, so the metric tells us nothing. Lowest balance and penalty interest do show a difference, but they repeat a metric we already keep, as the next slide shows.'));
  };

  builders.duplicates = () => {
    const s = content('4 · Evidence', 'Duplicates: the same behaviour counted twice');
    image(s, 'correlation.png', 0.4, 1.4, 7.4, 5.35);
    const dups = d.evidence.filter((e) => e.verdict === 'dropped_duplicate');
    panel(s, 8.1, 1.55, 4.6, 5.05, ORANGE, 'Rule: |r| ≥ 0.5 → keep the stronger one', [
      { text: `Spend ÷ income vs balance trend: r = ${corr('spend_to_income', 'balance_trend')}`, bold: true },
      { text: 'The overlap raised at the review is real', sub: true },
      ...dups.map((e) => { const t = twinOf(e.metric); return `${METRIC[e.metric]} → dropped (r = ${t ? t.r.toFixed(2) : '≥ 0.5'} with ${t ? METRIC[t.m] : 'a stronger metric'})`; }),
    ], { size: 13 });
    note(s, 'r = rank correlation: 0 = unrelated, ±1 = the two metrics move exactly together.');
    s.addNotes(tx('Step 3 of the method, and the answer to question 4. We check every pair. When two metrics move together we keep only the stronger, so one behaviour is never scored twice.'));
  };

  const metricCard = (s, x, y, w, h, m) => {
    const [q, why, how] = DETAIL[m];
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: PANEL }, line: { color: PANEL } });
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h, fill: { color: BLUE }, line: { color: BLUE } });
    const c = ev[m].criterion;
    s.addText([{ text: tx(METRIC[m]), options: { bold: true, fontSize: 18, color: NAVY, breakLine: true } },
      { text: tx(`Weight ${pct(W_[m])} of the score · ${pct(W_[m] / CW[c], 0)} of ${CRIT[c].toLowerCase()}`), options: { fontSize: 12, color: BLUE, bold: true } }],
    { x: x + 0.22, y: y + 0.1, w: w - 0.35, h: 0.75, fontFace: FONT, valign: 'top' });
    const lab = (t) => ({ text: tx(t), options: { fontSize: 12, bold: true, color: MUTED, charSpacing: 1, breakLine: true } });
    const body = (t, extra = {}) => ({ text: tx(t), options: { fontSize: 15, color: INK, breakLine: true, paraSpaceAfter: 12, ...extra } });
    s.addText([lab('QUESTION'), body(`“${q}”`, { italic: true }), lab('WHY IT SIGNALS RISK'), body(why), lab('HOW WE MEASURE IT (12 MONTHS BEFORE THE LOAN)'), body(how)],
    { x: x + 0.22, y: y + 0.9, w: w - 0.35, h: h - 2.55, fontFace: FONT, valign: 'top' });
    // Buckets as coloured tiles (safest green → riskiest orange): value range, points, real default rate.
    const bands = d.bands.filter((b) => b.metric === m);
    const rank = [...bands].sort((p, q2) => Number(q2.points) - Number(p.points));
    const palette = { 1: [GREEN], 2: [GREEN, ORANGE], 3: [GREEN, 'F9A825', ORANGE], 4: [GREEN, '7CB342', 'F9A825', ORANGE] }[bands.length] || [];
    s.addText(tx('BUCKETS — POINTS AND REAL DEFAULT RATE (TRAINING LOANS)'), { x: x + 0.22, y: y + h - 1.62, w: w - 0.35, h: 0.25, fontFace: FONT, fontSize: 12, bold: true, color: MUTED, charSpacing: 1 });
    const gap = 0.1, tw = Math.min((w - 0.44 - gap * (bands.length - 1)) / bands.length, 2.6);
    bands.forEach((bd, i) => {
      const bx = x + 0.22 + i * (tw + gap), fill = palette[rank.indexOf(bd)] || BLUE;
      s.addShape(pptx.ShapeType.rect, { x: bx, y: y + h - 1.32, w: tw, h: 1.17, fill: { color: fill }, line: { color: 'FFFFFF' } });
      s.addText([{ text: tx(bandText(bd)), options: { fontSize: 13, breakLine: true } },
        { text: tx(`${Number(bd.points).toFixed(0)} pts`), options: { fontSize: 18, bold: true, breakLine: true } },
        { text: tx(`${pct(bd.bad_rate, 0)} defaulted`), options: { fontSize: 12 } }],
      { x: bx, y: y + h - 1.32, w: tw, h: 1.17, fontFace: FONT, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    });
  };
  const critSlide = (c, extra) => {
    const ms = d.weights.filter((w) => w.criterion === c).map((w) => w.metric);
    const s = content('3 · Criteria & metrics', `Criterion — ${CRIT[c]} (${pct(CW[c], 0)})`);
    const cards = extra ? [...ms, null] : ms;
    const w = cards.length === 1 ? 12.1 : 5.95;
    cards.forEach((m, i) => { if (m) metricCard(s, 0.6 + i * 6.15, 1.5, w, 5.1, m); else extra(s, 0.6 + i * 6.15, 1.5, w, 5.1); });
    const dropped = d.evidence.filter((e) => e.criterion === c && e.verdict !== 'kept');
    if (dropped.length) note(s, `Also tested, dropped: ${dropped.map((e) => `${METRIC[e.metric].toLowerCase()} (${verdictText(e).replace('Dropped — ', '')})`).join('; ')}.`);
    return s;
  };

  builders.critPayment = () => {
    const s = critSlide('payment');
    s.addNotes(tx('The previous version measured on-time payments and worst delinquency from earlier loans. In Berka each account has only one loan, so the closest real signal is whether the account went into overdraft before the loan.'));
  };
  builders.critIncome = () => {
    const s = critSlide('income');
    s.addNotes(tx('Two kept metrics with different weights: affordability of the payment counts more than the number of income sources. Income is estimated from money coming in; there is no declared income.'));
  };
  builders.critBalance = () => {
    const s = critSlide('balance');
    s.addNotes(tx('Balance volatility is the single strongest metric. Spend ÷ income, which overlapped with balance trend, turned out weak on its own and was dropped.'));
  };
  builders.critRelationship = () => {
    const s = critSlide('relationship', (s_, x, y, w, h) => {
      panel(s_, x, y, w, h, MUTED, `Criterion — ${CRIT.demographics} (${pct(CW.demographics || 0, 0)})`, [
        `Age: Gini ${f2(ev.age_at_loan.gini_train)} → no signal, dropped`,
        `District unemployment: Gini ${f2(ev.district_unemployment.gini_train)} → no signal, dropped`,
        'Gender: decoded from the birth number but never used (fairness)',
        { text: 'So demographics carries no weight in the final score', bold: true },
        'In the previous version age had 10% weight by judgement; the real data does not support it',
      ], { size: 15 });
    });
    s.addNotes(tx('Joint account is the surprising one: none of the joint-account training loans defaulted. It has a caveat: the data has no date for when the second user joined. Demographics had no predictive power, so it ends at zero.'));
  };

  builders.points = () => {
    const s = content('5 · Scorecard', "Points: from each bucket's real default rate");
    const byMetric = {};
    for (const b of d.bands) (byMetric[b.metric] ??= []).push(b);
    const metrics = d.weights.map((w) => w.metric);
    const rowH = 0.8;
    metrics.forEach((m, i) => {
      const y = 1.5 + i * rowH;
      s.addText([{ text: tx(METRIC[m]), options: { bold: true, fontSize: 13, color: NAVY, breakLine: true } }, { text: tx(`${CRIT[d.weights[i].criterion]} · weight ${pct(d.weights[i].weight, 0)}`), options: { fontSize: 11, color: MUTED } }],
        { x: 0.6, y, w: 3.4, h: rowH - 0.1, fontFace: FONT, valign: 'middle' });
      const bands = byMetric[m];
      const cw = Math.min(2.1, 8.6 / bands.length);
      bands.forEach((b, j) => {
        const p = Number(b.points), col = chipColor(p);
        const x = 4.1 + j * (cw + 0.08);
        s.addShape(pptx.ShapeType.roundRect, { x, y: y + 0.05, w: cw, h: rowH - 0.18, fill: { color: col }, line: { color: col }, rectRadius: 0.08 });
        s.addText([{ text: tx(bandText(b)), options: { fontSize: 11, breakLine: true } }, { text: tx(`${p.toFixed(0)} pts`), options: { fontSize: 15, bold: true, breakLine: true } }, { text: tx(`${pct(b.bad_rate, 0)} defaulted`), options: { fontSize: 10 } }],
          { x, y: y + 0.05, w: cw, h: rowH - 0.18, fontFace: FONT, color: col === 'F9A825' ? NAVY : 'FFFFFF', align: 'center', valign: 'middle' });
      });
    });
    note(s, 'Safest bucket = 100, riskiest = 0, from the share of repaid ÷ the share of defaulted loans in the bucket. Buckets with similar risk were merged.');
    s.addNotes(tx('Step 4 of the method. Points are no longer 100/70/40/10 by rank. Each bucket gets points from how many of its loans really defaulted. The bucket limits are fixed, so a score does not depend on who else is scored.'));
  };

  builders.weights = () => {
    const s = content('5 · Scorecard', 'Weights learned from the data');
    image(s, 'weights.png', 0.5, 1.45, 6.2, 2.95);
    const effect = (w) => Math.abs(Number(w.coef));
    const total = d.weights.reduce((a, w) => a + effect(w), 0);
    table(s, ['Metric', 'Effect in the model', 'Weight = effect ÷ total'], [
      ...d.weights.map((w) => [METRIC[w.metric], effect(w).toFixed(2), { text: pct(w.weight), bold: true }]),
      [{ text: 'Total', bold: true }, { text: total.toFixed(2), bold: true }, { text: '100%', bold: true }],
    ], 6.9, 1.5, 5.8, [2.9, 1.4, 1.5], { size: 12, rowH: 0.36 });
    panel(s, 0.6, 4.6, 6.1, 2.05, BLUE, 'How a weight is found', [
      'A logistic regression predicts "defaulted" from the points of the kept metrics (training loans)',
      'It gives each metric an effect: how strongly its points move the prediction',
      'Weight = effect ÷ total of all effects',
    ], { size: 13 });
    const parts = (c) => d.weights.filter((w) => w.criterion === c).map((w) => `${METRIC[w.metric].toLowerCase()} ${pct(w.weight)}`).join(' + ');
    panel(s, 6.9, 4.6, 5.8, 2.05, GREEN, 'A criterion = the sum of its metrics', [
      `${CRIT.income} ${pct(CW.income)} = ${parts('income')}`,
      `${CRIT.balance} ${pct(CW.balance)} = ${parts('balance')}`,
      `${CRIT.payment} ${pct(CW.payment)} and ${CRIT.relationship.toLowerCase()} ${pct(CW.relationship)} have one metric each; demographics 0%`,
    ], { size: 13 });
    s.addNotes(tx('Step 5, and the answer to questions 2 and 5. Nobody chose these numbers: the regression measures how much each metric matters, and a criterion is just the sum of its metrics. Demographics ends at 0% because age and district did not predict default.'));
  };

  builders.score = () => {
    const s = content('5 · Scorecard', 'Score 0–100 and the approve line');
    code(s, 'score = Σ (weight × points)          0 = riskiest · 100 = safest', 0.6, 1.55, 12.1, 0.75, 18);
    panel(s, 0.6, 2.55, 6.3, 3.0, GREEN, 'Approve line from the data', [
      'Sort training loans by score, highest first',
      `Approve each tenth only while its real default rate is below the average (${pct(P.portfolio_bad_rate)})`,
      'A/B/C split the approved range in thirds; D/E split the rejected range',
    ], { size: 16 });
    table(s, ['Grade', 'Score', 'Decision'], [
      ['A', `≥ ${P.grade_A.toFixed(1)}`, { text: 'Approve', color: GREEN, bold: true }],
      ['B', `${P.grade_B.toFixed(1)} – ${P.grade_A.toFixed(1)}`, { text: 'Approve', color: GREEN, bold: true }],
      ['C', `${P.grade_C.toFixed(1)} – ${P.grade_B.toFixed(1)}`, { text: 'Approve', color: GREEN, bold: true }],
      ['D', `${P.grade_D.toFixed(1)} – ${P.grade_C.toFixed(1)}`, { text: 'Reject', color: RED, bold: true }],
      ['E', `< ${P.grade_D.toFixed(1)}`, { text: 'Reject', color: RED, bold: true }],
    ], 7.2, 2.55, 5.5, [1.2, 2.5, 1.8], { size: 16, rowH: 0.6 });
    s.addNotes(tx('The score is the weighted sum of points, from 0 to 100. The approve line is where the real default rate stops being below average.'));
  };

  builders.history = () => {
    const s = content('5 · Scorecard', 'Short history is not rewarded');
    code(s, 'points = average + (points − average) × months ÷ (months + k)', 0.6, 1.55, 12.1, 0.75, 18);
    panel(s, 0.6, 2.55, 5.6, 2.6, BLUE, 'What it does', [
      'Few months observed → points pulled toward the average',
      'A one-month clean record cannot reach 100',
      `k chosen from 3 / 6 / 12 by best training Gini → k = ${P.shrink_k}`,
    ], { size: 16 });
    table(s, ['Account age at loan start', 'Loans', 'Default rate', 'Approved'], d.history.map((h) => [
      `${h.history_bucket} months`, h.n, pct(h.bad_rate), { text: pct(h.approval_rate), bold: true }]),
    6.5, 2.55, 6.2, [2.3, 1.1, 1.5, 1.3], { size: 15, rowH: 0.6 });
    s.addText(tx(`New accounts are approved ${pct(hist['<6'].approval_rate, 0)} of the time vs ${pct(hist['12+'].approval_rate, 0)} — and they really are riskier (${pct(hist['<6'].bad_rate, 0)} vs ${pct(hist['12+'].bad_rate, 0)} defaulted).`),
      { x: 6.5, y: 5.2, w: 6.2, h: 1.2, fontFace: FONT, fontSize: 14, color: INK });
    s.addNotes(tx('Answers question 3. In the previous version a customer with one month of clean history could score like one with years. Now short histories are pulled toward the average.'));
  };

  builders.results = () => {
    const s = content('6 · Results', 'Results on loans the model never saw');
    image(s, 'bad_rate_by_grade.png', 0.4, 1.4, 7.0, 4.1);
    table(s, ['', 'Train', 'Test'], [
      ['Loans (defaulted)', `${S.train.n} (${S.train.n_bad})`, `${S.test.n} (${S.test.n_bad})`],
      [{ text: 'Gini', bold: true }, { text: f2(S.train.gini), bold: true }, { text: f2(S.test.gini), bold: true }],
      ['Approved', pct(S.train.approval_rate), pct(S.test.approval_rate)],
      ['Default rate if approved', pct(S.train.bad_rate_approved), pct(S.test.bad_rate_approved)],
      ['Default rate if rejected', pct(S.train.bad_rate_rejected), pct(S.test.bad_rate_rejected)],
    ], 7.7, 1.55, 5.0, [2.4, 1.3, 1.3], { size: 14, rowH: 0.5 });
    panel(s, 0.6, 5.6, 12.1, 1.05, ORANGE, null, [`Default rate rises from A to E on both sets. Caveat: the test set has only ${S.test.n_bad} defaulted loans, so read test numbers as a direction, not a precise rate.`], { size: 14 });
    s.addNotes(tx('The proof: grades sort real risk on loans the model never saw. Be honest about the small test set.'));
  };

  builders.example = () => {
    const s = content('6 · Results', 'Worked example');
    const [a, e] = d.examples;
    const sa = a.score;
    s.addText(tx(`Loan ${sa.loan_id}: ${int(sa.amount)} over ${sa.duration_months} months, started ${sa.loan_date}`), { x: 0.6, y: 1.45, w: 9, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: NAVY });
    table(s, ['Metric', 'Value', 'Points', 'Weight', 'Adds'], a.points.map((p) => [METRIC[p.metric], valueText(p.metric, p.raw_value), Number(p.points).toFixed(1), pct(p.weight), (Number(p.weight) * Number(p.points)).toFixed(2)]),
      0.6, 1.9, 9.0, [3.9, 1.2, 1.3, 1.3, 1.3], { size: 13, rowH: 0.4 });
    s.addShape(pptx.ShapeType.roundRect, { x: 9.9, y: 1.9, w: 2.8, h: 1.4, fill: { color: GREEN }, line: { color: GREEN }, rectRadius: 0.08 });
    s.addText([{ text: tx(`${Number(sa.score).toFixed(1)} · Grade ${sa.grade}`), options: { fontSize: 22, bold: true, breakLine: true } }, { text: tx(sa.approved ? 'Approve' : 'Reject'), options: { fontSize: 16 } }],
      { x: 9.9, y: 1.9, w: 2.8, h: 1.4, fontFace: FONT, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s.addText(tx(`Really: status ${sa.status} — ${STATUS[sa.status].toLowerCase()}`), { x: 9.9, y: 3.4, w: 2.8, h: 0.6, fontFace: FONT, fontSize: 13, color: INK, align: 'center' });
    const se = e.score;
    panel(s, 0.6, 5.0, 12.1, 1.6, RED, `Opposite end — loan ${se.loan_id}: score ${Number(se.score).toFixed(1)}, grade ${se.grade}, ${se.approved ? 'approve' : 'reject'}`, [
      `${e.points.filter((p) => Number(p.band_points) === 0).map((p) => METRIC[p.metric]).join(', ')} all in the riskiest bucket. Really: status ${se.status} — ${STATUS[se.status].toLowerCase()}.`,
    ], { size: 14 });
    s.addNotes(tx('Walk through the top loan: each metric value, its points, its weight, and the sum. Then the lowest-scored loan, which really did default.'));
  };

  builders.gradeA = () => {
    const s = content('6 · Results', 'What drives each grade');
    image(s, 'criteria_by_grade.png', 0.5, 1.45, 7.6, 3.4);
    panel(s, 8.4, 1.55, 4.3, 5.05, ORANGE, 'How to read it', [
      'Almost no one in A–D has an overdraft, so grade A is decided mostly by joint account',
      `None of the ${d.bands.find((b) => b.metric === 'joint_account' && b.lower !== null)?.n_train ?? ''} joint accounts in training defaulted (weight ${pct(W_.joint_account, 0)})`,
      'Balance behaviour separates C from D and E; overdrafts mark out grade E',
      'Caveat: the data has no date for when the second user joined. With more data this weight would likely shrink',
    ], { size: 14 });
    panel(s, 0.6, 5.1, 7.5, 1.5, BLUE, null, ['Each cell = average criterion points (0–100) of loans in that grade. Demographics is not shown: it has no kept metric.'], { size: 13 });
    s.addNotes(tx('Pre-empt the obvious question. The data really does say joint accounts are the safest group; we state it as a limitation rather than hide it.'));
  };

  builders.dashboard = () => {
    const s = content('7 · Dashboard', 'Dashboard');
    s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.6, w: 7.6, h: 5.0, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText(tx('Live Streamlit dashboard'), { x: 0.9, y: 2.0, w: 7.0, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: NAVY, align: 'center' });
    s.addText(tx('Reads the scorecard live from our PostgreSQL database'), { x: 0.9, y: 2.55, w: 7.0, h: 0.35, fontFace: FONT, fontSize: 15, color: '595959', align: 'center' });
    // Plain shape; linkButton() adds a shape-level click link after writing (a run-level link would turn the text blue).
    s.addText(tx('Open live dashboard  →'), { x: 1.9, y: 3.3, w: 5.0, h: 1.05, shape: pptx.ShapeType.roundRect, rectRadius: 0.15, fill: { color: BLUE }, line: { color: BLUE },
      fontFace: FONT, fontSize: 24, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', objectName: 'DashboardButton' });
    s.addText(tx(DASHBOARD_URL.replace('https://', '').replace(/\/$/, '')), { x: 0.9, y: 4.5, w: 7.0, h: 0.35, fontFace: FONT, fontSize: 14, color: BLUE, align: 'center', hyperlink: { url: DASHBOARD_URL } });
    s.addText(tx(`Demo: Loan drill-down → click "A — highest score" (loan ${d.examples[0].score.loan_id}). It matches the worked example.`), { x: 0.9, y: 5.4, w: 7.0, h: 0.6, fontFace: FONT, fontSize: 13, color: INK, align: 'center' });
    panel(s, 8.5, 1.6, 4.2, 5.0, BLUE, 'What it shows', [
      'Portfolio', { text: 'grades, real default rate per grade, score distribution', sub: true },
      'Evidence', { text: 'metric strength, groups, duplicates, weights, checks', sub: true },
      'Criteria by grade', { text: 'what drives each grade', sub: true },
      'Loan drill-down', { text: 'value → bucket → points → weight, the 12 months before, then the real outcome', sub: true },
    ], { size: 14 });
    s.addNotes(tx('Click the button to open the live dashboard. Show the Evidence tab, then the drill-down of the worked example.'));
  };

  builders.quality = () => {
    const s = content('8 · Data quality', 'Sensitive data & data quality');
    table(s, ['Sensitive field', 'Handling'], [
      ['Birth date', 'Only used to compute age; never shown'],
      ['Gender', 'Decoded but never used for scoring (fairness)'],
      ['Partner account / bank', 'Only used to count income sources; never shown'],
      ['Amounts & balances', 'Shown only as monthly totals for one loan'],
      ['Risk score & grade', 'Decide approve / reject — restrict access'],
    ], 0.6, 1.55, 5.9, [2.2, 3.7], { size: 13, rowH: 0.55 });
    s.addText(tx('The data is already anonymised: no names, addresses or real account numbers.'), { x: 0.6, y: 5.05, w: 5.9, h: 0.6, fontFace: FONT, fontSize: 13, italic: true, color: MUTED });
    panel(s, 6.8, 1.55, 5.9, 4.1, ORANGE, 'Data quality issues found & handled', [
      'Czech codes (e.g. PRIJEM, SANKC. UROK) → translated to English',
      'Dates stored as YYMMDD text → converted to dates',
      'Gender hidden in the birth number (month + 50 for women) → decoded',
      'Cards issued after the loan → only earlier cards count',
      'Accounts with a short history → points pulled toward the average',
    ], { size: 15 });
    s.addNotes(tx('Same headings as the previous version: what is sensitive and how we protect it, and what was wrong with the raw data and how we fixed it.'));
  };

  builders.limits = () => {
    const s = content('8 · Limitations', 'Limitations & next steps');
    panel(s, 0.6, 1.55, 5.9, 5.1, ORANGE, 'Limitations');
    iconRows(s, [
      ['alert', 'Few defaulted loans', `${nBad} in total, ${S.test.n_bad} in the test set`],
      ['globe', 'One Czech bank in the 1990s', 'The method transfers; the exact numbers may not'],
      ['money', 'No declared income', 'Estimated from money coming into the account'],
      ['clock', 'One loan per account', 'Earlier repayment cannot be measured; overdraft is the closest signal'],
      ['users', 'Joint account', 'A group with no defaults, and no date for when the second user joined'],
    ], 0.9, 2.1, 5.4, 0.88, ORANGE);
    panel(s, 6.8, 1.55, 5.9, 5.1, GREEN, 'Next steps');
    iconRows(s, [
      ['database', 'Use more loans', "Re-learn the scorecard on the bank's own, larger loan history"],
      ['search', 'Add credit-bureau data', 'Shows repayment at other banks'],
      ['refresh', 'Re-check regularly', 'Every 6–12 months; refit if the default rate per grade drifts'],
      ['user', 'Human review for grade C', 'Borderline cases get a second look before deciding'],
    ], 7.1, 2.1, 5.4, 1.1, GREEN);
    s.addNotes(tx('Be upfront: small number of defaults, old data from one bank. The pipeline is built so the same steps can be re-run on new data.'));
  };

  builders.end = () => {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addText(tx('The End'), { x: 0.9, y: 2.8, w: 11, h: 0.9, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF' });
    s.addText(tx('Thank you'), { x: 0.9, y: 3.7, w: 11, h: 0.5, fontFace: FONT, fontSize: 20, color: 'FFFFFF' });
  };

  for (const k of order) builders[k]();
  checkText(texts, /bad rate|went bad|5\.5|300–850|\bbands?\b/i);
  const buf = await linkButton(await pptx.write({ outputType: 'nodebuffer' }), slideNo('dashboard'));
  fs.writeFileSync(OUT, buf);
  console.log(`saved ${path.relative(ROOT, OUT)} — ${order.length} slides`);
}

// Give the DashboardButton shape a click link (cNvPr/hlinkClick), reusing the URL relationship the
// URL text on the same slide already created, so the whole button is clickable and its text stays white.
async function linkButton(buffer, slideNumber) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const slidePath = `ppt/slides/slide${slideNumber}.xml`;
  const rels = await zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`).async('string');
  const rel = rels.match(new RegExp(`Id="(rId\\d+)"[^>]*Target="${DASHBOARD_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`))
    || rels.match(new RegExp(`Target="${DASHBOARD_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*Id="(rId\\d+)"`));
  if (!rel) throw new Error('dashboard URL relationship not found on the dashboard slide');
  let xml = await zip.file(slidePath).async('string');
  const before = xml;
  xml = xml.replace(/<p:cNvPr id="(\d+)" name="DashboardButton">/, `<p:cNvPr id="$1" name="DashboardButton"><a:hlinkClick r:id="${rel[1]}"/>`);
  if (xml === before) throw new Error('DashboardButton shape not found');
  zip.file(slidePath, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
