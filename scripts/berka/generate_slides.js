// Generate docs/Stage3_Presentation.pptx from the live scorecard tables, in the visual style of
// docs/Stage2_Presentation_v2.pptx (never modified). Needs capture_charts.js images in docs/img/stage3.
// Usage: node scripts/berka/generate_slides.js
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { METRIC, CRIT, pct, f2, int, load, bandText, valueText } = require('./lib/report_data');

const ROOT = path.join(__dirname, '..', '..');
const IMG = path.join(ROOT, 'docs', 'img', 'stage3');
const OUT = path.join(ROOT, 'docs', 'Stage3_Presentation.pptx');
const DASHBOARD_URL = 'https://da-assignment.iamrithy.com/';

// v2 style
const NAVY = '1F3864', BLUE = '4472C4', PANEL = 'EEF2F9', INK = '404040', MUTED = '7F7F7F', CODEBG = 'F2F2F2';
const GREEN = '2E7D32', RED = 'C62828', ORANGE = 'EF6C00';
const FONT = 'Calibri';
const W = 13.333, H = 7.5;

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = 'Retail Credit Risk Scoring — Stage 3';

const texts = [];
const tx = (s) => { texts.push(String(s)); return String(s); };

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function image(slide, file, x, y, w, h) {
  const fp = path.join(IMG, file);
  if (!fs.existsSync(fp)) throw new Error(`missing image ${fp} — run capture_charts.js`);
  const s = pngSize(fp);
  const scale = Math.min(w / s.w, h / s.h);
  const iw = s.w * scale, ih = s.h * scale;
  slide.addImage({ path: fp, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
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
  s.addText(tx(big), { x: x + 0.2, y: y + 0.1, w: w - 0.3, h: h * 0.55, fontFace: FONT, fontSize: 26, bold: true, color: NAVY, valign: 'bottom' });
  s.addText(tx(small), { x: x + 0.2, y: y + h * 0.6, w: w - 0.3, h: h * 0.35, fontFace: FONT, fontSize: 12, color: INK, valign: 'top' });
}
const chipColor = (p) => (p >= 99.5 ? GREEN : p >= 60 ? '7CB342' : p >= 40 ? 'F9A825' : p >= 10 ? ORANGE : RED);

async function main() {
  const d = await load();
  const P = d.param;
  const S = Object.fromEntries(d.summary.map((r) => [r.split, r]));
  const ev = Object.fromEntries(d.evidence.map((e) => [e.metric, e]));
  const kept = d.evidence.filter((e) => e.verdict === 'kept');
  const nBad = d.status.filter((s) => s.status === 'B' || s.status === 'D').reduce((a, s) => a + Number(s.n), 0);
  const hist = Object.fromEntries(d.history.map((h) => [h.history_bucket, h]));
  const corr = (a, b) => { const c = d.corr.find((r) => (r.metric_a === a && r.metric_b === b) || (r.metric_a === b && r.metric_b === a)); return c ? Number(c.spearman).toFixed(2) : '< 0.5'; };
  const order = ['title', 'recap', 'changed', 'berka', 'volume', 'model', 'workflow', 'window', 'strength', 'groups', 'duplicates', 'points', 'weights', 'score', 'history', 'results', 'example', 'gradeA', 'dashboard', 'limits', 'end'];
  const slideNo = (k) => order.indexOf(k) + 1;
  const builders = {};

  builders.title = () => {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addText(tx('DATA ANALYTICS 1 — ASSIGNMENT, STAGE 3'), { x: 0.9, y: 2.0, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: 'A9C1E8', charSpacing: 2 });
    s.addText(tx('Retail Credit Risk Scoring'), { x: 0.9, y: 2.5, w: 11.5, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF' });
    s.addText(tx('An evidence-based scorecard on real bank data'), { x: 0.9, y: 3.5, w: 11.5, h: 0.6, fontFace: FONT, fontSize: 24, color: 'FFFFFF' });
    s.addShape(pptx.ShapeType.rect, { x: 0.9, y: 4.4, w: 1.2, h: 0.06, fill: { color: 'A9C1E8' }, line: { color: 'A9C1E8' } });
    s.addNotes(tx('Stage 3 answers the questions from the Stage 2 review. Main change: we moved from synthetic data to real bank data with known loan outcomes, so every metric, weight and cut-off is now proven by data instead of chosen by judgement.'));
  };

  builders.recap = () => {
    const s = content('Recap', 'Stage 2 review: seven questions, answered with data');
    table(s, ['#', 'Question raised', 'Stage 3 answer', 'Slide'], [
      ['1', 'Why these metrics? Any proof?', `Tested on ${int(d.counts.loans)} real loans; ${kept.length} of ${d.evidence.length} kept`, String(slideNo('strength'))],
      ['2', 'Why 35% payment, 25% income …?', 'Weights learned by logistic regression', String(slideNo('weights'))],
      ['3', 'Why × 5.5 + 300 (300–850)?', 'Removed — score is 0–100', String(slideNo('score'))],
      ['4', 'Short history biases on-time / delinquency', 'Averaged over months actually seen; pulled toward average when history is short', String(slideNo('history'))],
      ['5', 'Spend-to-income and balance trend overlap', `Confirmed (r = ${corr('spend_to_income', 'balance_trend')}); duplicates removed`, String(slideNo('duplicates'))],
      ['6', 'Metrics inside a criterion should have own weights', 'Every metric has its own weight', String(slideNo('weights'))],
      ['7', 'How much data? How many months?', `${int(d.counts.trans)} transactions, 6 years, 12 months per loan`, String(slideNo('volume'))],
    ], 0.6, 1.55, 12.1, [0.5, 4.2, 6.4, 1.0], { size: 14, rowH: 0.55 });
    s.addNotes(tx('These are the questions from our Stage 2 presentation. Each one has a slide; the common answer is that we now use real loan outcomes, so we can prove each choice.'));
  };

  builders.changed = () => {
    const s = content('Recap', 'What changed: from synthetic data to real bank data');
    table(s, ['', 'Stage 2', 'Stage 3'], [
      [{ text: 'Data', bold: true }, 'Synthetic customers from a generator', `${int(d.counts.loans)} real loans with known outcome`],
      [{ text: 'Metrics', bold: true }, '12, chosen by judgement', `${d.evidence.length} tested, ${kept.length} kept by evidence`],
      [{ text: 'Weights', bold: true }, '35 / 25 / 20 / 10 / 10 (judgement)', 'Learned by logistic regression'],
      [{ text: 'Points', bold: true }, '100 / 70 / 40 / 10 by rank', "From each band's real bad rate"],
      [{ text: 'Score', bold: true }, '300–850 (× 5.5 + 300)', '0–100, no scaling'],
      [{ text: 'Cut-offs', bold: true }, 'Judgement', 'Approve only where bad rate is below average'],
      [{ text: 'Proof', bold: true }, 'Not possible: no real outcome', 'Train / test split, Gini, bad rate by grade'],
    ], 0.6, 1.55, 12.1, [2.0, 5.0, 5.1], { size: 15, rowH: 0.55 });
    note(s, 'Why move: our generator created behaviour from risk levels we chose, so any check would only find our own rules again.');
    s.addNotes(tx('The key reason for the change: with synthetic data, every check is circular. Real data with real outcomes lets us test each choice.'));
  };

  builders.berka = () => {
    const s = content('1 · Data', "The Berka dataset: a real Czech bank, 1993–1998");
    panel(s, 0.6, 1.55, 5.9, 3.4, NAVY, 'What it is', [
      "PKDD'99 Discovery Challenge financial data (also on Kaggle)",
      'Real, anonymised data from one Czech bank',
      `${int(d.counts.accounts)} accounts · ${int(d.counts.clients)} clients · ${int(d.counts.trans)} transactions`,
      `${int(d.counts.loans)} loans, each with its real outcome`,
      'Loaded into PostgreSQL schema "berka", Czech codes translated to English',
    ], { size: 16 });
    panel(s, 6.8, 1.55, 5.9, 3.4, GREEN, 'Why it fixes the Stage 2 problem', [
      'Every loan has a known outcome: paid or not paid',
      'So we can measure whether a metric really predicts bad loans',
      'And check the whole scorecard on loans it has never seen',
      'Same idea as Stage 2 — account behaviour feeds a scorecard — but now provable',
    ], { size: 16 });
    s.addNotes(tx('Berka is a well-known public bank dataset. What matters for us: real transactions and real loan outcomes.'));
  };

  builders.volume = () => {
    const s = content('1 · Data', 'How much data we have');
    const tiles = [
      [`${int(d.counts.trans)}`, `transactions, ${d.counts.tmin.slice(0, 4)}–${d.counts.tmax.slice(0, 4)} (6 years)`],
      [`${int(d.counts.accounts)}`, 'accounts'],
      [`${int(d.counts.loans)}`, `loans, ${d.counts.lmin.slice(0, 4)}–${d.counts.lmax.slice(0, 4)}`],
      [`${nBad} (${pct(nBad / d.counts.loans)})`, 'loans that went bad (status B or D)'],
      ['12 months', 'of history used for each loan, before the loan date'],
      [`${Number(d.hist.mn).toFixed(1)}–${Number(d.hist.mx).toFixed(1)}`, `months of account history at loan date (median ${Number(d.hist.med).toFixed(0)})`],
    ];
    tiles.forEach(([b, sm], i) => tile(s, 0.6 + (i % 3) * 2.75, 1.55 + Math.floor(i / 3) * 1.6, 2.6, 1.45, b, sm));
    table(s, ['Status', 'Meaning', 'Loans', ''], d.status.map((r) => [r.status,
      { A: 'Finished, paid', B: 'Finished, not paid', C: 'Running, on time', D: 'Running, in debt' }[r.status], int(r.n),
      { text: r.status === 'B' || r.status === 'D' ? 'Bad' : 'Good', color: r.status === 'B' || r.status === 'D' ? RED : GREEN, bold: true }]),
    9.0, 1.55, 3.7, [0.7, 1.6, 0.7, 0.7], { size: 13, rowH: 0.45 });
    panel(s, 0.6, 4.85, 12.1, 1.05, BLUE, null, [
      `Train: earliest ${d.hist.ntr} loans (${d.hist.btr} bad) — every constant is learned here`,
      `Test: latest ${d.hist.nte} loans (${d.hist.bte} bad) — used only to check the result`,
    ], { size: 15 });
    s.addNotes(tx('Answers question 7. Six years of transactions; each loan is scored on the 12 months before it. We split by date: learn on older loans, test on newer ones, like a bank would.'));
  };

  builders.model = () => {
    const s = content('1 · Data', 'Data model: 8 source tables + a scorecard layer');
    const box = (x, y, w, label, sub, fill = NAVY) => {
      s.addShape(pptx.ShapeType.rect, { x, y, w, h: 0.75, fill: { color: fill }, line: { color: fill } });
      s.addText([{ text: tx(label), options: { bold: true, fontSize: 14, color: 'FFFFFF', breakLine: true } }, { text: tx(sub), options: { fontSize: 11, color: 'DCE6F2' } }],
        { x, y, w, h: 0.75, fontFace: FONT, align: 'center', valign: 'middle' });
    };
    // a line shape runs top-left -> bottom-right; flip it vertically for up-right / down-left directions
    const line = (x1, y1, x2, y2) => s.addShape(pptx.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, line: { color: '8C8C8C', width: 1.25 }, flipV: (x2 - x1) * (y2 - y1) < 0 });
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
    s.addText(tx('district also locates each account'), { x: 1.7, y: 5.62, w: 4.6, h: 0.3, fontFace: FONT, fontSize: 11, italic: true, color: MUTED });
    panel(s, 10.3, 1.6, 2.45, 4.0, GREEN, 'Scorecard layer', [
      'loan_features', 'metric_evidence', 'scorecard_band', 'scorecard_weight', 'loan_score', 'validation views',
    ], { size: 12 });
    note(s, 'An account has at most one loan. Gender is decoded from the birth number but never used for scoring.');
    s.addNotes(tx("Berka's own structure: clients use accounts through dispositions (owner or second user); accounts have transactions, orders and at most one loan. The green layer is everything our pipeline derives."));
  };

  builders.workflow = () => {
    const s = content('2 · Workflow', 'End-to-end workflow');
    const steps = [
      ['Load', 'Download, translate, load 8 tables', 'load_berka.js'],
      ['Features', '14 metrics per loan from the 12 months before it', '10_features.sql'],
      ['Fit', 'Select metrics, bands, points, weights, cut-offs (train)', 'fit_scorecard.js'],
      ['Score', 'Points → score 0–100 → grade', '20_score.sql'],
      ['Validate', 'Gini, bad rate per grade, train vs test', '30_validate.sql'],
      ['Dashboard', 'Streamlit, live from the tables', 'dashboard/app.py'],
    ];
    steps.forEach(([h, sub, file], i) => {
      const x = 0.6 + i * 2.05, last = i === steps.length - 1;
      s.addShape(pptx.ShapeType.rect, { x, y: 1.8, w: 1.85, h: 2.6, fill: { color: last ? GREEN : i === 2 ? NAVY : '8EA9DB' }, line: { color: 'FFFFFF' } });
      s.addText([{ text: tx(String(i + 1)), options: { fontSize: 13, breakLine: true } }, { text: tx(h), options: { fontSize: 17, bold: true, breakLine: true } }, { text: tx(sub), options: { fontSize: 12 } }],
        { x: x + 0.1, y: 1.9, w: 1.65, h: 1.9, fontFace: FONT, color: 'FFFFFF', align: 'center', valign: 'top' });
      s.addText(tx(file), { x: x + 0.05, y: 3.85, w: 1.75, h: 0.4, fontFace: 'Consolas', fontSize: 10, color: 'FFFFFF', align: 'center' });
    });
    code(s, 'npm run scorecard      # features → fit → score → validate, in one command', 0.6, 4.8, 12.1, 0.7, 15);
    panel(s, 0.6, 5.7, 12.1, 0.95, BLUE, null, ['Every step has an automated check (no future data used, weights sum to 100%, grades ordered by risk) and the whole run is repeatable: same data in, same scorecard out.'], { size: 14 });
    s.addNotes(tx('Same shape as Stage 2, but step 3 is new: the fit learns every constant from the training loans and stores it in the database.'));
  };

  builders.window = () => {
    const s = content('3 · Method', 'Point in time: only what the bank knew on the loan date');
    s.addShape(pptx.ShapeType.line, { x: 0.9, y: 2.6, w: 11.5, h: 0, line: { color: '8C8C8C', width: 2, endArrowType: 'triangle' } });
    s.addShape(pptx.ShapeType.rect, { x: 4.4, y: 2.25, w: 5.0, h: 0.7, fill: { color: BLUE }, line: { color: BLUE } });
    s.addText(tx('12-month window — all metrics come from here'), { x: 4.4, y: 2.25, w: 5.0, h: 0.7, fontFace: FONT, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s.addShape(pptx.ShapeType.line, { x: 9.4, y: 1.9, w: 0, h: 1.4, line: { color: RED, width: 3 } });
    s.addText(tx('Loan date'), { x: 8.7, y: 1.5, w: 1.4, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: RED, align: 'center' });
    s.addText(tx('Account opened'), { x: 0.9, y: 2.75, w: 2.0, h: 0.35, fontFace: FONT, fontSize: 13, color: INK });
    s.addText(tx('After the loan: never used'), { x: 9.6, y: 2.75, w: 2.8, h: 0.35, fontFace: FONT, fontSize: 13, italic: true, color: MUTED });
    panel(s, 0.6, 3.7, 5.9, 2.4, GREEN, 'Why it matters', [
      'Using later data would make the score look better than it could ever be in real use',
      'An automated check confirms no loan uses a transaction on or after its loan date',
    ], { size: 16 });
    panel(s, 6.8, 3.7, 5.9, 2.4, ORANGE, 'Leak we caught: cards', [
      'Most cards were issued after the loan',
      `Counting them made "has a card" look strong; counting only cards issued before the loan leaves ${d.card.n} card holders in training`,
      `Result: card ownership is weak (Gini ${f2(Math.abs(ev.has_card.gini_train))}) and was dropped`,
    ], { size: 15 });
    s.addNotes(tx('The single most important rule. Each metric looks only at the 12 months before the loan date, exactly what the bank could see when deciding.'));
  };

  builders.strength = () => {
    const s = content('4 · Evidence', 'Which metrics really predict bad loans?');
    image(s, 'metric_strength.png', 0.5, 1.45, 7.8, 5.2);
    panel(s, 8.6, 1.55, 4.1, 5.05, BLUE, 'How to read', [
      'Gini: 0 = coin flip, 1 = perfect separation of good and bad loans',
      'Below 0.10 → dropped as weak',
      { text: `Strongest: balance volatility (${f2(ev.balance_volatility.gini_train)})`, bold: true },
      { text: `Age ${f2(ev.age_at_loan.gini_train)}, district ${f2(ev.district_unemployment.gini_train)}, spend ÷ income ${f2(ev.spend_to_income.gini_train)} → no signal`, bold: true },
      'Grey bars above 0.10 were dropped as duplicates (slide ' + slideNo('duplicates') + ')',
    ], { size: 13 });
    note(s, 'Gini on the training loans. Gender was never a candidate (fairness).');
    s.addNotes(tx('Answers question 1. Each candidate metric is measured against real outcomes. Several Stage 2 assumptions, like age closest to 42, did not hold up and were dropped.'));
  };

  builders.groups = () => {
    const s = content('4 · Evidence', 'Real bad rate across each metric');
    image(s, 'metric_quartiles.png', 0.5, 1.4, 9.0, 5.35);
    panel(s, 9.8, 1.55, 2.9, 5.05, BLUE, 'Read it like this', [
      'Loans split into groups by the metric value, lowest → highest',
      `Balance volatility: ${pct(ev.balance_volatility.bad_rate_q1, 0)} → ${pct(ev.balance_volatility.bad_rate_q4, 0)} bad`,
      `Any overdraft: ${pct(ev.negative_balance_events.bad_rate_q2, 0)} bad vs ${pct(ev.negative_balance_events.bad_rate_q1, 0)}`,
      'Flat bars (age, district) = no signal',
    ], { size: 13 });
    s.addNotes(tx('This is the backing data for every metric: the share of loans that really went bad, per value group. A useful metric climbs or falls steadily.'));
  };

  builders.duplicates = () => {
    const s = content('4 · Evidence', 'Duplicates: the same behaviour counted twice');
    image(s, 'correlation.png', 0.4, 1.4, 7.4, 5.35);
    const dups = d.evidence.filter((e) => e.verdict === 'dropped_duplicate');
    panel(s, 8.1, 1.55, 4.6, 5.05, ORANGE, 'Rule: |r| ≥ 0.5 → keep the stronger one', [
      { text: `Spend ÷ income vs balance trend: r = ${corr('spend_to_income', 'balance_trend')}`, bold: true },
      { text: 'The overlap raised at the review is real', sub: true },
      ...dups.map((e) => {
        const twin = d.corr.filter((c) => c.metric_a === e.metric || c.metric_b === e.metric)
          .map((c) => ({ m: c.metric_a === e.metric ? c.metric_b : c.metric_a, r: Number(c.spearman) }))
          .filter((c) => ev[c.m] && ev[c.m].verdict === 'kept').sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
        return `${METRIC[e.metric]} → dropped (r = ${twin ? twin.r.toFixed(2) : '≥ 0.5'} with ${twin ? METRIC[twin.m] : 'a stronger metric'})`;
      }),
    ], { size: 13 });
    s.addNotes(tx('Answers question 5. We check every pair. When two metrics move together we keep only the stronger, so one behaviour is never scored twice.'));
  };

  builders.points = () => {
    const s = content('5 · Scorecard', "Points: from each band's real bad rate");
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
        s.addText([{ text: tx(bandText(b)), options: { fontSize: 11, breakLine: true } }, { text: tx(`${p.toFixed(0)} pts`), options: { fontSize: 15, bold: true, breakLine: true } }, { text: tx(`${pct(b.bad_rate, 0)} bad`), options: { fontSize: 10 } }],
          { x, y: y + 0.05, w: cw, h: rowH - 0.18, fontFace: FONT, color: col === 'F9A825' ? NAVY : 'FFFFFF', align: 'center', valign: 'middle' });
      });
    });
    note(s, 'Safest band = 100, riskiest = 0, from weight of evidence (share of good ÷ share of bad loans). Bands with similar risk were merged.');
    s.addNotes(tx('Points are no longer 100/70/40/10 by rank. Each band gets points from how many loans in it really went bad. The band limits are fixed, so a score does not depend on who else is scored.'));
  };

  builders.weights = () => {
    const s = content('5 · Scorecard', 'Weights learned from the data');
    image(s, 'weights.png', 0.5, 1.45, 7.4, 3.2);
    table(s, ['Criterion', 'Stage 2', 'Stage 3'], d.critw.map((c) => [CRIT[c.criterion],
      { payment: '35%', income: '25%', balance: '20% (transaction)', relationship: '10%', demographics: '10%' }[c.criterion], { text: pct(c.weight), bold: true }]),
    8.2, 1.55, 4.5, [2.0, 1.4, 1.1], { size: 13, rowH: 0.42 });
    panel(s, 0.6, 4.85, 12.1, 1.8, BLUE, 'How', [
      'Logistic regression predicts "went bad" from each kept metric\'s points (training loans)',
      'Weight = size of the regression coefficient, scaled to 100% — the score ranks loans exactly as the model does',
      'Each metric has its own weight; a criterion\'s weight is the sum of its metrics',
    ], { size: 14 });
    s.addNotes(tx('Answers questions 2 and 6. Demographics ends at 0% because age and district did not predict bad loans. Note the order: payment first, as in Stage 2 — but now measured, not chosen.'));
  };

  builders.score = () => {
    const s = content('5 · Scorecard', 'Score 0–100 and the approve line');
    code(s, 'score = Σ (weight × points)          0 = riskiest · 100 = safest', 0.6, 1.55, 12.1, 0.75, 18);
    panel(s, 0.6, 2.55, 6.3, 3.0, GREEN, 'Approve line from the data', [
      'Sort training loans by score, highest first',
      `Approve each tenth only while its real bad rate is below the average (${pct(P.portfolio_bad_rate)})`,
      'A/B/C split the approved range in thirds; D/E split the rejected range',
      { text: 'No more × 5.5 + 300: it added no information', bold: true },
    ], { size: 16 });
    table(s, ['Grade', 'Score', 'Decision'], [
      ['A', `≥ ${P.grade_A.toFixed(1)}`, { text: 'Approve', color: GREEN, bold: true }],
      ['B', `${P.grade_B.toFixed(1)} – ${P.grade_A.toFixed(1)}`, { text: 'Approve', color: GREEN, bold: true }],
      ['C', `${P.grade_C.toFixed(1)} – ${P.grade_B.toFixed(1)}`, { text: 'Approve', color: GREEN, bold: true }],
      ['D', `${P.grade_D.toFixed(1)} – ${P.grade_C.toFixed(1)}`, { text: 'Reject', color: RED, bold: true }],
      ['E', `< ${P.grade_D.toFixed(1)}`, { text: 'Reject', color: RED, bold: true }],
    ], 7.2, 2.55, 5.5, [1.2, 2.5, 1.8], { size: 16, rowH: 0.6 });
    s.addNotes(tx('Answers question 3. We removed the 300–850 scaling. The approve line is where the real bad rate stops being below average.'));
  };

  builders.history = () => {
    const s = content('5 · Scorecard', 'Short history is not rewarded');
    code(s, 'points = average + (points − average) × months ÷ (months + k)', 0.6, 1.55, 12.1, 0.75, 18);
    panel(s, 0.6, 2.55, 5.6, 2.6, BLUE, 'What it does', [
      'Few months observed → points pulled toward the average',
      'A one-month clean record cannot reach 100',
      `k chosen from 3 / 6 / 12 by best training Gini → k = ${P.shrink_k}`,
      'Money metrics are averaged over the months actually observed',
    ], { size: 16 });
    table(s, ['Account age at loan', 'Loans', 'Really went bad', 'Approved'], d.history.map((h) => [
      `${h.history_bucket} months`, h.n, pct(h.bad_rate), { text: pct(h.approval_rate), bold: true }]),
    6.5, 2.55, 6.2, [2.0, 1.2, 1.6, 1.4], { size: 15, rowH: 0.6 });
    s.addText(tx(`New accounts are approved ${pct(hist['<6'].approval_rate, 0)} of the time vs ${pct(hist['12+'].approval_rate, 0)} — and they really are riskier (${pct(hist['<6'].bad_rate, 0)} vs ${pct(hist['12+'].bad_rate, 0)} bad).`),
      { x: 6.5, y: 5.2, w: 6.2, h: 1.2, fontFace: FONT, fontSize: 14, color: INK });
    s.addNotes(tx('Answers question 4. In Stage 2 a customer with one month of clean history could score like one with years. Now short histories are pulled toward the average.'));
  };

  builders.results = () => {
    const s = content('6 · Results', 'Results on loans the model never saw');
    image(s, 'bad_rate_by_grade.png', 0.4, 1.4, 7.0, 4.1);
    table(s, ['', 'Train', 'Test'], [
      ['Loans (bad)', `${S.train.n} (${S.train.n_bad})`, `${S.test.n} (${S.test.n_bad})`],
      [{ text: 'Gini', bold: true }, { text: f2(S.train.gini), bold: true }, { text: f2(S.test.gini), bold: true }],
      ['Approved', pct(S.train.approval_rate), pct(S.test.approval_rate)],
      ['Bad rate if approved', pct(S.train.bad_rate_approved), pct(S.test.bad_rate_approved)],
      ['Bad rate if rejected', pct(S.train.bad_rate_rejected), pct(S.test.bad_rate_rejected)],
    ], 7.7, 1.55, 5.0, [2.2, 1.4, 1.4], { size: 14, rowH: 0.5 });
    panel(s, 0.6, 5.6, 12.1, 1.05, ORANGE, null, [`Bad rate rises from A to E on both sets. Caveat: the test set has only ${S.test.n_bad} bad loans, so read test numbers as a direction, not a precise rate.`], { size: 14 });
    s.addNotes(tx('The proof: grades sort real risk on loans the model never saw. Be honest about the small test set.'));
  };

  builders.example = () => {
    const s = content('6 · Results', 'Worked example');
    const [a, e] = d.examples;
    const sa = a.score;
    s.addText(tx(`Loan ${sa.loan_id}: ${int(sa.amount)} over ${sa.duration_months} months, ${sa.loan_date}`), { x: 0.6, y: 1.45, w: 9, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: NAVY });
    table(s, ['Metric', 'Value', 'Points', 'Weight', 'Adds'], a.points.map((p) => [METRIC[p.metric], valueText(p.metric, p.raw_value), Number(p.points).toFixed(1), pct(p.weight), (Number(p.weight) * Number(p.points)).toFixed(2)]),
      0.6, 1.9, 9.0, [3.9, 1.2, 1.3, 1.3, 1.3], { size: 13, rowH: 0.4 });
    s.addShape(pptx.ShapeType.roundRect, { x: 9.9, y: 1.9, w: 2.8, h: 1.4, fill: { color: GREEN }, line: { color: GREEN }, rectRadius: 0.08 });
    s.addText([{ text: tx(`${Number(sa.score).toFixed(1)} · Grade ${sa.grade}`), options: { fontSize: 22, bold: true, breakLine: true } }, { text: tx(sa.approved ? 'Approve' : 'Reject'), options: { fontSize: 16 } }],
      { x: 9.9, y: 1.9, w: 2.8, h: 1.4, fontFace: FONT, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s.addText(tx(`Really: status ${sa.status} — ${{ A: 'paid off', B: 'not paid', C: 'running, on time', D: 'in debt' }[sa.status]}`), { x: 9.9, y: 3.4, w: 2.8, h: 0.6, fontFace: FONT, fontSize: 13, color: INK, align: 'center' });
    const se = e.score;
    panel(s, 0.6, 5.0, 12.1, 1.6, RED, `Opposite end — loan ${se.loan_id}: score ${Number(se.score).toFixed(1)}, grade ${se.grade}, ${se.approved ? 'approve' : 'reject'}`, [
      `${e.points.filter((p) => Number(p.band_points) === 0).map((p) => METRIC[p.metric]).join(', ')} all in the riskiest band. Really: status ${se.status} — ${{ A: 'paid off', B: 'not paid', C: 'running, on time', D: 'in debt' }[se.status]}.`,
    ], { size: 14 });
    s.addNotes(tx('Walk through the top loan: each metric value, its points, its weight, and the sum. Then the lowest-scored loan, which really did go bad.'));
  };

  builders.gradeA = () => {
    const s = content('6 · Results', 'What drives each grade');
    image(s, 'criteria_by_grade.png', 0.5, 1.45, 7.6, 3.4);
    panel(s, 8.4, 1.55, 4.3, 5.05, ORANGE, 'Honest reading', [
      'Almost no one in A–D has an overdraft, so grade A is decided mostly by joint account (two users)',
      `None of the ${d.bands.find((b) => b.metric === 'joint_account' && b.lower !== null)?.n_train ?? ''} joint accounts in training went bad (weight ${pct(d.weights.find((w) => w.metric === 'joint_account').weight, 0)})`,
      'The data has no date for when a second user joined, so this metric cannot be checked point in time',
      'Balance behaviour separates C from D and E',
      'Overdrafts mark out grade E',
      'With more data the joint-account weight would likely shrink',
    ], { size: 13 });
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
      'Portfolio', { text: 'grades, real bad rate per grade, score distribution', sub: true },
      'Evidence', { text: 'metric strength, groups, duplicates, weights, checks', sub: true },
      'Criteria by grade', { text: 'what drives each grade', sub: true },
      'Loan drill-down', { text: 'value → band → points → weight, the 12 months before, then the real outcome', sub: true },
    ], { size: 14 });
    s.addNotes(tx('Click the button to open the live dashboard. Show the Evidence tab, then the drill-down of the worked example.'));
  };

  builders.limits = () => {
    const s = content('8 · Limitations', 'Limitations & next steps');
    panel(s, 0.6, 1.55, 5.9, 3.6, ORANGE, 'Limitations', [
      `Few bad loans: ${nBad} in total, ${S.test.n_bad} in the test set`,
      'One Czech bank in the 1990s — the method transfers, the exact numbers may not',
      'No declared income: estimated from money coming in',
      'One loan per account: earlier repayment cannot be measured; overdraft is the closest signal',
      'Joint account: driven by a group with no bad loans, and has no date for when the second user joined',
    ], { size: 16 });
    panel(s, 6.8, 1.55, 5.9, 3.6, GREEN, 'Next steps', [
      'Re-learn the scorecard on the bank\'s own, larger loan history',
      'Add credit-bureau data for repayment at other banks',
      'Re-check every 6–12 months; refit if the bad rate per grade drifts',
      'Grade C: consider human review before deciding',
    ], { size: 16 });
    s.addNotes(tx('Be upfront: small number of bad loans, old data from one bank. The pipeline is built so the same steps can be re-run on new data.'));
  };

  builders.end = () => {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addText(tx('The End'), { x: 0.9, y: 2.8, w: 11, h: 0.9, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF' });
    s.addText(tx('Thank you'), { x: 0.9, y: 3.7, w: 11, h: 0.5, fontFace: FONT, fontSize: 20, color: 'FFFFFF' });
  };

  for (const k of order) builders[k]();
  const bad = texts.filter((s) => /undefined|NaN|\[object/.test(s));
  if (bad.length) throw new Error(`bad text: ${bad.slice(0, 3).join(' | ')}`);
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
