-- ============================================================================
-- Stage 3 — Validation views. Train = loans the constants were learned from;
-- test = the latest 30% of loans, never seen by the fit.
-- Gini = 2*AUC - 1, where AUC = chance a random good loan scores higher than a random bad one.
-- ============================================================================
CREATE OR REPLACE FUNCTION berka.gini(scores numeric[], bad boolean[]) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
    WITH d AS (SELECT s, b FROM unnest(scores, bad) AS u(s, b)),
    r AS (
        SELECT b, RANK() OVER (ORDER BY s) + (COUNT(*) OVER (PARTITION BY s) - 1) / 2.0 AS rk FROM d
    ),
    t AS (SELECT COUNT(*) FILTER (WHERE NOT b) AS ng, COUNT(*) FILTER (WHERE b) AS nb,
                 SUM(rk) FILTER (WHERE NOT b) AS rg FROM r)
    SELECT ROUND(2 * ((rg - ng * (ng + 1) / 2.0) / NULLIF(ng * nb, 0)) - 1, 4) FROM t
$$;

CREATE OR REPLACE VIEW berka.validation_summary AS
SELECT split,
       berka.gini(ARRAY_AGG(score), ARRAY_AGG(is_bad))                       AS gini,
       COUNT(*)                                                              AS n,
       COUNT(*) FILTER (WHERE is_bad)                                        AS n_bad,
       ROUND(AVG(approved::int), 4)                                          AS approval_rate,
       ROUND(AVG(is_bad::int) FILTER (WHERE approved), 4)                    AS bad_rate_approved,
       ROUND(AVG(is_bad::int) FILTER (WHERE NOT approved), 4)                AS bad_rate_rejected
FROM berka.loan_score GROUP BY split;

CREATE OR REPLACE VIEW berka.validation_by_grade AS
SELECT split, grade, COUNT(*) AS n, COUNT(*) FILTER (WHERE is_bad) AS n_bad,
       ROUND(AVG(is_bad::int), 4)                                            AS bad_rate,
       ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY split), 4) AS share
FROM berka.loan_score GROUP BY split, grade;

-- Robustness: running loans (status C) may still go bad, so also check finished loans only,
-- and loans issued at least 12 months before the data ends (1998-12-31).
CREATE OR REPLACE VIEW berka.validation_finished AS
SELECT 'finished_A_vs_B' AS view_name, split,
       berka.gini(ARRAY_AGG(score), ARRAY_AGG(is_bad)) AS gini, COUNT(*) AS n, COUNT(*) FILTER (WHERE is_bad) AS n_bad
FROM berka.loan_score WHERE status IN ('A', 'B') GROUP BY split
UNION ALL
SELECT 'issued_12m_before_data_end', s.split,
       berka.gini(ARRAY_AGG(s.score), ARRAY_AGG(s.is_bad)), COUNT(*), COUNT(*) FILTER (WHERE s.is_bad)
FROM berka.loan_score s JOIN berka.loan_features f USING (loan_id)
WHERE f.loan_date <= DATE '1997-12-31' GROUP BY s.split;

-- Short-history check: are customers with little history favoured?
CREATE OR REPLACE VIEW berka.validation_history AS
SELECT CASE WHEN f.history_months < 6 THEN '<6' WHEN f.history_months < 12 THEN '6-12' ELSE '12+' END AS history_bucket,
       COUNT(*) AS n, ROUND(AVG(s.is_bad::int), 4) AS bad_rate, ROUND(AVG(s.score), 2) AS avg_score,
       ROUND(AVG(s.approved::int), 4) AS approval_rate
FROM berka.loan_score s JOIN berka.loan_features f USING (loan_id)
GROUP BY 1;
