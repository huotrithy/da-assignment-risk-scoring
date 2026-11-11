-- Expectations for berka.loan_score (Task 5). Every *_ok column must be true.
WITH recompute AS (
    SELECT p.loan_id, SUM(w.weight * p.points) AS s
    FROM berka.loan_metric_points p JOIN berka.scorecard_weight w USING (metric)
    GROUP BY p.loan_id
),
by_grade AS (
    SELECT grade, AVG(is_bad::int) AS br FROM berka.loan_score WHERE split = 'train' GROUP BY grade
),
mono AS (
    SELECT br - LAG(br) OVER (ORDER BY grade) AS d FROM by_grade
)
SELECT
    (SELECT COUNT(*) = 682 FROM berka.loan_score)                                          AS rows_ok,
    (SELECT BOOL_AND(score BETWEEN 0 AND 100) FROM berka.loan_score)                       AS range_ok,
    (SELECT MAX(ABS(s.score - r.s)) < 0.01 FROM berka.loan_score s JOIN recompute r USING (loan_id)) AS sum_ok,
    (SELECT BOOL_AND(d >= 0) FROM mono WHERE d IS NOT NULL)                                AS grade_monotonic_ok,
    (SELECT ABS(v.gini - p.value) < 0.005 FROM berka.validation_summary v, berka.scorecard_param p
      WHERE v.split = 'train' AND p.name = 'train_gini')                                   AS gini_matches_fit_ok,
    (SELECT string_agg(grade || ':' || ROUND(100 * br, 1), ' ' ORDER BY grade) FROM by_grade) AS train_bad_rate_by_grade;
