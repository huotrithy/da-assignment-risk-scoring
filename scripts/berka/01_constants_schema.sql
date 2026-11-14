-- ============================================================================
-- Tables that hold everything the fit learns (scripts/berka/fit_scorecard.js).
-- All values are learned on the TRAINING loans only; scoring (20_score.sql) just reads them.
-- ============================================================================
-- Re-created on every fit so column changes always reach the database.
DROP TABLE IF EXISTS berka.metric_evidence, berka.metric_correlation, berka.scorecard_band,
    berka.scorecard_weight, berka.criterion_weight, berka.scorecard_param CASCADE;

CREATE TABLE IF NOT EXISTS berka.metric_evidence (      -- why each candidate metric was kept or dropped
    metric      TEXT PRIMARY KEY,
    criterion   TEXT NOT NULL,
    gini_train  NUMERIC(6,3),     -- + = higher value riskier, - = higher value safer
    gini_all    NUMERIC(6,3),
    bad_rate_q1 NUMERIC(6,3),     -- bad rate in each quartile of the raw value, lowest -> highest (train)
    bad_rate_q2 NUMERIC(6,3),
    bad_rate_q3 NUMERIC(6,3),
    bad_rate_q4 NUMERIC(6,3),
    verdict     TEXT NOT NULL,    -- kept | dropped_weak | dropped_duplicate | dropped_no_added_value
    reason      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS berka.metric_correlation (   -- Spearman rank correlation between candidates (train)
    metric_a TEXT, metric_b TEXT, spearman NUMERIC(6,3),
    PRIMARY KEY (metric_a, metric_b)
);
CREATE TABLE IF NOT EXISTS berka.scorecard_band (       -- value range -> points for each kept metric
    metric   TEXT, band INT,
    lower    NUMERIC,             -- exclusive; NULL = no lower limit
    upper    NUMERIC,             -- inclusive; NULL = no upper limit
    points   NUMERIC(6,2),        -- 0 (riskiest band) .. 100 (safest band)
    bad_rate NUMERIC(6,3),
    n_train  INT,
    PRIMARY KEY (metric, band)
);
CREATE TABLE IF NOT EXISTS berka.scorecard_weight (     -- weight of each kept metric in the 0-100 score
    metric        TEXT PRIMARY KEY,
    criterion     TEXT NOT NULL,
    coef          NUMERIC       ,   -- logistic-regression coefficient on points/100 (negative = lowers risk)
    weight        NUMERIC       ,   -- share of the score, all metrics sum to 1
    null_band     INT NOT NULL,   -- band used when the value is missing (the riskier end)
    window_metric BOOLEAN NOT NULL -- true = measured over the 12-month window, so shrunk for short history
);
CREATE TABLE IF NOT EXISTS berka.criterion_weight (
    criterion TEXT PRIMARY KEY,
    weight    NUMERIC               -- sum of its metrics' weights (0 if every metric was dropped)
);
CREATE TABLE IF NOT EXISTS berka.scorecard_param (
    name  TEXT PRIMARY KEY,
    value NUMERIC
);
