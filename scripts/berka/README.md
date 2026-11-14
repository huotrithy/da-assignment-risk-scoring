# Scorecard pipeline — evidence-based scorecard on real bank data (Berka)

The previous version scored synthetic customers with judgement-based metrics and weights. The new version moves to
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
| Checks | `checks/*.sql` | run automatically after each stage by `run_all.js`; every `*_ok` column must be `true` |

**Outcome:** defaulted = loan status B (finished, unpaid) or D (running, in debt): 76 of 682 loans (11.1%).
**Split:** earliest 70% of loans by date = train (477), latest 30% = test (205).

## What the fit learns (and where it is stored)

| Table | Meaning |
|---|---|
| `metric_evidence` | every candidate metric: Gini, default rate per quartile, verdict (kept / dropped_weak / dropped_duplicate / dropped_no_added_value) and the reason |
| `metric_correlation` | Spearman rank correlation of every pair of candidates (≥ 0.5 = duplicate) |
| `scorecard_band` | value range → points (0 = riskiest band, 100 = safest), default rate and count per band |
| `scorecard_weight` | regression coefficient and weight of each kept metric (weights sum to 1) |
| `criterion_weight` | weight of each criterion = sum of its metrics' weights |
| `scorecard_param` | `shrink_k`, grade cut-offs, `approve_cutoff`, `l2`, `train_gini`, `portfolio_bad_rate`, train counts |

Rules that produce those numbers (all in `fit_scorecard.js`):

- **Weak:** |Gini| < 0.10 on train → dropped.
- **Duplicate:** |rank correlation| ≥ 0.5 with a stronger metric → dropped.
- **Bands:** quartiles of the training values (2 bands for yes/no metrics), merged until the default rate
  moves in one direction; points from weight of evidence, scaled 0–100.
- **Short history:** window metrics are pulled toward the average: `avg + (points − avg) · m / (m + k)`,
  m = months observed; k chosen from {3, 6, 12} by best training Gini.
- **Weights:** L2 logistic regression of default on the points; weight = |coefficient| ÷ Σ|coefficient|, so the
  score ranks loans exactly as the regression does. Constants are stored at full precision.
- **Cut-offs:** walk the score deciles from the top and approve each while its own default rate is below
  the portfolio average; A/B/C split the approved range in thirds, D/E the rejected range in half; each
  cut sits midway between neighbouring scores. `checks/score_check.sql` verifies SQL grades = fit grades.
- **Score:** Σ weight × points, 0–100. No 300–850 scaling.
- **Gender** is decoded (birth number) but never used for scoring.

## Results (run 2026-11-12)

Kept metrics and weights: overdraft (negative-balance) events 33.9%, joint account 22.6%, balance
volatility 22.0%, debt-to-income 10.8%, balance trend 6.7%, income sources 4.1%. Shrink k = 3.
Cut-offs: A ≥ 73.08, B ≥ 65.30, C ≥ 61.23 (approve), D ≥ 53.53, else E.

| | Gini | Loans | Defaulted | Approved | Default rate approved | Default rate rejected |
|---|---|---|---|---|---|---|
| Train | 0.741 | 477 | 64 | 60.4% | 2.8% | 29.6% |
| Test | 0.936 | 205 | 12 | 67.3% | 0.0% | 17.9% |

Default rate by grade A→E: train 0.0 / 1.0 / 7.3 / 16.8 / 42.6%; test 0.0 / 0.0 / 0.0 / 2.8 / 35.5%.
Caveat: the test set has only 12 defaulted loans and 9 finished loans, so its Gini is uncertain.
Customers with < 6 months of history are approved less often (36.9%) than those with 12+ (68.4%).

The live numbers are always in the validation views; re-run `npm run scorecard` to refresh.
