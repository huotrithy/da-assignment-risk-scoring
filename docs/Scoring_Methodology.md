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
| Loan payment ÷ monthly income | 0.25 | kept |
| Joint account | −0.25 | kept |
| Balance trend | −0.19 | kept |
| Number of income sources | −0.17 | kept |
| Account age | −0.10 | duplicate of balance trend (r −0.50, exactly at the limit) |
| Spend ÷ income | 0.07 | weak |
| Monthly money in | −0.04 | weak |
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
Each metric's weight = |coefficient| ÷ the sum of all |coefficients|, so the weights sum to 100%.
All points share the same 0–100 scale and every coefficient is negative, so the weighted score ranks
loans exactly as the regression does. A criterion's weight is the sum of its metrics' weights.

| Metric | Criterion | Weight |
|---|---|---|
| Overdraft events | Payment behaviour | 33.9% |
| Joint account | Account relationship | 22.6% |
| Balance volatility | Balance behaviour | 22.0% |
| Loan payment ÷ monthly income | Income & capacity | 10.8% |
| Balance trend | Balance behaviour | 6.7% |
| Number of income sources | Income & capacity | 4.1% |

Criteria: Payment behaviour 33.9%, Balance behaviour 28.7%, Account relationship 22.6%,
Income & capacity 14.8%, Demographics 0%. The order is close to the Stage 2 judgement (payment first);
the numbers are now measured.

## 6. Short history

Money-based metrics are averaged over the months actually elapsed in the window (from the later of
account opening or 365 days before the loan, to the loan date). Metrics measured over the window
(overdraft events, balance volatility, DTI) are less reliable when only a few months were observed. Their points are pulled toward the training average:

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
- Each cut sits midway between the boundary score and the next lower score, so rounding cannot move a
  loan across it.

Current cut-offs: A ≥ 73.08, B ≥ 65.30, C ≥ 61.23 (approve), D ≥ 53.53, otherwise E.

## 8. Validation

| | Gini | Loans | Bad | Approved | Bad rate if approved | Bad rate if rejected |
|---|---|---|---|---|---|---|
| Train | 0.74 | 477 | 64 | 60.4% | 2.8% | 29.6% |
| Test | 0.94 | 205 | 12 | 67.3% | 0.0% | 17.9% |

Bad rate by grade A→E: train 0.0 / 1.0 / 7.3 / 16.8 / 42.6%; test 0.0 / 0.0 / 0.0 / 2.8 / 35.5%.

The test set has only 12 bad loans, so its Gini is a direction, not a precise number. Running loans
may still go bad, so the score is also checked on finished loans only (train Gini 0.72; the test set has
only 9 finished loans and none of them went bad, so it cannot be checked this way) and on loans issued
at least a year before the data ends (test Gini 0.94, 47 loans). Customers with less than six months of
history are approved less often (36.9%) than those with a year or more (68.4%).

## 9. Limitations

- Small number of bad loans (76; 12 in the test set).
- Data from one Czech bank, 1993–1998; the method transfers, the exact numbers may not.
- No declared income — income is estimated from money coming into the account.
- Each account has at most one loan, so past loan repayment cannot be measured directly;
  overdraft and penalty interest are the closest available signal.
- Joint account carries the second-largest weight (22.6%) and decides most of grade A, because none of
  the joint-account training loans went bad; with more data this weight would likely shrink.
- The data has no date for when a second user joined an account, so joint-account status may have
  changed after the loan date — the only kept metric that cannot be checked point in time.

Pipeline, tables and run commands: `scripts/berka/README.md`.
