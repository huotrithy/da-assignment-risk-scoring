-- ============================================================================
-- Point-in-time features, one row per loan.
-- Window: the 12 months BEFORE the loan date (trans_date < loan_date and
-- >= loan_date - 365). Nothing on or after the loan date is used, so the
-- features are exactly what the bank could have seen when it decided.
-- Split: earliest 70% of loans (by loan_date, loan_id) = train, rest = test.
-- ============================================================================
DROP TABLE IF EXISTS berka.loan_features CASCADE;   -- validation views are rebuilt by 30_validate.sql

CREATE TABLE berka.loan_features AS
WITH owner AS (                                   -- the account owner (one per account)
    SELECT d.account_id, d.disp_id, c.client_id, c.birth_date, c.district_id
    FROM berka.disposition d JOIN berka.client c USING (client_id)
    WHERE d.type = 'OWNER'
),
users AS (
    SELECT account_id, COUNT(*) AS n_users FROM berka.disposition GROUP BY account_id
),
win AS (                                           -- transactions inside each loan's window
    SELECT l.loan_id, t.*
    FROM berka.loan l
    JOIN berka.trans t ON t.account_id = l.account_id
     AND t.trans_date <  l.loan_date
     AND t.trans_date >= l.loan_date - 365
),
agg AS (
    SELECT loan_id,
        MIN(trans_date)                                                AS first_trans_date,
        MAX(trans_date)                                                AS last_trans_date,
        COUNT(*) FILTER (WHERE k_symbol = 'penalty_interest')           AS penalty_events,
        COUNT(*) FILTER (WHERE balance < 0)                             AS negative_balance_events,
        SUM(amount) FILTER (WHERE type = 'credit')                      AS total_credit,
        SUM(amount) FILTER (WHERE type = 'withdrawal')                  AS total_withdrawal,
        COUNT(DISTINCT COALESCE(bank, '') || '|' || partner_account)
              FILTER (WHERE operation = 'transfer_in')                  AS income_sources,
        MIN(balance)                                                   AS min_balance
    FROM win GROUP BY loan_id
),
month_end AS (                                     -- balance after the last transaction of each month
    SELECT DISTINCT ON (loan_id, date_trunc('month', trans_date))
           loan_id, date_trunc('month', trans_date) AS m, balance
    FROM win
    ORDER BY loan_id, date_trunc('month', trans_date), trans_date DESC, trans_id DESC
),
bal AS (
    SELECT me.loan_id,
        AVG(me.balance)           AS avg_month_end_balance,
        STDDEV_SAMP(me.balance)   AS sd_month_end_balance,
        REGR_SLOPE(me.balance,
            (EXTRACT(YEAR FROM me.m) * 12 + EXTRACT(MONTH FROM me.m))::numeric) AS slope_per_month
    FROM month_end me GROUP BY me.loan_id
),
base AS (
    SELECT l.loan_id, l.account_id, l.loan_date, l.is_bad, l.status,
           l.amount, l.duration_months, l.monthly_payment,
           -- months elapsed in the window: from the later of account opening / 365 days before, to the loan date
           (l.loan_date - GREATEST(ac.open_date, l.loan_date - 365)) / 30.44::numeric AS months_elapsed,
           ROW_NUMBER() OVER (ORDER BY l.loan_date, l.loan_id) AS rn,
           COUNT(*) OVER ()                                    AS n_all
    FROM berka.loan l JOIN berka.account ac USING (account_id)
)
SELECT
    b.loan_id, b.account_id, b.loan_date, b.is_bad, b.status,
    CASE WHEN b.rn <= FLOOR(0.7 * b.n_all) THEN 'train' ELSE 'test' END       AS split,
    a.first_trans_date, a.last_trans_date,
    ROUND(b.months_elapsed, 2)                                                  AS months_observed,
    ROUND((b.loan_date - acc.open_date) / 30.44::numeric, 1)                  AS history_months,
    a.penalty_events::int                                                       AS penalty_events,
    a.negative_balance_events::int                                              AS negative_balance_events,
    ROUND(COALESCE(a.total_credit, 0) / b.months_elapsed, 2)      AS monthly_inflow,
    a.income_sources::int                                                       AS income_sources,
    CASE WHEN COALESCE(a.total_credit, 0) > 0
         THEN ROUND(b.monthly_payment / (a.total_credit / b.months_elapsed), 4) END AS dti,
    a.min_balance,
    CASE WHEN bl.avg_month_end_balance > 0
         THEN ROUND(COALESCE(bl.sd_month_end_balance, 0) / bl.avg_month_end_balance, 4) END AS balance_volatility,
    CASE WHEN bl.avg_month_end_balance <> 0
         THEN ROUND(COALESCE(bl.slope_per_month, 0)::numeric / ABS(bl.avg_month_end_balance), 4) END AS balance_trend,
    CASE WHEN COALESCE(a.total_credit, 0) > 0
         THEN ROUND(COALESCE(a.total_withdrawal, 0) / a.total_credit, 4) END     AS spend_to_income,
    CASE WHEN EXISTS (SELECT 1 FROM berka.card cd
                      WHERE cd.disp_id = o.disp_id AND cd.issued_date < b.loan_date)
         THEN 1 ELSE 0 END                                                      AS has_card,
    CASE WHEN u.n_users > 1 THEN 1 ELSE 0 END                                   AS joint_account,
    EXTRACT(YEAR FROM AGE(b.loan_date, o.birth_date))::int                      AS age_at_loan,
    COALESCE(dist.unemployment_96, dist.unemployment_95)                        AS district_unemployment,
    b.amount, b.duration_months, b.monthly_payment
FROM base b
JOIN berka.account acc ON acc.account_id = b.account_id
JOIN owner o           ON o.account_id   = b.account_id
JOIN users u           ON u.account_id   = b.account_id
JOIN berka.district dist ON dist.district_id = o.district_id
JOIN agg a             ON a.loan_id      = b.loan_id
LEFT JOIN bal bl       ON bl.loan_id     = b.loan_id;

ALTER TABLE berka.loan_features ADD PRIMARY KEY (loan_id);
