# Part 3 — Scoring SQL Scripts

Run in order against the Postgres database (`01_schema.sql` must already be
loaded). Each script is self-contained and safe to re-run.

| # | Script | What it does |
|---|---|---|
| 00 | `00_create_calculated_risk_score.sql` | Creates `calculated_risk_score` — the table that stores our computed scorecard output, kept separate from the mock/seeded `risk_score` table so the two can be compared. (Already included in `01_schema.sql`; this file just makes the Part 3 story runnable standalone.) |
| 01 | `01_metric_payment_behavior.sql` | Criteria #1 (35% weight) — % on-time payments + worst delinquency severity, per customer. Read-only query, no writes. |
| 02 | `02_metric_income_capacity.sql` | Criteria #2 (25% weight) — income level, diversification, debt-to-income. Read-only. |
| 03 | `03_metric_transaction_behavior.sql` | Criteria #3 (20% weight) — avg. monthly transaction count, spend-to-income ratio, balance trend slope. Read-only. |
| 04 | `04_metric_account_relationship.sql` | Criteria #4 (10% weight) — account tenure, account status. Read-only. |
| 05 | `05_metric_demographics.sql` | Criteria #5 (10% weight) — age band, requested amount vs product range. Read-only. |
| 06 | `06_calculate_and_store_scorecard.sql` | **The master script.** Recombines all 5 criteria with the weights (redistributing Payment Behavior's weight for first-time applicants who have no loan history), computes the 300–850 composite score and A–E grade, and `INSERT`s one row per customer into `calculated_risk_score`. |
| 07 | `07_validate_scorecard.sql` | Sanity checks: grade distribution, a cross-tab against each customer's latest mock `risk_score` grade, a correlation coefficient between computed and mock scores, and a 20-row sample for manual spot-checking. |

Scripts 01–05 are the "show your work" queries — each one isolates a single
criteria so it's easy to review the joins/logic in isolation. Script 06 is
the same logic recombined into one INSERT; script 07 is how to sanity-check
the result once it's loaded.

**Scoring approach (v2 — tightened bands):** Payment Behavior (script 01)
uses real percentage/severity thresholds (% on-time payments, delinquency
severity), so it's left as fixed cutoffs. Criteria #2-#5's ratio/trend
sub-metrics (income level, debt-to-income, spend-to-income, transaction
volume "normality", balance trend, account tenure, age, requested-amount
range) are scored by **population quartile** instead: the bottom 25% of the
customer base on that metric always scores 10 pts, the top 25% always
scores 100 pts. This is what actually produces a spread-out grade
distribution — v1 used fixed guessed cutoffs and almost everyone landed in
B/C regardless.

**Already run against the live instance** (`192.168.100.93` /
`da-assignment-risk-scoring`) as of this version: 800 customers scored,
grade distribution A:35 · B:200 · C:413 · D:151 · E:1 — a realistic
bell-shaped skew with all five grades represented. Correlation against the
mock `risk_score` is expected to be modest, not high — the mock score was
seeded independently by bootstrap-sampling the UCI dataset, not computed
from this formula (see `docs/Scoring_Methodology.md` §5).

Quartile ties are broken by `customer_id`, so re-running script 06 on the same
data gives identical results. The data itself is reproducible too:
`generate_data.js` uses a fixed seed and as-of date (2026-10-03), and only
creates payments, delinquency events and loan statuses that are consistent
with that date.
