# Risk Scoring Methodology — Evidence-Based Scorecard (Stage 3)

## 1. Overview

The scorecard gives each loan a score from 0 (riskiest) to 100 (safest) and a grade from A to E.
Grades A–C are approved; D and E are rejected.

Stage 2 built the same kind of scorecard on synthetic data, with metrics, weights and cut-offs chosen
by judgement. Stage 3 rebuilds it on real bank data — the Berka / PKDD'99 Czech bank dataset — where
the outcome of every loan is known. Each choice is now made by a written rule applied to the data,
and each rule is checked on loans the scorecard has never seen.

| Item | Stage 2 | Stage 3 |
|---|---|---|
| Data | synthetic customers (generator) | 682 real loans, 4,500 accounts, 1,056,320 transactions |
| Metrics | 12, chosen by judgement | 14 candidates tested; 6 kept by evidence |
| Weights | 35/25/20/10/10, judgement | learned by logistic regression |
| Points | 100/70/40/10 by quartile rank | from each band's real bad rate (weight of evidence) |
| Score scale | 300–850 (×5.5 + 300) | 0–100, no scaling |
| Cut-offs | judgement | approve only where real bad rate is below average |
| Validation | not possible (no outcome) | train/test split, Gini, bad rate per grade |

## 2. Outcome and data window

- **Bad loan** = status B (finished, not paid) or D (running, in debt). 76 of 682 loans (11.1%).
- **Good loan** = status A (finished, paid) or C (running, paid on time so far).
- **Point in time:** every metric uses only transactions in the **12 months before the loan date**.
  Nothing on or after the loan date is used, so the score uses only what the bank knew when it decided.
- **Split:** the earliest 70% of loans by date (477, 64 bad) are the **training set** — every constant is
  learned from them. The latest 30% (205, 12 bad) are the **test set**, used only to check the result.

## 3. Candidate metrics and how they were selected

Fourteen metrics were computed for every loan, grouped into the five Stage 2 criteria
(gender is decoded from the data but never used, on fairness grounds).

| Criterion | Candidate metrics |
|---|---|
| Payment behaviour | penalty-interest charges; overdraft (negative-balance) events |
| Income & capacity | loan payment ÷ monthly income (DTI); number of income sources; monthly money in |
| Balance behaviour | balance volatility; lowest balance; balance trend; spend ÷ income |
| Account relationship | account age; has a card; joint account (two users) |
| Demographics | age; district unemployment |

Selection rules, applied on the training loans:

1. **Strength:** Gini of the metric against the outcome. |Gini| < 0.10 → dropped as *weak*.
2. **Duplicates:** Spearman rank correlation between metrics. |r| ≥ 0.5 → the two metrics measure
   the same behaviour; the weaker one is dropped as a *duplicate*.
3. **Usable banding:** if the bad rate cannot be made to move in one direction across at least two
   bands, the metric is dropped.
4. **Added value:** after the regression (section 5), a metric whose coefficient points the wrong way
   adds nothing once the others are known and is dropped.

Result (live values in `berka.metric_evidence`):

| Metric | Gini (train) | Verdict |
|---|---|---|
| Balance volatility | 0.56 | kept |
| Lowest balance | −0.51 | duplicate of balance volatility (r −0.58) |
| Overdraft events | 0.31 | kept |
| Penalty-interest charges | 0.29 | duplicate of overdraft events (r 0.92) |
| Loan payment ÷ monthly income | 0.27 | kept |
| Joint account | −0.25 | kept |
| Balance trend | −0.19 | kept |
| Number of income sources | −0.17 | kept |
| Account age | −0.10 | duplicate of balance trend (r −0.50) |
| Spend ÷ income | 0.07 | weak |
| Monthly money in | −0.05 | weak |
| Has a card | −0.04 | weak |
| District unemployment | 0.04 | weak |
| Age | 0.03 | weak |

Positive Gini = higher value is riskier; negative = higher value is safer.

## 4. Bands and points

For each kept metric the training values are cut at their quartiles (two bands for yes/no metrics).
Adjacent bands are merged until the bad rate moves in one direction. Each band's points come from its
**weight of evidence** — ln(share of good loans ÷ share of bad loans), with +0.5 smoothing — scaled so
the safest band gets 100 and the riskiest gets 0. A missing value goes to the riskier end.

The cut points are fixed constants (`berka.scorecard_band`), so a customer's points do not depend on
who else is scored in the same batch.

## 5. Weights

An L2-regularised logistic regression (L2 = 1) predicts "went bad" from the kept metrics' points.
Each metric's weight = |coefficient| × standard deviation of its points, scaled so all weights sum
to 100%. A criterion's weight is the sum of its metrics' weights.

| Metric | Criterion | Weight |
|---|---|---|
| Joint account | Account relationship | 32.9% |
| Balance volatility | Balance behaviour | 20.9% |
| Overdraft events | Payment behaviour | 19.4% |
| Balance trend | Balance behaviour | 10.4% |
| Loan payment ÷ monthly income | Income & capacity | 9.4% |
| Number of income sources | Income & capacity | 7.0% |

Criteria: Account relationship 32.9%, Balance behaviour 31.3%, Payment behaviour 19.4%,
Income & capacity 16.4%, Demographics 0%.

## 6. Short history

Metrics measured over the 12-month window (overdraft events, balance volatility, DTI) are less
reliable when only a few months were observed. Their points are pulled toward the training average:

    points = average + (points − average) × months ÷ (months + k)

k is chosen from {3, 6, 12} as the value giving the best training Gini (result: k = 3).
A customer with a short clean record therefore cannot reach the full 100.

## 7. Score, grades and approval

    score = Σ weight × points      (0–100)

Cut-offs are set on the training scores:

- **Approve line:** walk the score deciles from the top; approve a decile only while its own bad rate
  is below the portfolio average (13.4% on the training loans). The approve line is the bottom of the
  last decile that passes.
- **A / B / C:** the approved range split into thirds. **D / E:** the rejected range split in half.

Current cut-offs: A ≥ 68.41, B ≥ 55.75, C ≥ 49.04 (approve), D ≥ 40.62, otherwise E.

## 8. Validation

| | Gini | Loans | Bad | Approved | Bad rate if approved | Bad rate if rejected |
|---|---|---|---|---|---|---|
| Train | 0.73 | 477 | 64 | 60.0% | 2.8% | 29.3% |
| Test | 0.93 | 205 | 12 | 66.8% | 0.0% | 17.6% |

Bad rate by grade A→E: train 0.0 / 2.1 / 6.4 / 15.6 / 43.2%; test 0.0 / 0.0 / 0.0 / 2.9 / 33.3%.

The test set has only 12 bad loans, so its Gini is a direction, not a precise number. Running loans
may still go bad, so the score is also checked on finished loans only (train Gini 0.72) and on loans
issued at least a year before the data ends (test Gini 0.95, 47 loans). Customers with less than six
months of history are approved less often (35.7%) than those with a year or more (67.6%).

## 9. Limitations

- Small number of bad loans (76; 12 in the test set).
- Data from one Czech bank, 1993–1998; the method transfers, the exact numbers may not.
- No declared income — income is estimated from money coming into the account.
- Each account has at most one loan, so past loan repayment cannot be measured directly;
  overdraft and penalty interest are the closest available signal.
- Joint account carries the largest weight because none of the joint-account training loans went bad;
  with more data this weight would likely shrink.

Pipeline, tables and run commands: `scripts/berka/README.md`.
