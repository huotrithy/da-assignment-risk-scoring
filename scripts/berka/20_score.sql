-- ============================================================================
-- Score every loan with the constants learned by fit_scorecard.js.
--   1. raw value -> band (scorecard_band) -> points 0..100
--   2. window metrics: points pulled toward the training average when few months were observed
--        points = avg + (points - avg) * months / (months + shrink_k)
--   3. score = sum of weight x points  (0..100, higher = safer)
--   4. grade from the thresholds in scorecard_param; approved = grade A-C
-- ============================================================================
DROP TABLE IF EXISTS berka.loan_score CASCADE;          -- validation views are rebuilt by 30_validate.sql
DROP TABLE IF EXISTS berka.loan_metric_points CASCADE;

CREATE TABLE berka.loan_metric_points AS
WITH raw AS (
    SELECT f.loan_id, f.split, f.months_observed, w.metric, w.null_band, w.window_metric,
           (to_jsonb(f) ->> w.metric)::numeric AS raw_value
    FROM berka.loan_features f CROSS JOIN berka.scorecard_weight w
),
banded AS (
    SELECT r.*, COALESCE(
             (SELECT b.band FROM berka.scorecard_band b
               WHERE b.metric = r.metric AND r.raw_value IS NOT NULL
                 AND (b.lower IS NULL OR r.raw_value > b.lower)
                 AND (b.upper IS NULL OR r.raw_value <= b.upper)),
             r.null_band) AS band
    FROM raw r
),
pts AS (
    SELECT bd.*, b.points AS band_points
    FROM banded bd JOIN berka.scorecard_band b ON b.metric = bd.metric AND b.band = bd.band
),
train_avg AS (
    SELECT metric, AVG(band_points) AS avg_points FROM pts WHERE split = 'train' GROUP BY metric
)
SELECT p.loan_id, p.metric, p.raw_value, p.band, p.band_points,
       (CASE WHEN p.window_metric
                  THEN a.avg_points + (p.band_points - a.avg_points) * p.months_observed
                                      / (p.months_observed + (SELECT value FROM berka.scorecard_param WHERE name = 'shrink_k'))
                  ELSE p.band_points END) AS points
FROM pts p JOIN train_avg a USING (metric);

ALTER TABLE berka.loan_metric_points ADD PRIMARY KEY (loan_id, metric);

CREATE TABLE berka.loan_score AS
WITH crit AS (
    SELECT p.loan_id, w.criterion,
           SUM(w.weight * p.points) / NULLIF(SUM(w.weight), 0) AS crit_points,
           SUM(w.weight * p.points)                            AS contribution
    FROM berka.loan_metric_points p JOIN berka.scorecard_weight w USING (metric)
    GROUP BY p.loan_id, w.criterion
),
s AS (
    SELECT f.loan_id, f.split, f.is_bad, f.status,
        ROUND(MAX(crit_points) FILTER (WHERE criterion = 'payment'), 2)      AS payment_points,
        ROUND(MAX(crit_points) FILTER (WHERE criterion = 'income'), 2)       AS income_points,
        ROUND(MAX(crit_points) FILTER (WHERE criterion = 'balance'), 2)      AS balance_points,
        ROUND(MAX(crit_points) FILTER (WHERE criterion = 'relationship'), 2) AS relationship_points,
        ROUND(MAX(crit_points) FILTER (WHERE criterion = 'demographics'), 2) AS demographics_points,
        SUM(c.contribution)                                                  AS raw_score
    FROM berka.loan_features f JOIN crit c USING (loan_id)
    GROUP BY f.loan_id, f.split, f.is_bad, f.status
),
p AS (SELECT name, value FROM berka.scorecard_param)
SELECT s.loan_id, s.split, s.is_bad, s.status, s.payment_points, s.income_points, s.balance_points,
    s.relationship_points, s.demographics_points,
    ROUND(s.raw_score, 2)                                                    AS score,   -- shown rounded; grade uses the exact value
    CASE WHEN s.raw_score >= (SELECT value FROM p WHERE name = 'grade_A') THEN 'A'
         WHEN s.raw_score >= (SELECT value FROM p WHERE name = 'grade_B') THEN 'B'
         WHEN s.raw_score >= (SELECT value FROM p WHERE name = 'grade_C') THEN 'C'
         WHEN s.raw_score >= (SELECT value FROM p WHERE name = 'grade_D') THEN 'D'
         ELSE 'E' END::char(1)                                               AS grade,
    s.raw_score >= (SELECT value FROM p WHERE name = 'approve_cutoff')            AS approved
FROM s;

ALTER TABLE berka.loan_score ADD PRIMARY KEY (loan_id);
