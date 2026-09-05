-- ============================================================================
-- Part 3 — Validation: sanity-check the computed scorecard (calculated_risk_score)
-- against the mock/seeded risk_score, and surface basic distribution stats.
-- Run AFTER scripts/06_calculate_and_store_scorecard.sql.
-- ============================================================================

-- 1. Grade distribution of our computed scorecard
SELECT calculated_risk_grade, COUNT(*) AS customers
FROM calculated_risk_score
GROUP BY calculated_risk_grade
ORDER BY calculated_risk_grade;

-- 2. Cross-tab: computed grade vs each customer's most recent mock risk_score
--    grade (whichever mock row is most recent, application-linked or periodic).
WITH latest_mock_score AS (
    SELECT DISTINCT ON (customer_id)
        customer_id, risk_grade AS mock_risk_grade, score_value AS mock_score_value
    FROM risk_score
    ORDER BY customer_id, score_date DESC
)
SELECT
    cr.calculated_risk_grade,
    lm.mock_risk_grade,
    COUNT(*) AS customers
FROM calculated_risk_score cr
LEFT JOIN latest_mock_score lm ON lm.customer_id = cr.customer_id
GROUP BY cr.calculated_risk_grade, lm.mock_risk_grade
ORDER BY cr.calculated_risk_grade, lm.mock_risk_grade;

-- 3. Correlation between computed score and mock score, for customers that
--    have both (a rough "does our formula broadly agree with the seeded
--    outcome" check — not expected to be perfect, since the mock score was
--    bootstrap-sampled independently; see docs/Scoring_Methodology.md §5).
WITH latest_mock_score AS (
    SELECT DISTINCT ON (customer_id)
        customer_id, score_value AS mock_score_value
    FROM risk_score
    ORDER BY customer_id, score_date DESC
)
SELECT
    CORR(cr.calculated_score_value, lm.mock_score_value) AS correlation,
    COUNT(*) AS n_customers_compared
FROM calculated_risk_score cr
JOIN latest_mock_score lm ON lm.customer_id = cr.customer_id;

-- 4. Sample of 20 customers with full breakdown, for manual spot-checking.
SELECT *
FROM calculated_risk_score
ORDER BY customer_id
LIMIT 20;
