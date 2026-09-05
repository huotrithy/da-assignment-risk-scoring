# Part 2: Relational Data Model — Retail Credit Risk Scoring

## 1. Overview

This is the logical/physical translation of the 13 conceptual entities from
[Part1_Conceptual_Business_Model.md](Part1_Conceptual_Business_Model.md) into
a normalized relational schema, implemented in
[`01_schema.sql`](../01_schema.sql) (target: PostgreSQL). The schema is fully
populated with mock data — see §5 for how, and
[`Scoring_Methodology.md`](Scoring_Methodology.md) for how the features below
are meant to combine into an actual risk score.

## 2. Table-by-Table Design & Normalization Rationale

| Table | Purpose | Why it's a separate table (3NF rationale) |
|---|---|---|
| `customer` | One row per person the bank knows. | Root entity — every other table traces back to it via `customer_id`, directly or transitively. |
| `income_source` | One row per declared income stream per customer. | A customer can have **multiple concurrent** income sources (salary + rental). Storing this as columns on `customer` (`income_1`, `income_2`...) would violate 1NF (repeating groups) and cap the count arbitrarily. Kept as its own table so income can also be *re-declared over time* without overwriting history. |
| `account` | One row per deposit/transaction account. | A customer can hold multiple accounts (savings + current); account-level attributes (`status`, `open_date`) don't belong on `customer` because they're per-account, not per-person. |
| `transaction` | One row per individual movement on an account. | Classic 1:N — collapsing this into `account` would mean one row per account and lose all transaction-level detail, which is the actual signal used for behavioral scoring. |
| `account_balance_history` | One row per periodic balance snapshot. | Deliberately **separate from `transaction`**: a transaction is a *movement*, a balance snapshot is a *resulting position*. Deriving a snapshot from summing all transactions each time would be correct but expensive; storing it separately is a standard denormalization-for-performance tradeoff common in banking data warehouses (and it's what a 3–6 month average-balance stability feature is actually computed from). |
| `loan_product` | Catalog of loan products offered. | Reference/lookup table — `interest_rate`, `tenor_months`, min/max amount belong to the *product*, not to any one customer, so they're never duplicated per application. |
| `loan_offer` | One row per bank-initiated offer of a product to a customer. | Resolves the Customer↔Loan Product many-to-many (one customer can get several product offers; one product can be offered to many customers) — a textbook associative/junction entity. |
| `loan_application` | One row per formal loan request. | Kept distinct from `loan_offer` because not every application originates from an offer, and an application carries its own lifecycle (`status`) independent of the offer that may have preceded it. |
| `risk_score` | One row per score computed. | Deliberately **not** a single field on `customer` or `loan_application` — a customer accumulates *many* scores over time (periodic batch scores, application-time scores), and history must be preserved for trend analysis and model validation. `application_id` is nullable specifically to support scores that aren't tied to any one application (periodic/batch scoring that produces `loan_offer` candidates). |
| `loan_account` | One row per disbursed/serviced loan. | 1:1 with `loan_application` (an approved application becomes exactly one loan account), but modeled separately because it has its own lifecycle (`status`, `outstanding_balance`) that continues long after the application decision is made. |
| `payment_history` | One row per scheduled installment. | 1:N off `loan_account` — a loan has many scheduled payments; collapsing this would lose the exact on-time/late/missed signal that feeds back into future risk scores. |
| `delinquency_event` | One row per delinquency/default event. | Tracked separately from `payment_history` (not just a `status = 'missed'` row) because a delinquency event carries its own severity progression (`30dpd → 60dpd → 90dpd → write_off`) and drives a different downstream process (collections), not just installment bookkeeping. |
| `collateral` | One row per pledged asset per loan. | Only applies to secured products (e.g. Auto, Home Improvement loans), so it's optional/1:N off `loan_account` rather than a nullable column bolted onto every loan. |

All tables are in **3rd Normal Form**: every non-key attribute depends on the
whole key (no partial dependencies — trivial here since every table uses a
single surrogate PK), and nothing depends transitively on a non-key attribute
(e.g. `loan_product.interest_rate` lives on the product, not copied onto
every `loan_application` row that references it).

## 3. Primary Key / Foreign Key Reference

| Table | Primary Key | Foreign Keys | References |
|---|---|---|---|
| `customer` | `customer_id` | — | — |
| `income_source` | `income_id` | `customer_id` | `customer.customer_id` |
| `account` | `account_id` | `customer_id` | `customer.customer_id` |
| `transaction` | `transaction_id` | `account_id` | `account.account_id` |
| `account_balance_history` | `balance_history_id` | `account_id` | `account.account_id` |
| `loan_product` | `product_id` | — | — |
| `loan_offer` | `offer_id` | `customer_id`, `product_id` | `customer.customer_id`, `loan_product.product_id` |
| `loan_application` | `application_id` | `customer_id`, `product_id` | `customer.customer_id`, `loan_product.product_id` |
| `risk_score` | `score_id` | `customer_id`, `application_id` (nullable) | `customer.customer_id`, `loan_application.application_id` |
| `loan_account` | `loan_account_id` | `application_id` (unique — enforces 1:1) | `loan_application.application_id` |
| `payment_history` | `payment_id` | `loan_account_id` | `loan_account.loan_account_id` |
| `delinquency_event` | `event_id` | `loan_account_id` | `loan_account.loan_account_id` |
| `collateral` | `collateral_id` | `loan_account_id` | `loan_account.loan_account_id` |

Enum-like columns (`status`, `income_type`, `account_type`, `event_type`,
`risk_grade`) are constrained with `CHECK` clauses in `01_schema.sql` rather
than separate lookup tables — a deliberate simplification, since these value
sets are small, fixed, and not expected to grow or need their own metadata.

## 4. Feature → Analytic Question → Risk Score Linkage

This is the mapping the lecturer asked to make explicit: for each data
feature captured in the schema, what analytic question it answers, and how
it is meant to move the risk score. (The *how* — actual weights and point
bands — is detailed in
[`Scoring_Methodology.md`](Scoring_Methodology.md); this table is the
narrative bridge from raw feature to that scorecard.)

| Feature (table.column) | Analytic question it answers | How it impacts Risk Score |
|---|---|---|
| `income_source.monthly_income`, `income_type` | "Can this customer afford the loan? Is income diversified/stable?" | Higher, more stable/diversified income → higher repayment capacity → **raises** score. Drives the debt-to-income metric under the *Income & Capacity* criteria. |
| `transaction.amount`, `category`, `transaction_date` | "How does this customer actually spend and manage cash flow day-to-day?" | High spend-to-income ratio, erratic/large discretionary spend, or frequent overdraft-adjacent activity → **lowers** score. Feeds the *Transaction Behavior* criteria. |
| `account_balance_history.closing_balance` (trend over time) | "Is this customer's financial position improving, flat, or deteriorating?" | Rising average balance trend → **raises** score; declining trend → **lowers** score. Also feeds *Transaction Behavior*. |
| `account.status`, `open_date` | "How long and how actively has this customer banked with us?" | Longer tenure + active status → **raises** score (proxy for relationship depth/loyalty and data reliability); `dormant`/`closed` → neutral-to-negative. Feeds *Account Relationship* criteria. |
| `payment_history.status` (on_time/late/missed) | "For repeat borrowers: did they pay as agreed?" | % on-time is the single strongest predictor in most real scorecards — **raises** score sharply when clean, **lowers** it sharply with late/missed patterns. Feeds *Payment Behavior* criteria (highest weight). |
| `delinquency_event.event_type`, `days_past_due` | "How severely and how often has this customer defaulted?" | Presence/severity of delinquency events **lowers** score, with 90dpd/write-off applying the heaviest penalty. Also *Payment Behavior*. |
| `customer.date_of_birth`, `customer_since_date` | "Are there baseline demographic/tenure risk factors?" | Minor weight — age band and tenure with the bank as light-touch adjustments. Feeds *Demographics* criteria (lowest weight, to avoid over-relying on non-financial signals). |
| `loan_application.requested_amount` vs `loan_product.min/max_amount` | "Is the customer requesting an amount proportionate to capacity and product design?" | Requested amount far above what income/product would support **lowers** score (higher exposure relative to capacity). |
| `collateral.estimated_value` | "Is exposure mitigated by a pledged asset?" | Presence and value of collateral doesn't change the *behavioral* risk score itself, but factors into the final approve/reject and pricing decision alongside it (loss-given-default mitigant, not a probability-of-default input). |

## 5. Data Source & Generation Note

The database is populated with **synthetic data**, generated by
[`generate_data.js`](../generate_data.js):

- **Grounded in a real public dataset**: age, loan amount, loan duration, and
  the good/bad outcome label are bootstrap-sampled from the UCI *Statlog
  German Credit Data* (1000 real historical applications) rather than
  invented from arbitrary ranges — see
  [`reference_data/ATTRIBUTION.md`](../reference_data/ATTRIBUTION.md) for
  full citation and rationale.
- **Everything else** (customer names, transaction categories/amounts,
  balance trends, account tenure) is fully synthetic, generated with
  [Faker](https://fakerjs.dev/) for realistic-looking cosmetic values
  (names, dates, numeric ranges) layered on top of rule-based logic that
  keeps each customer's accounts/transactions/balances/loans internally
  consistent with a per-customer risk bucket.
- **Scale (current version)**: 800 customers, ~21,000 transactions, and
  proportionate volumes across all 13 tables — loaded into both a local
  SQLite file (`credit_risk.db`, for fast iteration) and a live PostgreSQL
  instance (via `postgres_export.sql`) for actual SQL query work in Part 3.
- **Known limitation** (to be expanded in Part 4): the *scoring outcome*
  itself (score value, grade, good/bad label) is currently bootstrap-sampled
  from the reference dataset's label rather than computed from the weighted
  scorecard in `Scoring_Methodology.md`. This is sufficient for producing a
  *realistic-looking* mock dataset, but the actual scorecard computation
  (Part 3 queries) is a separate, explicit exercise layered on top of these
  raw features.
