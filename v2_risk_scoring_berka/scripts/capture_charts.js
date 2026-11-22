// Capture dashboard charts as PNG for the report and slides (docs/img/charts/).
// Needs the dashboard running (docker compose up -d) and Microsoft Edge installed.
// Usage: node v2_risk_scoring_berka/scripts/capture_charts.js [url]   (default http://localhost:8502)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const URL = process.argv[2] || 'http://localhost:8502';
const OUT = path.join(__dirname, '..', '..', 'docs', 'img', 'charts');

// [tab, index of the visible chart in that tab, file name]
const SHOTS = [
  ['Portfolio', 0, 'loans_per_grade.png'],
  ['Portfolio', 1, 'bad_rate_by_grade.png'],
  ['Portfolio', 2, 'score_distribution.png'],
  ['Evidence', 0, 'metric_strength.png'],
  ['Evidence', 1, 'metric_quartiles.png'],
  ['Evidence', 2, 'correlation.png'],
  ['Evidence', 3, 'weights.png'],
  ['Criteria by grade', 0, 'criteria_by_grade.png'],
  ['Loan drill-down', 0, 'example_money.png'],
  ['Loan drill-down', 1, 'example_balance.png'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 980, height: 1000 }, deviceScaleFactor: 2.5 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Loans scored', { timeout: 90000 });
  let current = null;
  for (const [tab, idx, file] of SHOTS) {
    if (tab !== current) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(4000);
      current = tab;
    }
    const chart = page.locator('[data-testid="stVegaLiteChart"]:visible, .stVegaLiteChart:visible').nth(idx);
    await chart.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await chart.screenshot({ path: path.join(OUT, file) });
    console.log('saved', file);
  }
  await browser.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
