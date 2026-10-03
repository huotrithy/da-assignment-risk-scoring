-- ============================================================================
-- Part 3 — Metric: Demographics & Loan Context (10% weight, criteria #5)
-- Sub-metrics: age (scored by distance from the population's "prime" center,
-- age 42 — both very young and very old applicants are riskier, so this is
-- a deviation measure, not a raw threshold), and how close the customer's
-- most recent requested amount sits to the top of that product's allowed
-- range. Both are POPULATION QUARTILE scored — see script 02's header.
-- ============================================================================

WITH age_calc AS (
    SELECT customer_id, EXTRACT(YEAR FROM age(CURRENT_DATE, date_of_birth))::INT AS age
    FROM customer
),
age_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY ABS(age - 42) ASC, customer_id) AS q  -- q1 = closest to 42 (best)
    FROM age_calc
),
latest_application AS (
    SELECT DISTINCT ON (customer_id) customer_id, requested_amount, product_id
    FROM loan_application
    ORDER BY customer_id, application_date DESC
),
app_range AS (
    SELECT
        la.customer_id,
        CASE WHEN lp.max_amount > lp.min_amount
             THEN (la.requested_amount - lp.min_amount) / (lp.max_amount - lp.min_amount)
        END AS pct_of_range
    FROM latest_application la
    JOIN loan_product lp ON lp.product_id = la.product_id
),
range_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY pct_of_range ASC, customer_id) AS q  -- q1 = lowest pct of range (best)
    FROM app_range WHERE pct_of_range IS NOT NULL
)
SELECT
    ac.customer_id,
    ac.age,
    CASE aq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END AS points_age,
    ar.pct_of_range,
    COALESCE(CASE rq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55) AS points_amount_range
FROM age_calc ac
JOIN age_quartile aq ON aq.customer_id = ac.customer_id
LEFT JOIN app_range ar ON ar.customer_id = ac.customer_id
LEFT JOIN range_quartile rq ON rq.customer_id = ac.customer_id
ORDER BY ac.customer_id;
