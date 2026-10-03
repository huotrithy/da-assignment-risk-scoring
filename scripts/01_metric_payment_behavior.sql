-- ============================================================================
-- Part 3 — Metric: Payment Behavior (35% weight, criteria #1)
-- Only meaningful for repeat borrowers (customers with at least one
-- loan_account). Two sub-metrics, averaged: % on-time payments, and the
-- worst delinquency severity ever reached on any of their loans.
-- ============================================================================

WITH customer_payments AS (
    SELECT
        lap.customer_id,
        COUNT(ph.payment_id)                                    AS total_payments,
        COUNT(ph.payment_id) FILTER (WHERE ph.status = 'on_time') AS on_time_payments
    FROM loan_account la
    JOIN loan_application lap ON lap.application_id = la.application_id
    LEFT JOIN payment_history ph ON ph.loan_account_id = la.loan_account_id
    GROUP BY lap.customer_id
),
pct_on_time AS (
    SELECT
        customer_id,
        CASE WHEN total_payments = 0 THEN NULL
             ELSE ROUND(100.0 * on_time_payments / total_payments, 2)
        END AS pct_on_time
    FROM customer_payments
),
worst_delinquency AS (
    SELECT
        lap.customer_id,
        MAX(
            CASE de.event_type
                WHEN 'write_off' THEN 4
                WHEN '90dpd'     THEN 3
                WHEN '60dpd'     THEN 2
                WHEN '30dpd'     THEN 1
                ELSE 0
            END
        ) AS worst_severity
    FROM loan_account la
    JOIN loan_application lap ON lap.application_id = la.application_id
    LEFT JOIN delinquency_event de ON de.loan_account_id = la.loan_account_id
    GROUP BY lap.customer_id
)
SELECT
    p.customer_id,
    p.pct_on_time,
    CASE
        WHEN p.pct_on_time IS NULL THEN NULL
        WHEN p.pct_on_time >= 95 THEN 100
        WHEN p.pct_on_time >= 85 THEN 70
        WHEN p.pct_on_time >= 70 THEN 40
        ELSE 10
    END AS points_on_time,
    w.worst_severity,
    CASE w.worst_severity
        WHEN 0 THEN 100
        WHEN 1 THEN 60
        WHEN 2 THEN 30
        ELSE 0
    END AS points_delinquency
FROM pct_on_time p
JOIN worst_delinquency w ON w.customer_id = p.customer_id
WHERE p.pct_on_time IS NOT NULL  -- no installment due yet = no repayment record (scored as first-time, same as script 06)
ORDER BY p.customer_id;
