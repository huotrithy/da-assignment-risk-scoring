# Scorecard pipeline — evidence-based scorecard on real bank data (Berka)

The previous version scored synthetic customers with judgement-based metrics and weights. The new version moves to
the **Berka / PKDD'99 Czech bank dataset** (real accounts, transactions and loans with known
outcomes, 1993–1998), so every metric, bucket, weight and threshold is learned from — and checked
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
| Fit | `fit_scorecard.js`, `01_constants_schema.sql`, `lib/scorecard.js` | evidence, buckets, points, weights, thresholds (train loans only) |
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
| `scorecard_band` | value range → points (0 = riskiest bucket, 100 = safest), default rate and count per bucket |
| `scorecard_weight` | strength (|Gini|) and weight of each kept metric (weights sum to 1) |
| `criterion_weight` | weight of each criterion = sum of its metrics' weights |
| `scorecard_param` | `shrink_k`, grade thresholds, `approve_cutoff`, `train_gini`, `portfolio_bad_rate`, train counts |

Rules that produce those numbers (all in `fit_scorecard.js`):

- **Weak:** |Gini| < 0.10 on train → dropped.
- **Duplicate:** |rank correlation| ≥ 0.5 with a stronger metric → dropped.
- **Buckets:** quartiles of the training values (2 buckets for yes/no metrics), merged until the default rate
  moves in one direction; points by rank, 100 (safest bucket) down to 10 (100/70/40/10 for four buckets).
- **Short history:** window metrics are pulled toward the average: `avg + (points − avg) · m / (m + k)`,
  m = months observed; k chosen from {3, 6, 12} by best training Gini.
- **Weights:** weight = |Gini| of the metric on train ÷ Σ|Gini| of the kept metrics. Constants are stored
  at full precision.
- **Thresholds:** walk the score deciles from the top and approve each while its own default rate is below
  the portfolio average; A/B/C split the approved range in thirds, D/E the rejected range in half; each
  cut sits midway between neighbouring scores. `checks/score_check.sql` verifies SQL grades = fit grades.
- **Score:** Σ weight × points, maximum 100. No 300–850 scaling.
- **Gender** is decoded (birth number) but never used for scoring.

## Results (run 2026-11-14)

Kept metrics and weights: balance volatility 32.4%, overdraft (negative-balance) events 18.0%, joint
account 14.6%, debt-to-income 14.3%, balance trend 10.8%, income sources 9.8%. Shrink k = 3.
Thresholds: A ≥ 72.58, B ≥ 62.91, C ≥ 57.78 (approve), D ≥ 48.34, else E.

| | Gini | Loans | Defaulted | Approved | Default rate approved | Default rate rejected |
|---|---|---|---|---|---|---|
| Train | 0.700 | 477 | 64 | 60.2% | 3.8% | 27.9% |
| Test | 0.905 | 205 | 12 | 67.8% | 0.0% | 18.2% |

Default rate by grade A→E: train 0.0 / 2.8 / 9.4 / 14.7 / 41.1%; test 0.0 / 0.0 / 0.0 / 3.2 / 31.4%.
Caveat: the test set has only 12 defaulted loans and 9 finished loans, so its Gini is uncertain.
Customers with < 6 months of history are approved less often (33.3%) than those with 12+ (69.9%).

The live numbers are always in the validation views; re-run `npm run scorecard` to refresh.
