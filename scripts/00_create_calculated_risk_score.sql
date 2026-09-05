-- ============================================================================
-- Part 3 — Step 0: create the table that stores our own computed scorecard
-- output, separate from the mock/seeded `risk_score` table.
-- (Already appended to 01_schema.sql; this file is just here so the Part 3
-- scripts read top-to-bottom as a complete, standalone story.)
-- ============================================================================

DROP TABLE IF EXISTS calculated_risk_score CASCADE;

CREATE TABLE calculated_risk_score (
    calc_score_id               SERIAL PRIMARY KEY,
    customer_id                 INT NOT NULL REFERENCES customer(customer_id),
    payment_behavior_points     NUMERIC(5,2),
    income_capacity_points      NUMERIC(5,2),
    transaction_behavior_points NUMERIC(5,2),
    account_relationship_points NUMERIC(5,2),
    demographics_points         NUMERIC(5,2),
    composite_score             NUMERIC(5,2) NOT NULL,
    calculated_score_value      INT NOT NULL CHECK (calculated_score_value BETWEEN 300 AND 850),
    calculated_risk_grade       CHAR(1) NOT NULL CHECK (calculated_risk_grade IN ('A','B','C','D','E')),
    calculated_date             DATE NOT NULL DEFAULT CURRENT_DATE
);
