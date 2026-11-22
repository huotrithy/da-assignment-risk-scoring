-- ============================================================================
-- Part 3 — Metric: Account Relationship (10% weight, criteria #4)
-- Sub-metrics: tenure since earliest account open_date (POPULATION QUARTILE
-- scored — see script 02's header for why), and whether all of the
-- customer's accounts are currently active vs dormant/closed.
-- ============================================================================

WITH acct_agg AS (
    SELECT
        customer_id,
        MIN(open_date)                            AS earliest_open_date,
        COUNT(*) FILTER (WHERE status = 'active') AS active_accounts,
        COUNT(*)                                   AS total_accounts
    FROM account
    GROUP BY customer_id
),
tenure_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY earliest_open_date DESC, customer_id) AS q  -- q1 = most recent open date = shortest tenure (worst)
    FROM acct_agg
)
SELECT
    a.customer_id,
    a.earliest_open_date,
    ROUND(EXTRACT(EPOCH FROM age(CURRENT_DATE, a.earliest_open_date)) / (365.25 * 86400), 1) AS tenure_years,
    CASE tq.q WHEN 1 THEN 10 WHEN 2 THEN 40 WHEN 3 THEN 70 WHEN 4 THEN 100 END AS points_tenure,
    CASE
        WHEN a.active_accounts = a.total_accounts THEN 100
        WHEN a.active_accounts > 0 THEN 40
        ELSE 0
    END AS points_status
FROM acct_agg a
JOIN tenure_quartile tq ON tq.customer_id = a.customer_id
ORDER BY a.customer_id;
