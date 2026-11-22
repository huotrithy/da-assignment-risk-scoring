-- ============================================================================
-- Part 3 — Master script: combines the 5 criteria from scripts 01-05 into a
-- single weighted composite score per customer, and stores the result in
-- calculated_risk_score (see docs/Scoring_Methodology.md for the formula).
--
-- This is a periodic/batch-style score, computed for EVERY customer
-- regardless of whether they currently have an application on file — it
-- mirrors the "proactive scan" scoring use case from Part 1's conceptual
-- model, and is what makes it directly comparable to any customer's mock
-- risk_score row (application-linked or not) in script 07.
--
-- Weight redistribution: customers with no loan_account yet (no
-- payment_history to judge) have no Payment Behavior sub-score. Its 35%
-- weight is redistributed proportionally across the other four criteria
-- instead of just zeroing it out — otherwise first-time applicants would be
-- unfairly capped at a 65% composite ceiling.
--
-- Tightened v2: criteria #2-#5's ratio/trend sub-metrics are now scored by
-- POPULATION QUARTILE (bottom 25% of the customer base on that metric always
-- scores 10 pts, top 25% always scores 100 pts) instead of fixed guessed
-- thresholds. This guarantees real spread in the composite score instead of
-- most customers converging into B/C — see scripts 02-05 for the per-metric
-- quartile logic this reproduces.
-- ============================================================================

TRUNCATE TABLE calculated_risk_score;

INSERT INTO calculated_risk_score (
    customer_id, payment_behavior_points, income_capacity_points,
    transaction_behavior_points, account_relationship_points, demographics_points,
    composite_score, calculated_score_value, calculated_risk_grade
)
WITH customer_payments AS (
    SELECT
        lap.customer_id,
        COUNT(ph.payment_id) AS total_payments,
        COUNT(ph.payment_id) FILTER (WHERE ph.status = 'on_time') AS on_time_payments
    FROM loan_account la
    JOIN loan_application lap ON lap.application_id = la.application_id
    LEFT JOIN payment_history ph ON ph.loan_account_id = la.loan_account_id
    GROUP BY lap.customer_id
),
worst_delinquency AS (
    SELECT
        lap.customer_id,
        MAX(CASE de.event_type
                WHEN 'write_off' THEN 4 WHEN '90dpd' THEN 3
                WHEN '60dpd' THEN 2 WHEN '30dpd' THEN 1 ELSE 0 END) AS worst_severity
    FROM loan_account la
    JOIN loan_application lap ON lap.application_id = la.application_id
    LEFT JOIN delinquency_event de ON de.loan_account_id = la.loan_account_id
    GROUP BY lap.customer_id
),
payment_behavior AS (
    SELECT
        cp.customer_id,
        AVG(x) FILTER (WHERE x IS NOT NULL) AS points
    FROM customer_payments cp
    JOIN worst_delinquency wd ON wd.customer_id = cp.customer_id
    CROSS JOIN LATERAL (VALUES
        (CASE WHEN cp.total_payments = 0 THEN NULL
              WHEN 100.0 * cp.on_time_payments / cp.total_payments >= 95 THEN 100
              WHEN 100.0 * cp.on_time_payments / cp.total_payments >= 85 THEN 70
              WHEN 100.0 * cp.on_time_payments / cp.total_payments >= 70 THEN 40
              ELSE 10 END),
        (CASE WHEN cp.total_payments = 0 THEN NULL
              ELSE (CASE wd.worst_severity WHEN 0 THEN 100 WHEN 1 THEN 60 WHEN 2 THEN 30 ELSE 0 END) END)
    ) AS t(x)
    GROUP BY cp.customer_id
),
-- ---- Income & Capacity ----------------------------------------------------
latest_income AS (
    SELECT DISTINCT ON (i.customer_id, i.income_type)
        i.customer_id, i.income_type, i.monthly_income
    FROM income_source i
    ORDER BY i.customer_id, i.income_type, i.effective_date DESC
),
total_income AS (
    SELECT customer_id, SUM(monthly_income) AS total_monthly_income,
           COUNT(DISTINCT income_type) AS income_type_count
    FROM latest_income GROUP BY customer_id
),
income_quartile AS (
    SELECT customer_id, total_monthly_income, income_type_count,
           NTILE(4) OVER (ORDER BY total_monthly_income, customer_id) AS q
    FROM total_income
),
latest_application AS (
    SELECT DISTINCT ON (customer_id) customer_id, requested_amount, product_id, application_date
    FROM loan_application ORDER BY customer_id, application_date DESC
),
dti AS (
    SELECT it.customer_id,
           CASE WHEN it.total_monthly_income > 0
                THEN la.requested_amount / it.total_monthly_income END AS ratio
    FROM income_quartile it
    LEFT JOIN latest_application la ON la.customer_id = it.customer_id
),
dti_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY ratio ASC, customer_id) AS q
    FROM dti WHERE ratio IS NOT NULL
),
income_capacity AS (
    SELECT
        iq.customer_id,
        AVG(x) AS points
    FROM income_quartile iq
    LEFT JOIN dti_quartile dq ON dq.customer_id = iq.customer_id
    CROSS JOIN LATERAL (VALUES
        (CASE iq.q WHEN 4 THEN 100 WHEN 3 THEN 70 WHEN 2 THEN 40 ELSE 10 END),
        (CASE WHEN iq.income_type_count >= 2 THEN 100 ELSE 60 END),
        (COALESCE(CASE dq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55))
    ) AS t(x)
    GROUP BY iq.customer_id
),
-- ---- Transaction Behavior --------------------------------------------------
tx_agg AS (
    SELECT
        a.customer_id,
        COUNT(t.transaction_id) AS total_tx,
        COUNT(DISTINCT date_trunc('month', t.transaction_date)) AS active_months,
        SUM(t.amount) FILTER (WHERE t.category = 'income') AS total_income_tx,
        SUM(ABS(t.amount)) FILTER (WHERE t.category <> 'income') AS total_spend_tx
    FROM account a
    JOIN "transaction" t ON t.account_id = a.account_id
    GROUP BY a.customer_id
),
tx_calc AS (
    SELECT
        customer_id,
        total_tx::NUMERIC / NULLIF(active_months, 0) AS avg_monthly_tx_count,
        CASE WHEN COALESCE(total_income_tx, 0) > 0
             THEN total_spend_tx / total_income_tx END AS spend_to_income_ratio
    FROM tx_agg
),
tx_median AS (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_monthly_tx_count) AS median_tx
    FROM tx_calc WHERE avg_monthly_tx_count IS NOT NULL
),
tx_dev_quartile AS (
    SELECT tc.customer_id,
           NTILE(4) OVER (ORDER BY ABS(tc.avg_monthly_tx_count - m.median_tx) ASC, customer_id) AS q
    FROM tx_calc tc CROSS JOIN tx_median m
    WHERE tc.avg_monthly_tx_count IS NOT NULL
),
spend_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY spend_to_income_ratio ASC, customer_id) AS q
    FROM tx_calc WHERE spend_to_income_ratio IS NOT NULL
),
balance_trend AS (
    SELECT a.customer_id,
           REGR_SLOPE(bh.closing_balance, EXTRACT(EPOCH FROM bh.snapshot_date::timestamp)) AS slope
    FROM account a
    JOIN account_balance_history bh ON bh.account_id = a.account_id
    GROUP BY a.customer_id
),
slope_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY slope ASC, customer_id) AS q
    FROM balance_trend WHERE slope IS NOT NULL
),
transaction_behavior AS (
    SELECT
        tc.customer_id,
        AVG(x) AS points
    FROM tx_calc tc
    LEFT JOIN tx_dev_quartile tdq ON tdq.customer_id = tc.customer_id
    LEFT JOIN spend_quartile sq ON sq.customer_id = tc.customer_id
    LEFT JOIN slope_quartile slq ON slq.customer_id = tc.customer_id
    CROSS JOIN LATERAL (VALUES
        (COALESCE(CASE tdq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55)),
        (COALESCE(CASE sq.q  WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55)),
        (COALESCE(CASE slq.q WHEN 1 THEN 10  WHEN 2 THEN 40 WHEN 3 THEN 70 WHEN 4 THEN 100 END, 55))
    ) AS t(x)
    GROUP BY tc.customer_id
),
-- ---- Account Relationship ---------------------------------------------------
acct_agg AS (
    SELECT customer_id, MIN(open_date) AS earliest_open_date,
           COUNT(*) FILTER (WHERE status = 'active') AS active_accounts,
           COUNT(*) AS total_accounts
    FROM account GROUP BY customer_id
),
tenure_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY earliest_open_date DESC, customer_id) AS q
    FROM acct_agg
),
account_relationship AS (
    SELECT
        a.customer_id,
        AVG(x) AS points
    FROM acct_agg a
    JOIN tenure_quartile tq ON tq.customer_id = a.customer_id
    CROSS JOIN LATERAL (VALUES
        (CASE tq.q WHEN 1 THEN 10 WHEN 2 THEN 40 WHEN 3 THEN 70 WHEN 4 THEN 100 END),
        (CASE WHEN a.active_accounts = a.total_accounts THEN 100
              WHEN a.active_accounts > 0 THEN 40 ELSE 0 END)
    ) AS t(x)
    GROUP BY a.customer_id
),
-- ---- Demographics & Loan Context --------------------------------------------
age_calc AS (
    SELECT customer_id, EXTRACT(YEAR FROM age(CURRENT_DATE, date_of_birth))::INT AS age
    FROM customer
),
age_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY ABS(age - 42) ASC, customer_id) AS q
    FROM age_calc
),
app_range AS (
    SELECT la.customer_id,
           CASE WHEN lp.max_amount > lp.min_amount
                THEN (la.requested_amount - lp.min_amount) / (lp.max_amount - lp.min_amount)
           END AS pct_of_range
    FROM latest_application la
    JOIN loan_product lp ON lp.product_id = la.product_id
),
range_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY pct_of_range ASC, customer_id) AS q
    FROM app_range WHERE pct_of_range IS NOT NULL
),
demographics AS (
    SELECT
        ac.customer_id,
        AVG(x) AS points
    FROM age_calc ac
    JOIN age_quartile aq ON aq.customer_id = ac.customer_id
    LEFT JOIN range_quartile rq ON rq.customer_id = ac.customer_id
    CROSS JOIN LATERAL (VALUES
        (CASE aq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END),
        (COALESCE(CASE rq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55))
    ) AS t(x)
    GROUP BY ac.customer_id
),
-- ---- Combine + weight -------------------------------------------------------
combined AS (
    SELECT
        c.customer_id,
        pb.points AS payment_behavior_points,
        ic.points AS income_capacity_points,
        tb.points AS transaction_behavior_points,
        ar.points AS account_relationship_points,
        dg.points AS demographics_points
    FROM customer c
    LEFT JOIN payment_behavior pb ON pb.customer_id = c.customer_id
    LEFT JOIN income_capacity ic ON ic.customer_id = c.customer_id
    LEFT JOIN transaction_behavior tb ON tb.customer_id = c.customer_id
    LEFT JOIN account_relationship ar ON ar.customer_id = c.customer_id
    LEFT JOIN demographics dg ON dg.customer_id = c.customer_id
),
weighted AS (
    SELECT
        customer_id,
        payment_behavior_points, income_capacity_points, transaction_behavior_points,
        account_relationship_points, demographics_points,
        CASE WHEN payment_behavior_points IS NOT NULL THEN 0.35 ELSE 0 END AS w_pb,
        CASE WHEN payment_behavior_points IS NOT NULL THEN 0.25 ELSE 0.25 / 0.65 END AS w_ic,
        CASE WHEN payment_behavior_points IS NOT NULL THEN 0.20 ELSE 0.20 / 0.65 END AS w_tb,
        CASE WHEN payment_behavior_points IS NOT NULL THEN 0.10 ELSE 0.10 / 0.65 END AS w_ar,
        CASE WHEN payment_behavior_points IS NOT NULL THEN 0.10 ELSE 0.10 / 0.65 END AS w_dg
    FROM combined
)
SELECT
    customer_id,
    ROUND(payment_behavior_points, 2),
    ROUND(income_capacity_points, 2),
    ROUND(transaction_behavior_points, 2),
    ROUND(account_relationship_points, 2),
    ROUND(demographics_points, 2),
    ROUND(composite, 2) AS composite_score,
    ROUND(300 + composite * 5.5)::INT AS calculated_score_value,
    CASE
        WHEN 300 + composite * 5.5 >= 750 THEN 'A'
        WHEN 300 + composite * 5.5 >= 680 THEN 'B'
        WHEN 300 + composite * 5.5 >= 600 THEN 'C'
        WHEN 300 + composite * 5.5 >= 500 THEN 'D'
        ELSE 'E'
    END AS calculated_risk_grade
FROM (
    SELECT
        *,
        w_pb * COALESCE(payment_behavior_points, 0)
        + w_ic * income_capacity_points
        + w_tb * transaction_behavior_points
        + w_ar * account_relationship_points
        + w_dg * demographics_points AS composite
    FROM weighted
) scored
ORDER BY customer_id;
