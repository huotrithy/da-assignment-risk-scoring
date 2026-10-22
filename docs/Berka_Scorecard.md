# Berka Scorecard — where the weights and formula come from

Code: `berka/build_scorecard.py` · Data: `berka/berkadb.dev` · Outputs: `berka/output/` and table `berka_scorecard` in the db.

## 1. What is being predicted

`bad = 1` if `loan.status` is **B** (finished, unpaid) or **D** (running, in arrears); `bad = 0` for **A** / **C**.
682 loans, 76 bad (11.1%). This is a real outcome, so weights can be *measured* instead of assumed.
(The mock-data weights 35/25/20/10/10 in `Scoring_Methodology.md` were analyst judgment; there was no real outcome to fit them to.)

## 2. No leakage: features use only data before the loan date

Every feature is computed from `trans` rows dated **before** `loan.date`, within the 12 months prior. Anything after disbursement
(including the loan's own repayments, `k_symbol = UVER`) is excluded, since it would encode the answer.

## 3. The five criteria (unchanged) and their metrics

| Criteria | Metrics (Berka source) |
|---|---|
| Payment Behavior *(proxy)* | `sanction_count` (overdraft penalty `SANKC. UROK`), `neg_balance_share`, `months_with_neg_balance` |
| Income & Capacity | `inflow_per_month` (credits excl. interest — **income is not recorded, this is a proxy**), `payment_to_inflow` (= loan payment ÷ inflow, the debt-to-income), `amount_to_annual_inflow`, `income_source_types` |
| Transaction Behavior | `txn_per_month`, `avg_balance`, `min_balance`, `balance_slope` (month-end), `outflow_to_inflow`, `cash_share` |
| Account Relationship | `tenure_months`, `has_card`, `n_disponents`, `monthly_statement` |
| Demographics & Loan Context | `age`, `is_female`, `loan_amount`, `loan_duration`, `district_salary`, `district_unemployment`, `district_urban_ratio` |

Payment Behavior cannot be the original "% on-time payments": Berka has one loan per account and no payment-level history before the
loan. The proxy is *overdraft conduct on the existing account*, which is what a bank actually sees for a first-time borrower.
`is_female`, `age` and district are kept only to test them; see §7 on fairness.

## 4. Metric points = Weight of Evidence (WoE)

Each metric is cut into ≤5 quantile bins (zeros get their own bin when a metric is mostly zero; missing is its own bin). Per bin:

`WoE = ln( share of all good loans in the bin ÷ share of all bad loans in the bin )`  (+0.5 smoothing)

Positive = safer than average, negative = riskier. This replaces the guessed "≥95% → 100 pts" bands: the points *are* how strongly
the bin separates good from bad. A metric's **Information Value** `IV = Σ (good share − bad share) × WoE` measures its total power.

## 5. Where each criteria weight comes from

1. **Noise floor.** With 76 bad loans, a *worthless* metric still scores IV ≈ 0.02–0.07 by chance. We shuffle the labels 200 times to
   measure this per metric. A metric is **kept only if its IV beats chance + 2 SD**.
2. **Criteria strength** = mean of (IV − chance IV) over its kept metrics.
3. **Weight** = strength ÷ sum of strengths over the 5 criteria.
4. **Criteria score** = mean WoE of the kept metrics; **composite** `S = Σ weight × criteria score`.

| Criteria | Judgment | **Data-derived** | Kept metrics |
|---|---|---|---|
| Payment Behavior | 35% | **51.3%** | sanction_count, neg_balance_share, months_with_neg_balance |
| Income & Capacity | 25% | **5.1%** | payment_to_inflow, amount_to_annual_inflow, income_source_types |
| Transaction Behavior | 20% | **21.6%** | min_balance, cash_share, balance_slope, avg_balance |
| Account Relationship | 10% | **14.6%** | n_disponents, has_card |
| Demographics & Loan Context | 10% | **7.4%** | loan_amount |

Rankings: the judgment ordering was half right. Payment conduct is #1 as assumed. But **income/capacity is much weaker** than assumed
(its proxy is noisy) and **account relationship is stronger** (mostly one fact: accounts with a second holder, 145 loans, had **0 bad**).
Dropped as noise: age, gender, tenure, loan duration, district salary/unemployment/urban ratio, txn count, outflow ratio.

## 6. Where the 300–850 score and grades come from

`composite → calibrate → score`: fit `log-odds(bad) = a + b·S` (logistic), then the standard scorecard scaling

`score = offset + factor × ln(good:bad odds)`,  `factor = PDO / ln 2`,  `offset = 600 − factor × ln 20`

with **PDO = 50** (every 50 points doubles the odds) and **600 = 20:1 odds** (PD ≈ 4.8%). Calibration uses *out-of-fold* composites
so the PD scale is not overfit. The old `300 + composite × 5.5` was just a stretch to fit the range; this form gives each score a PD.
The grade bands are kept unchanged and now have meaning: A ≥750 ≈ PD <0.6%, B ≥680 ≈ 1.6%, C ≥600 ≈ 4.8%, D ≥500 ≈ 17%, E below.

## 7. Does it work? (5-fold × 20 repeats; bins, noise filter and weights re-fit on training folds only)

| Weighting | AUC |
|---|---|
| **Data-derived weights (this doc)** | **0.914 ± 0.036** |
| Judgment 35/25/20/10/10 (same WoE points) | 0.893 ± 0.041 |
| Equal weights | 0.904 ± 0.036 |
| Logistic regression on WoE (reference ceiling) | 0.923 ± 0.029 |
| Best single metric | 0.673 ± 0.054 |

Out-of-fold bad rate by grade: **A 0/89 · B 0/105 · C 3/175 (1.7%) · D 18/201 (9.0%) · E 55/112 (49%)**. Out-of-fold KS and AUC are in `output/summary.json`.

## 8. Caveats — read before presenting

- **The weight advantage is small.** Data weights beat judgment by ~0.02 AUC, less than one fold-SD. Say "at least as good, and now justified", not "much better".
- **Payment Behavior's 51% rests on 26 loans (3.8%).** Every loan with a negative balance before disbursement is bad (26/26); none are good.
  It is real and leak-free, but behaves like a *knockout rule*. Recommend: treat overdraft-before-loan as an automatic refer/decline, and consider
  capping this criterion's weight (~35%) for the continuous score. IV here is also inflated by the empty good-cell.
- **Right-censoring.** 1998 loans show 2.5% bad vs ~13% for 1993–97 (not enough time to default). Re-run excluding 1998: AUC 0.901, same kept
  metrics, weights within ±3 points (Payment 48%, Income 6%, Transaction 22%, Relationship 16%, Demographics 8%).
- **Small sample.** 76 bads → weights are noisy; expect ±several points. Statuses C/D are still running, so some "good" C loans may yet default.
- **Income is a proxy** (credits into the account), not declared income; customers who bank elsewhere look poorer than they are.
- **Fairness.** Gender and age were tested and dropped as noise, which is the outcome we want. District variables were also dropped.
  Keep it that way: do not add protected attributes to a production score.
- **`n_disponents`** is a structural fact (joint liability), not behavior. It is predictive here but should be confirmed as a policy feature, not a customer trait.

## 9. Why these five criteria, and can we add or drop one?

**Origin.** The five groups are a design convention, not something the data produced. Four come from the questions lenders ask
(`risk_scoring.md`): have they repaid before, can they afford it, do they manage money well, how stable is the relationship. The fifth
(Demographics & Loan Context) holds loan size and age. The structure is "FICO-style" (group metrics, weight groups); our original
35/25/20/10/10 echoes FICO's published factor weights (35/30/15/10/10) in shape only. It was judgment, neither copied nor fitted.

**Test** (`berka/criteria_experiment.py`; same 5-fold x 20 pipeline, same splits; "better" = share of folds where the variant beats the 0.914 baseline):

| Change | AUC | vs baseline | Better in | Verdict |
|---|---|---|---|---|
| drop Transaction Behavior | 0.841 | -0.073 | 1% of folds | essential |
| drop Account Relationship | 0.889 | -0.026 | 1% | keep |
| drop Payment Behavior | 0.893 | -0.022 | 13% | keep |
| drop Income & Capacity | 0.920 | +0.006 | 65% | droppable statistically; keep for affordability policy |
| drop Demographics & Loan | 0.917 | +0.003 | 42% | free to drop |
| add Cash-flow Stability & Liquidity | 0.921 | +0.007 | 69% | small, optional |
| add Existing Commitments (standing orders) | 0.916 | +0.001 | 51% | no gain |

A criterion earns its place if it is known before the decision, beats the noise test, makes unseen loans score worse when removed, or has a
policy reason. **Caveat on standing orders:** the `order` table has no dates, so some orders may postdate the loan; their high IV (1.7) is
not trustworthy and we do not recommend using them. Income & Capacity is kept despite the result because lenders must be able to show an
affordability check; its weakness here is partly our income *proxy*.

## 10. Why 300-850 (and not 0-1000 or a percentage)?

The range is a label. `score = offset + factor x ln(odds)` has three free choices: the anchor (600 = 20:1), points-to-double-odds (50), and
a floor/ceiling (300/850). A different range changes two numbers and **leaves ranking and AUC identical**.

- **Why 300-850:** the credit-score convention people read instantly, and the schema `CHECK`, grade bands and docs already use it.
- **Why not a percentage:** a default probability squashes the safe end (0.2% vs 0.6% look alike but differ 3x), and cannot be added metric by
  metric for reason codes. We still use probability where it fits best: pricing and provisioning. Score ranks, probability prices.
- **Why not 0-1000:** equally valid; it would just mean re-cutting the A-E bands.
- **Real cost:** the range clips. 26 loans sit at 850 and 31 at 300 (8%), so differences among the very best and worst are hidden.
  If that matters, widen the range or lower the points-to-double-odds before adopting it.
