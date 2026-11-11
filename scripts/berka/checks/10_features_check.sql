-- Expectations for berka.loan_features (Task 2). Every column ending in _ok must be true.
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
    (COUNT(*) = 682 AND COUNT(*) FILTER (WHERE is_bad) = 76
       AND COUNT(*) FILTER (WHERE split = 'train') = 477)             AS counts_ok,
    (COUNT(*) FILTER (WHERE months_observed IS NULL OR penalty_events IS NULL
                      OR min_balance IS NULL OR history_months IS NULL) = 0) AS nulls_ok,
    (COUNT(*) FILTER (WHERE last_trans_date >= loan_date OR first_trans_date < loan_date - 365) = 0) AS no_leak_ok,
    (COUNT(*) FILTER (WHERE penalty_events > 0) BETWEEN 26 AND 30)   AS penalty_ok
FROM berka.loan_features;
