-- Expectations for berka.loan_features. Every column ending in _ok must be true.
WITH c AS (
    SELECT
        COUNT(*)                                                          AS n,
        COUNT(*) FILTER (WHERE is_bad)                                    AS n_bad,
        COUNT(*) FILTER (WHERE split = 'train')                           AS n_train,
        COUNT(*) FILTER (WHERE months_observed IS NULL OR penalty_events IS NULL
                          OR min_balance IS NULL OR history_months IS NULL) AS null_required,
        COUNT(*) FILTER (WHERE last_trans_date >= loan_date
                          OR first_trans_date < loan_date - 365)          AS leak,
        COUNT(*) FILTER (WHERE penalty_events > 0)                        AS pen_any,
        ROUND(100.0 * COUNT(*) FILTER (WHERE penalty_events > 0 AND is_bad)
              / NULLIF(COUNT(*) FILTER (WHERE penalty_events > 0), 0), 1) AS bad_rate_pen,
        MIN(months_observed)                                              AS months_min,
        MAX(months_observed)                                              AS months_max
    FROM berka.loan_features
)
SELECT c.*,
       (n = 682 AND n_bad = 76 AND n_train = 477)   AS counts_ok,
       (null_required = 0)                          AS nulls_ok,
       (leak = 0)                                   AS no_leak_ok,
       (pen_any BETWEEN 26 AND 30)                  AS penalty_ok,
       -- months_observed = months elapsed in the window (not calendar months touched): 0 < m <= 12
       (months_min > 0 AND months_max <= 12.0)      AS months_ok
FROM c;
