# Risk Scoring Methodology — Weighted Scorecard

## 1. Overview

This defines *how* the raw features documented in
[`Part2_Relational_Data_Model.md`](Part2_Relational_Data_Model.md) §4 combine
into the single `risk_score.score_value` / `risk_score.risk_grade` pair. It
follows the standard **weighted scorecard** approach used in retail credit
scoring (the same structure behind FICO-style scorecards):

```
Criteria (category)
  └─ Metric (measurable characteristic)
       └─ Point band (metric value → points, via binning)
  └─ Criteria Weight (% contribution to final score)

Final Score = Σ over criteria [ weight_i × avg(metric points in criteria_i) ]
            → scaled to 300–850
            → bucketed into risk_grade A–E
```

This mirrors real-world practice: each **criteria** groups related metrics,
each **metric** is independently predictive and bucketed into a small number
of bands (avoids overfitting to noisy continuous values), and **weights**
encode which criteria matter more for default risk — calibrated by an analyst
(or fit statistically against historical outcomes, which is what the
bootstrap-sampled UCI good/bad label stands in for in this mock dataset).

## 2. Criteria & Weights

| # | Criteria | Weight | Rationale for weight |
|---|---|---|---|
| 1 | **Payment Behavior** (repeat borrowers only) | 35% | Strongest predictor in virtually every real scorecard — actual past repayment conduct beats any proxy signal. |
| 2 | **Income & Capacity** | 25% | Direct measure of ability to repay; second-strongest signal. |
| 3 | **Transaction Behavior** | 20% | Behavioral proxy for financial discipline and cash-flow stability, especially valuable for first-time borrowers with no `payment_history` yet. |
| 4 | **Account Relationship** | 10% | Tenure/engagement as a stability proxy — weaker but still informative. |
| 5 | **Demographics & Loan Context** | 10% | Deliberately low weight — avoids over-relying on non-behavioral factors; mainly a light adjustment. |

For a **first-time applicant** (no loan history yet, so no
`payment_history`/`delinquency_event` rows), Criteria 1's weight is
redistributed proportionally across Criteria 2–5 (a common real-world
"reject inference" workaround for new-to-bank applicants).

## 3. Metrics per Criteria

### 3.1 Payment Behavior — 35%

| Metric | Source | Point Bands |
|---|---|---|
| % on-time payments | `payment_history.status` | ≥95% → 100 pts · 85–94% → 70 pts · 70–84% → 40 pts · <70% → 10 pts |
| Delinquency severity | `delinquency_event.event_type` | none → 100 pts · 30dpd only → 60 pts · 60dpd → 30 pts · 90dpd/write_off → 0 pts |

### 3.2 Income & Capacity — 25%

Income level and debt-to-income are scored by **population quartile**
(bottom 25% of customers on that metric → 10 pts, top 25% → 100 pts) rather
than fixed thresholds — see the note at the end of this section.

| Metric | Source | Point Bands |
|---|---|---|
| Monthly income level | `income_source.monthly_income` | Quartile of all customers by total monthly income: top → 100 pts · 3rd → 70 · 2nd → 40 · bottom → 10 |
| Income diversification | count of active `income_source` rows | 2+ concurrent sources → 100 pts · 1 source → 60 pts |
| Debt-to-income (requested amount ÷ monthly income) | `loan_application.requested_amount` ÷ `income_source.monthly_income` | Quartile by ratio (lower is better): best → 100 · 70 · 40 · worst → 10 · no application on file → 55 (neutral) |

### 3.3 Transaction Behavior — 20%

All three sub-metrics are population-quartile scored (see note below).

| Metric | Source | Point Bands |
|---|---|---|
| Transaction-volume "normality" | `transaction` (count, grouped by month), deviation from the population median | Quartile by distance from the median monthly count: closest → 100 · 70 · 40 · furthest → 10 (both dormant-like *and* frenetic activity end up furthest from median) |
| Spend-to-income ratio | Σ \|`transaction.amount`\| (spend categories) ÷ income category | Quartile by ratio (lower is better): best → 100 · 70 · 40 · worst → 10 |
| Balance trend (26-week slope) | `account_balance_history.closing_balance` via linear regression slope | Quartile by slope (higher/more positive is better): best → 100 · 70 · 40 · worst → 10 |

### 3.4 Account Relationship — 10%

| Metric | Source | Point Bands |
|---|---|---|
| Account tenure | `account.open_date` vs today | Quartile by tenure (longer is better): longest → 100 · 70 · 40 · shortest → 10 |
| Account status | `account.status` | active → 100 pts · dormant → 40 pts · closed → 0 pts |

### 3.5 Demographics & Loan Context — 10%

| Metric | Source | Point Bands |
|---|---|---|
| Age | `customer.date_of_birth`, distance from age 42 (population "prime" center) | Quartile by \|age − 42\|: closest → 100 · 70 · 40 · furthest → 10 |
| Requested amount vs product range | `loan_application.requested_amount` vs `loan_product.min/max_amount` | Quartile by % of range used (lower is better): best → 100 · 70 · 40 · worst → 10 · no application on file → 55 (neutral) |

**Why population quartiles, not fixed thresholds:** an earlier version of
this scorecard used fixed, judgment-based cutoffs (e.g. "spend-to-income
<50% → 100 pts"). Against this mock dataset, most customers cluster in the
same "good enough" band on any single metric, so the composite score barely
spread out — nearly everyone landed in grade B/C and D/E were almost empty.
Scoring each ratio/trend metric against the *population's own* quartile
distribution instead guarantees genuine spread (the bottom 25% on any given
metric always scores worst), which is also closer to how real scorecards are
actually built — bands are cut against the observed population's deciles
(often via Weight-of-Evidence/Information-Value analysis), not invented in
the abstract. Payment Behavior's thresholds (§3.1) are the one exception,
since % on-time and delinquency severity are meaningful on an absolute
scale regardless of population — a customer who misses every payment is
bad in any population, not just relative to their peers.

## 4. Aggregation & Grading

1. Compute each metric's points (0–100 scale) per its band.
2. Average the metric points within each criteria.
3. Weight and sum across criteria → a 0–100 composite.
4. Linearly scale the 0–100 composite into the schema's 300–850
   `score_value` range: `score = 300 + composite × 5.5`.
5. Bucket into `risk_grade` (thresholds already used consistently across
   the mock data generator and schema `CHECK` constraint):

| Score range | Grade |
|---|---|
| 750–850 | A |
| 680–749 | B |
| 600–679 | C |
| 500–599 | D |
| 300–499 | E |

Loan approval policy (also already reflected in the mock data): applications
scoring **≥600 (grade A/B/C)** are approved; **D/E are rejected** and never
progress to `loan_account`.

## 5. Relationship to the Mock Dataset

The current `generate_data.js` does not literally run this formula — it
bootstrap-samples a score/grade pair from the UCI German Credit Data good/bad
label, then generates internally-consistent downstream data (payments,
delinquencies) conditioned on that grade. This is intentional and disclosed
in [`Part2_Relational_Data_Model.md`](Part2_Relational_Data_Model.md) §5 as a
known limitation: it guarantees *realistic, self-consistent* mock data
without requiring the full scorecard to be computed at generation time.

For **Part 3**, this methodology is what the SQL queries should implement
directly against the live tables (e.g., computing spend-to-income ratio,
% on-time payments, balance trend per customer) — demonstrating the
scorecard logic as a set of analytic queries over the schema, independent of
how the mock `risk_score` rows were originally seeded.
