# Part 4: Sensitive Data & Data Quality Issues — Retail Credit Risk Scoring

## 1. Sensitive Data Classification

Of the four categories commonly assessed (PII, CFI, CPNI, PHI), only **PII**
and **CFI** are relevant to this model — CPNI (telecom network usage data)
and PHI (health information) don't apply to a retail banking domain.

| Field(s) | Category | Why |
|---|---|---|
| `customer.full_name`, `date_of_birth`, `national_id` | **PII** | Directly identifies a specific person; `national_id` in particular is a government-issued identifier and the highest-sensitivity field in the model. |
| `income_source.monthly_income`, `income_type` | **CFI** | Reveals a customer's earnings and how they're earned. |
| `transaction.amount`, `category`, `transaction_date` | **CFI** | A transaction log, aggregated over time, effectively reconstructs a customer's spending habits and lifestyle. |
| `account_balance_history.closing_balance` | **CFI** | Reveals a customer's financial position/trajectory over time. |
| `loan_application.requested_amount`, `loan_account.outstanding_balance` | **CFI** | Loan exposure and outstanding debt. |
| `risk_score.score_value`, `risk_grade`, `calculated_risk_score.*` | **CFI (derived)** | A derived judgment about the customer's creditworthiness — sensitive not because of what it directly contains, but because of what it's used to decide (approve/reject, pricing), which makes it a candidate for fair-lending/discrimination scrutiny if handled carelessly. |
| `payment_history.status`, `delinquency_event.event_type` | **CFI** | A customer's repayment/default history — arguably the most consequential CFI in the model, since it follows the customer into every future score. |

**Access implication:** every table above ultimately joins back to `customer`
via `customer_id`, so access control has to be enforced at the query/view
layer (e.g. row-level security or masked views for `national_id`), not just
by hiding a handful of "obviously sensitive" tables — `transaction` and
`payment_history` look innocuous per-row but are highly re-identifying and
sensitive in aggregate.

## 2. Data Quality Challenges

| Data Element | Challenge | Why It Matters | Reasoning |
|---|---|---|---|
| `income_source.monthly_income` | Self-declared, not independently verified against payslips/bank statements | Feeds directly into the Income & Capacity scoring criteria (25% weight) | A customer has incentive to overstate income to qualify for a larger loan — this is a classic garbage-in-garbage-out risk: the scorecard's output is only as trustworthy as this one unverified input. |
| `customer.national_id` | No enforced format/checksum validation beyond `UNIQUE`; a customer applying at a different time/branch with a mistyped or differently-formatted ID could be created as a second `customer` row | Breaks the "one customer, one record" assumption the whole model depends on — payment history and risk scores would then be split across two identities | Same failure mode called out in real telecom/banking systems as "customer duplication" — mitigated in practice by ID format validation at capture time and a dedupe/match process, not by the schema alone. |
| `transaction.category` | Free-text-style field with no `CHECK` constraint (unlike `income_type`/`account_type`/`status`) | Feeds the spend-to-income ratio metric (Transaction Behavior criteria) — inconsistent labels (`"Groceries"` vs `"groceries"` vs `"Grocery"`) would silently under- or over-count spend categories in an aggregation query | Enum-like fields that are free text instead of constrained are the most common source of "the data is inconsistent instead of missing" quality problems in a schema — they don't fail loudly, they just produce wrong aggregates. |
| `account_balance_history` | Populated by a periodic snapshot job (conceptually, an end-of-day batch), not a live query — a missed run leaves a gap for that period | Feeds the balance-trend slope metric (`REGR_SLOPE`) — a gap changes the number of points in the regression and can flip the slope's sign for customers with few snapshots | Trend-based metrics are quietly more fragile than point-in-time metrics: a data pipeline outage doesn't crash the scoring query, it just changes the answer. |
| `transaction_date` recency | No explicit handling in the schema/queries for transactions posted with a lag (e.g. a card transaction settling days after it occurred) | The Transaction Behavior criteria treats "this month's" activity as ground truth for scoring | Mirrors a well-known telecom/banking pattern (late-arriving records distorting the current period's numbers) — a customer scored right at month-end could look artificially inactive if some of their real transactions haven't posted yet. |

## 3. Note on This Assignment's Mock Dataset Specifically

Separately from the *general* schema-level risks above, this assignment's
actual dataset has one dataset-specific quality caveat already disclosed in
[`Part2_Relational_Data_Model.md`](Part2_Relational_Data_Model.md) §5: the
mock `risk_score` values are bootstrap-sampled from the UCI reference
dataset's outcome label rather than computed from the scorecard formula, so
`risk_score` and `calculated_risk_score` (Part 3) are expected to correlate
only moderately, not strongly — this is a property of how the mock data was
generated, not a bug in the scorecard logic itself.
