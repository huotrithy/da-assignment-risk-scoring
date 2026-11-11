# Stage 3 pipeline — evidence-based scorecard on real bank data (Berka)

Stage 2 scored synthetic customers with judgement-based metrics and weights. Stage 3 moves to
the **Berka / PKDD'99 Czech bank dataset** (real accounts, transactions and loans with known
outcomes, 1993–1998), so every metric, band, weight and cut-off is learned from — and checked
against — what actually happened to each loan.

Source: `http://lisp.vse.cz/pkdd99/DATA/data_berka.zip` (same data as
kaggle.com/datasets/marceloventura/the-berka-dataset). Downloaded to `data/berka/` (git-ignored).

## Run

```bash
npm install
node scripts/berka/run_all.js --reload   # first time: download + load raw data (~1 min), then everything below
npm run scorecard                        # features -> fit -> score -> validate
npm test                                 # unit tests for the parsing and scorecard maths
```

## Steps

| Step | File | Output |
|---|---|---|
| Load | `load_berka.js`, `00_schema.sql` | schema `berka`: district, account, client, disposition, card, loan, trans, standing_order (Czech codes translated) |
| Features | `10_features.sql` | `loan_features`: one row per loan, from the **12 months before the loan date only** |
| Fit | `fit_scorecard.js`, `01_constants_schema.sql`, `lib/scorecard.js` | evidence, bands, points, weights, cut-offs (train loans only) |
| Score | `20_score.sql` | `loan_metric_points`, `loan_score` |
| Validate | `30_validate.sql` | views `validation_summary`, `validation_by_grade`, `validation_finished`, `validation_history` |
| Checks | `checks/*.sql` | every `*_ok` column must be `true` |

**Outcome:** bad = loan status B (finished, unpaid) or D (running, in debt): 76 of 682 loans (11.1%).
**Split:** earliest 70% of loans by date = train (477), latest 30% = test (205).

## What the fit learns (and where it is stored)

| Table | Meaning |
|---|---|
| `metric_evidence` | every candidate metric: Gini, bad rate per quartile, verdict (kept / dropped_weak / dropped_duplicate / dropped_no_added_value) and the reason |
| `metric_correlation` | Spearman rank correlation of every pair of candidates (≥ 0.5 = duplicate) |
| `scorecard_band` | value range → points (0 = riskiest band, 100 = safest), bad rate and count per band |
| `scorecard_weight` | regression coefficient and weight of each kept metric (weights sum to 1) |
| `criterion_weight` | weight of each criterion = sum of its metrics' weights |
| `scorecard_param` | `shrink_k`, grade cut-offs, `approve_cutoff`, `l2`, `train_gini`, `portfolio_bad_rate`, train counts |

Rules that produce those numbers (all in `fit_scorecard.js`):

- **Weak:** |Gini| < 0.10 on train → dropped.
- **Duplicate:** |rank correlation| ≥ 0.5 with a stronger metric → dropped.
- **Bands:** quartiles of the training values (2 bands for yes/no metrics), merged until the bad rate
  moves in one direction; points from weight of evidence, scaled 0–100.
- **Short history:** window metrics are pulled toward the average: `avg + (points − avg) · m / (m + k)`,
  m = months observed; k chosen from {3, 6, 12} by best training Gini.
- **Weights:** L2 logistic regression of bad on the points; weight = |coefficient| × spread of points,
  normalised to 100%.
- **Cut-offs:** walk the score deciles from the top and approve each while its own bad rate is below
  the portfolio average; A/B/C split the approved range in thirds, D/E the rejected range in half.
- **Score:** Σ weight × points, 0–100. No 300–850 scaling.
- **Gender** is decoded (birth number) but never used for scoring.

## Results (run 2026-11-11)

Kept metrics and weights: balance volatility 20.9%, overdraft (negative-balance) events 19.4%,
debt-to-income 9.4%, joint account 32.9%, balance trend 10.4%, income sources 7.0%. Shrink k = 3.
Cut-offs: A ≥ 68.41, B ≥ 55.75, C ≥ 49.04 (approve), D ≥ 40.62, else E.

| | Gini | Loans | Bad | Approved | Bad rate approved | Bad rate rejected |
|---|---|---|---|---|---|---|
| Train | 0.727 | 477 | 64 | 60.0% | 2.8% | 29.3% |
| Test | 0.933 | 205 | 12 | 66.8% | 0.0% | 17.6% |

Bad rate by grade A→E: train 0.0 / 2.1 / 6.4 / 15.6 / 43.2%; test 0.0 / 0.0 / 0.0 / 2.9 / 33.3%.
Caveat: the test set has only 12 bad loans and 9 finished loans, so its Gini is uncertain.
Customers with < 6 months of history are approved less often (35.7%) than those with 12+ (67.6%).

The live numbers are always in the validation views; re-run `npm run scorecard` to refresh.
