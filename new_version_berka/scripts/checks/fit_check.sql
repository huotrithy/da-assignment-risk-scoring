-- Expectations for the fitted constants (Task 4). Every *_ok column must be true.
WITH mono AS (
    SELECT metric,
           BOOL_AND(d >= 0) OR BOOL_AND(d <= 0) AS monotonic, COUNT(*) + 1 AS n_bands
    FROM (SELECT metric, bad_rate - LAG(bad_rate) OVER (PARTITION BY metric ORDER BY band) AS d
          FROM berka.scorecard_band) x
    WHERE d IS NOT NULL GROUP BY metric
)
SELECT
    (SELECT ABS(SUM(weight) - 1) < 0.001 FROM berka.scorecard_weight)                       AS weights_sum_ok,
    (SELECT COUNT(*) = 0 FROM berka.scorecard_weight w
       LEFT JOIN mono m USING (metric) WHERE COALESCE(m.n_bands, 1) < 2)                    AS two_bands_ok,
    (SELECT BOOL_AND(monotonic) FROM mono)                                                    AS monotonic_ok,
    (SELECT verdict <> 'kept' OR reason <> '' FROM berka.metric_evidence WHERE metric = 'age_at_loan') AS age_ok,
    (SELECT COUNT(*) = 15 FROM berka.scorecard_param)                                         AS params_ok,
    (SELECT BOOL_AND(strength >= 0.10) FROM berka.scorecard_weight)                           AS strength_ok,
    (SELECT MAX(points) = 100 AND MIN(points) = 10 FROM berka.scorecard_band)                 AS points_ok,
    (SELECT COUNT(*) FROM berka.scorecard_weight)                                             AS n_kept;
