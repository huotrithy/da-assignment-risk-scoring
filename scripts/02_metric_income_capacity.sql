-- ============================================================================
-- Part 3 — Metric: Income & Capacity (25% weight, criteria #2)
-- Sub-metrics: income level, income diversification, debt-to-income.
--
-- Income level and debt-to-income are scored by POPULATION QUARTILE rather
-- than fixed guessed cutoffs: the bottom 25% of the customer base on that
-- metric always scores worst (10 pts), the top 25% always scores best
-- (100 pts). This guarantees real spread in the scorecard instead of most
-- customers converging on the same "good enough" band.
-- ============================================================================

WITH latest_income AS (
    SELECT DISTINCT ON (i.customer_id, i.income_type)
        i.customer_id, i.income_type, i.monthly_income
    FROM income_source i
    ORDER BY i.customer_id, i.income_type, i.effective_date DESC
),
total_income AS (
    SELECT
        customer_id,
        SUM(monthly_income)         AS total_monthly_income,
        COUNT(DISTINCT income_type) AS income_type_count
    FROM latest_income
    GROUP BY customer_id
),
income_quartile AS (
    SELECT
        customer_id, total_monthly_income, income_type_count,
        NTILE(4) OVER (ORDER BY total_monthly_income) AS q  -- q1 = lowest income (worst)
    FROM total_income
),
latest_application AS (
    SELECT DISTINCT ON (customer_id) customer_id, requested_amount
    FROM loan_application
    ORDER BY customer_id, application_date DESC
),
dti AS (
    SELECT
        it.customer_id,
        CASE WHEN it.total_monthly_income > 0
             THEN la.requested_amount / it.total_monthly_income END AS ratio
    FROM income_quartile it
    LEFT JOIN latest_application la ON la.customer_id = it.customer_id
),
dti_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY ratio ASC) AS q  -- q1 = lowest ratio (best)
    FROM dti
    WHERE ratio IS NOT NULL
)
SELECT
    iq.customer_id,
    iq.total_monthly_income,
    iq.income_type_count,
    CASE iq.q WHEN 4 THEN 100 WHEN 3 THEN 70 WHEN 2 THEN 40 ELSE 10 END AS points_income_level,
    CASE WHEN iq.income_type_count >= 2 THEN 100 ELSE 60 END AS points_diversification,
    d.ratio AS amount_to_income_ratio,
    COALESCE(
        CASE dq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END,
        55  -- no application on file: neutral default, not "good" or "bad"
    ) AS points_debt_to_income
FROM income_quartile iq
LEFT JOIN dti d ON d.customer_id = iq.customer_id
LEFT JOIN dti_quartile dq ON dq.customer_id = iq.customer_id
ORDER BY iq.customer_id;
