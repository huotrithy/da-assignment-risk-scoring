# Risk Scoring Methodology — Evidence-Based Scorecard

## 1. Overview

The scorecard gives each loan a score out of 100 (higher = safer) and a grade from A to E.
Grades A–C are approved; D and E are rejected.

The previous version built the same kind of scorecard on synthetic data, with metrics, weights and thresholds chosen
by judgement. The new version rebuilds it on real bank data — the Berka / PKDD'99 Czech bank dataset — where
the outcome of every loan is known. Each choice is now made by a written rule applied to the data,
and each rule is checked on loans the scorecard has never seen.

| Item | Previous version | New version |
|---|---|---|
| Data | synthetic customers (generator) | 682 real loans, 4,500 accounts, 1,056,320 transactions |
| Metrics | 12, chosen by judgement | 14 candidates tested; 6 kept by evidence |
| Weights | 35/25/20/10/10, judgement | each metric's share of the total measured strength (Gini) |
| Points | 100/70/40/10 by quartile rank | same rank points; real default rates decide the buckets and the safe direction |
| Score scale | 300–850 (×5.5 + 300) | out of 100, no scaling |
| Thresholds | judgement | approve only where real default rate is below average |
| Validation | not possible (no outcome) | train/test split, Gini, default rate per grade |

## 2. Outcome and data window

- **Defaulted loan** = status B (finished, not paid) or D (running, in debt). 76 of 682 loans (11.1%).
- **Repaid loan** = status A (finished, paid) or C (running, paid on time so far).
- **Point in time:** every metric uses only transactions in the **12 months before the loan date**.
  Nothing on or after the loan date is used, so the score uses only what the bank knew when it decided.
- **Split:** the earliest 70% of loans by date (477, 64 defaulted) are the **training set** — every constant is
  learned from them. The latest 30% (205, 12 defaulted) are the **test set**, used only to check the result.

## 3. Candidate metrics and how they were selected

Fourteen metrics were computed for every loan, grouped into the five criteria of the previous version
(gender is decoded from the data but never used, on fairness grounds).

| Criterion | Candidate metrics |
|---|---|
| Payment behaviour | penalty-interest charges; overdraft (negative-balance) events |
| Income & capacity | loan payment ÷ monthly income (DTI); number of income sources; monthly money in |
| Balance behaviour | balance volatility; lowest balance; balance trend; spend ÷ income |
| Account relationship | account age; has a card; joint account (two users) |
| Demographics | age; district unemployment |

Selection rules, applied on the training loans:

1. **Strength:** Gini of the metric against the outcome. Pair every repaid loan with every defaulted
   loan; Gini = 2 × (share of pairs in which the metric points at the defaulted loan) − 1, so 0 = coin
   flip and 1 = perfect. |Gini| < 0.10 → dropped as *weak*.
2. **Duplicates:** Spearman rank correlation between metrics. |r| ≥ 0.5 → the two metrics measure
   the same behaviour; the weaker one is dropped as a *duplicate*.
3. **Usable buckets:** if the default rate cannot be made to move in one direction across at least two
   buckets, the metric is dropped.

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

## 4. Buckets and points

For each kept metric the training values are cut at their quartiles (two buckets for yes/no metrics).
Adjacent buckets are merged until the default rate moves in one direction. Points are given by rank:
the bucket with the lowest default rate gets 100 and the one with the highest gets 10, evenly spaced in
between (100/70/40/10 for four buckets, 100/55/10 for three, 100/10 for two). A missing value goes to
the riskier end.

The cut points are fixed constants (`berka.scorecard_band`), so a customer's points do not depend on
who else is scored in the same batch.

## 5. Weights

Each metric's weight = its strength (|Gini| on the training loans) ÷ the total strength of the kept
metrics, so a stronger metric counts more and the weights sum to 100%. A criterion's weight is the sum
of its metrics' weights.

| Metric | Criterion | Strength | Weight |
|---|---|---|---|
| Balance volatility | Balance behaviour | 0.56 | 32.4% |
| Overdraft events | Payment behaviour | 0.31 | 18.0% |
| Joint account | Account relationship | 0.25 | 14.6% |
| Loan payment ÷ monthly income | Income & capacity | 0.25 | 14.3% |
| Balance trend | Balance behaviour | 0.19 | 10.8% |
| Number of income sources | Income & capacity | 0.17 | 9.8% |

Criteria: Balance behaviour 43.2%, Income & capacity 24.1%, Payment behaviour 18.0%,
Account relationship 14.6%, Demographics 0%. The previous version put payment first by judgement;
on the real loans balance behaviour separates repaid from defaulted loans best.

## 6. Short history

Money-based metrics are averaged over the months actually elapsed in the window (from the later of
account opening or 365 days before the loan, to the loan date). Metrics measured over the window
(overdraft events, balance volatility, DTI) are less reliable when only a few months were observed. Their points are pulled toward the training average:

    points = average + (points − average) × months ÷ (months + k)

k is chosen from {3, 6, 12} as the value giving the best training Gini (result: k = 3).
A customer with a short clean record therefore cannot reach the full 100.

## 7. Score, grades and approval

    score = Σ weight × points      (higher = safer, maximum 100)

Thresholds are set on the training scores:

- **Approve line:** walk the score deciles from the top; approve a decile only while its own default rate
  is below the portfolio average (13.4% on the training loans). The approve line is the bottom of the
  last decile that passes.
- **A / B / C:** the approved range split into thirds. **D / E:** the rejected range split in half.
- Each cut sits midway between the boundary score and the next lower score, so rounding cannot move a
  loan across it.

Current thresholds: A ≥ 72.58, B ≥ 62.91, C ≥ 57.78 (approve), D ≥ 48.34, otherwise E.

## 8. Validation

| | Gini | Loans | Defaulted | Approved | Default rate if approved | Default rate if rejected |
|---|---|---|---|---|---|---|
| Train | 0.70 | 477 | 64 | 60.2% | 3.8% | 27.9% |
| Test | 0.91 | 205 | 12 | 67.8% | 0.0% | 18.2% |

Default rate by grade A→E: train 0.0 / 2.8 / 9.4 / 14.7 / 41.1%; test 0.0 / 0.0 / 0.0 / 3.2 / 31.4%.

The test set has only 12 defaulted loans, so its Gini is a direction, not a precise number. Running loans
may still default, so the score is also checked on finished loans only (train Gini 0.71; the test set has
only 9 finished loans and none of them defaulted, so it cannot be checked this way) and on loans issued
at least a year before the data ends (test Gini 0.92, 47 loans). Customers with less than six months of
history are approved less often (33.3%) than those with a year or more (69.9%).

## 9. Limitations

- Small number of defaulted loans (76; 12 in the test set).
- Data from one Czech bank, 1993–1998; the method transfers, the exact numbers may not.
- No declared income — income is estimated from money coming into the account.
- Each account has at most one loan, so past loan repayment cannot be measured directly;
  overdraft and penalty interest are the closest available signal.
- Joint account carries a weight of 14.6% because none of the joint-account training loans defaulted;
  with more data this weight could change.
- The data has no date for when a second user joined an account, so joint-account status may have
  changed after the loan date — the only kept metric that cannot be checked point in time.

Pipeline, tables and run commands: `scripts/berka/README.md`.
