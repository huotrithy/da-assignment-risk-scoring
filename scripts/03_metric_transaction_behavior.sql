-- ============================================================================
-- Part 3 — Metric: Transaction Behavior (20% weight, criteria #3)
-- Sub-metrics: transaction-volume "normality" (deviation from the population
-- median monthly count — both too quiet and too frenetic are bad, so this is
-- scored by distance from the median rather than a raw threshold), spend-to-
-- income ratio, and balance trend slope. All three are POPULATION QUARTILE
-- scored — see script 02's header for why.
-- ============================================================================

WITH tx_agg AS (
    SELECT
        a.customer_id,
        COUNT(t.transaction_id)                                  AS total_tx,
        COUNT(DISTINCT date_trunc('month', t.transaction_date))  AS active_months,
        SUM(t.amount)      FILTER (WHERE t.category = 'income')  AS total_income_tx,
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
           NTILE(4) OVER (ORDER BY ABS(tc.avg_monthly_tx_count - m.median_tx) ASC, customer_id) AS q  -- q1 = closest to median (best)
    FROM tx_calc tc CROSS JOIN tx_median m
    WHERE tc.avg_monthly_tx_count IS NOT NULL
),
spend_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY spend_to_income_ratio ASC, customer_id) AS q  -- q1 = lowest ratio (best)
    FROM tx_calc WHERE spend_to_income_ratio IS NOT NULL
),
balance_trend AS (
    SELECT
        a.customer_id,
        REGR_SLOPE(bh.closing_balance, EXTRACT(EPOCH FROM bh.snapshot_date::timestamp)) AS slope
    FROM account a
    JOIN account_balance_history bh ON bh.account_id = a.account_id
    GROUP BY a.customer_id
),
slope_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY slope ASC, customer_id) AS q  -- q1 = most negative slope (worst)
    FROM balance_trend WHERE slope IS NOT NULL
)
SELECT
    tc.customer_id,
    tc.avg_monthly_tx_count,
    COALESCE(CASE tdq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55) AS points_tx_volume,
    tc.spend_to_income_ratio,
    COALESCE(CASE sq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55) AS points_spend_ratio,
    bt.slope AS balance_slope,
    COALESCE(CASE slq.q WHEN 1 THEN 10 WHEN 2 THEN 40 WHEN 3 THEN 70 WHEN 4 THEN 100 END, 55) AS points_balance_trend
FROM tx_calc tc
LEFT JOIN tx_dev_quartile tdq ON tdq.customer_id = tc.customer_id
LEFT JOIN spend_quartile sq ON sq.customer_id = tc.customer_id
LEFT JOIN balance_trend bt ON bt.customer_id = tc.customer_id
LEFT JOIN slope_quartile slq ON slq.customer_id = tc.customer_id
ORDER BY tc.customer_id;
