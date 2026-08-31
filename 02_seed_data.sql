-- ============================================================================
-- Retail Credit Risk Scoring — Synthetic Seed Data
-- Run AFTER 01_schema.sql, on the same empty database.
--
-- Volume: ~200 customers cascading to ~10k+ rows across all tables.
--
-- Realism note (for Part 4 discussion): rows are fully synthetic (no real
-- customer data), but parameter ranges are informed by public credit-risk
-- datasets rather than picked arbitrarily:
--   - Serious delinquency rate ~6-8%     (Kaggle "Give Me Some Credit")
--   - Loan charge-off / default ~5-10%   (LendingClub Loan Data)
--   - Income right-skewed, low-risk tail earns 2-4x the high-risk tail
--     (Home Credit Default Risk / general retail lending income spread)
-- These datasets were NOT imported directly — none of them match this
-- schema — they were only used to sanity-check the ranges below.
--
-- Risk bucket convention used only during generation (not a stored column):
--   customer_id % 5  ->  0,1 = low risk | 2,3 = medium risk | 4 = high risk
--   (40% / 40% / 20% split, mirroring a typical retail portfolio skew)
-- ============================================================================

SELECT setseed(0.42);

-- ---------------------------------------------------------------------------
-- 1. Loan Product (static catalog, no dependency)
-- ---------------------------------------------------------------------------
INSERT INTO loan_product (product_name, interest_rate, min_amount, max_amount, tenor_months) VALUES
    ('Personal Loan',          14.50,   500,  10000, 24),
    ('Auto Loan',               9.75,  3000,  30000, 60),
    ('Home Improvement Loan',  11.00,  1000,  20000, 36),
    ('Salary Advance',         18.00,   200,   2000,  6),
    ('Business Micro-Loan',    15.25,  1000,  15000, 36);

-- ---------------------------------------------------------------------------
-- 2. Customer (200 rows)
-- ---------------------------------------------------------------------------
INSERT INTO customer (full_name, date_of_birth, national_id, customer_since_date)
SELECT
    (ARRAY['Sokha','Dara','Piseth','Ratana','Sophea','Chanthou','Vichea','Sreymom','Bopha','Vuthy',
           'Kunthea','Rithy','Malis','Panha','Sotheara','Chenda','Makara','Sreynich','Veasna','Kimlong'])[1+floor(random()*20)::int]
    || ' ' ||
    (ARRAY['Chan','Sok','Heng','Meas','Pich','Ly','Chea','Kim','San','Vong',
           'Nou','Sen','Iv','Touch','Keo','Long','Nhem','Roeun','Suon','Yin'])[1+floor(random()*20)::int]
        AS full_name,
    (DATE '1965-01-01' + floor(random()*365*40)::int) AS date_of_birth,
    'NID' || lpad(gs::text, 9, '0') AS national_id,
    (DATE '2015-01-01' + floor(random()*365*10)::int) AS customer_since_date
FROM generate_series(1,200) AS gs;

-- ---------------------------------------------------------------------------
-- 3. Income Source (1 always, ~30% of low/medium risk get a 2nd source)
-- ---------------------------------------------------------------------------
INSERT INTO income_source (customer_id, income_type, monthly_income, effective_date)
SELECT
    c.customer_id,
    CASE WHEN c.customer_id % 5 = 4 THEN
        (ARRAY['salary','other'])[1+floor(random()*2)::int]
    ELSE
        (ARRAY['salary','business'])[1+floor(random()*2)::int]
    END,
    CASE
        WHEN c.customer_id % 5 IN (0,1) THEN round((1200 + random()*1800)::numeric, 2)  -- low risk: 1200-3000
        WHEN c.customer_id % 5 IN (2,3) THEN round(( 600 + random()* 900)::numeric, 2)  -- medium risk: 600-1500
        ELSE                                   round(( 300 + random()* 600)::numeric, 2)  -- high risk: 300-900
    END,
    c.customer_since_date + floor(random()*180)::int
FROM customer c;

INSERT INTO income_source (customer_id, income_type, monthly_income, effective_date)
SELECT c.customer_id, 'rental', round((150 + random()*450)::numeric, 2),
       c.customer_since_date + floor(random()*365)::int
FROM customer c
WHERE c.customer_id % 5 IN (0,1,2,3) AND random() < 0.3;

-- ---------------------------------------------------------------------------
-- 4. Account (1 per customer, ~35% get a 2nd account)
-- ---------------------------------------------------------------------------
INSERT INTO account (customer_id, account_type, open_date, status)
SELECT c.customer_id, 'savings', c.customer_since_date, 'active'
FROM customer c;

INSERT INTO account (customer_id, account_type, open_date, status)
SELECT c.customer_id, 'current', c.customer_since_date + floor(random()*365)::int, 'active'
FROM customer c
WHERE random() < 0.35;

-- ---------------------------------------------------------------------------
-- 5. Transaction (~15 per account)
-- ---------------------------------------------------------------------------
INSERT INTO transaction (account_id, transaction_date, amount, category)
SELECT
    a.account_id,
    CURRENT_DATE - floor(random()*180)::int,
    CASE (ARRAY['income','groceries','utilities','rent','transfer','entertainment','healthcare'])[1+floor(random()*7)::int]
        WHEN 'income' THEN round((300 + random()*2000)::numeric, 2)
        ELSE round(-(20 + random()*400)::numeric, 2)
    END,
    (ARRAY['income','groceries','utilities','rent','transfer','entertainment','healthcare'])[1+floor(random()*7)::int]
FROM account a
CROSS JOIN generate_series(1,15) AS n;

-- ---------------------------------------------------------------------------
-- 6. Account Balance History (26 weekly EOD snapshots per account, ~6 months)
--    Trend follows the owning customer's risk bucket.
-- ---------------------------------------------------------------------------
INSERT INTO account_balance_history (account_id, snapshot_date, closing_balance)
SELECT
    a.account_id,
    CURRENT_DATE - (w.week_num * 7),
    GREATEST(0, round((
        CASE
            WHEN c.customer_id % 5 IN (0,1) THEN 3000 + w.week_num * 25   -- low risk: growing
            WHEN c.customer_id % 5 IN (2,3) THEN 1200 + w.week_num * 2    -- medium risk: flat
            ELSE                                  900  - w.week_num * 15  -- high risk: declining
        END + (random()*300 - 150)
    )::numeric, 2))
FROM account a
JOIN customer c ON c.customer_id = a.customer_id
CROSS JOIN generate_series(0,25) AS w(week_num);

-- ---------------------------------------------------------------------------
-- 7. Loan Offer (proactive, targets low/medium risk customers only, ~30%)
-- ---------------------------------------------------------------------------
INSERT INTO loan_offer (customer_id, product_id, offer_date, status)
SELECT
    c.customer_id,
    (SELECT product_id FROM loan_product ORDER BY random() LIMIT 1),
    CURRENT_DATE - floor(random()*90)::int,
    (ARRAY['pending','accepted','declined','expired'])[1+floor(random()*4)::int]
FROM customer c
WHERE c.customer_id % 5 IN (0,1,2,3) AND random() < 0.3;

-- ---------------------------------------------------------------------------
-- 8-10. Loan Application + Risk Score + Loan Account
--    Generated together via a staging table so the score that decides the
--    application outcome is the SAME score stored in risk_score.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE app_gen (
    application_id   SERIAL PRIMARY KEY,
    customer_id      INT,
    product_id       INT,
    application_date DATE,
    requested_amount NUMERIC(12,2),
    score_value      INT,
    risk_grade       CHAR(1),
    status           TEXT
);

INSERT INTO app_gen (customer_id, product_id, application_date, requested_amount, score_value, risk_grade, status)
SELECT
    c.customer_id,
    p.product_id,
    CURRENT_DATE - floor(random()*365)::int AS application_date,
    round(LEAST(p.max_amount, GREATEST(p.min_amount, p.min_amount + random()*(p.max_amount - p.min_amount)))::numeric, 2),
    score_value,
    CASE
        WHEN score_value >= 750 THEN 'A'
        WHEN score_value >= 680 THEN 'B'
        WHEN score_value >= 600 THEN 'C'
        WHEN score_value >= 500 THEN 'D'
        ELSE 'E'
    END,
    CASE WHEN score_value >= 600 THEN 'approved' ELSE 'rejected' END
FROM (
    SELECT
        c.customer_id,
        (ARRAY(SELECT product_id FROM loan_product))[1+floor(random()*5)::int] AS product_id,
        (CASE
            WHEN c.customer_id % 5 IN (0,1) THEN 700 + floor(random()*120)   -- low risk: 700-820
            WHEN c.customer_id % 5 IN (2,3) THEN 580 + floor(random()*120)   -- medium risk: 580-700
            ELSE                                  350 + floor(random()*230)  -- high risk: 350-580
        END)::int AS score_value
    FROM customer c
    WHERE random() < 0.4  -- ~40% of customers submit an application
) sub
JOIN customer c ON c.customer_id = sub.customer_id
JOIN loan_product p ON p.product_id = sub.product_id;

INSERT INTO loan_application (application_id, customer_id, product_id, application_date, requested_amount, status)
SELECT application_id, customer_id, product_id, application_date, requested_amount, status FROM app_gen;
SELECT setval(pg_get_serial_sequence('loan_application','application_id'), (SELECT max(application_id) FROM loan_application));

INSERT INTO risk_score (customer_id, application_id, score_value, risk_grade, score_date)
SELECT customer_id, application_id, score_value, risk_grade, application_date FROM app_gen;

-- Periodic/batch scores for customers who received a proactive offer
-- (application_id left NULL — not tied to any single application)
INSERT INTO risk_score (customer_id, application_id, score_value, risk_grade, score_date)
SELECT
    customer_id,
    NULL,
    score_value,
    CASE WHEN score_value >= 750 THEN 'A' WHEN score_value >= 680 THEN 'B' ELSE 'C' END,
    offer_date - floor(random()*10)::int
FROM (
    SELECT DISTINCT ON (lo.customer_id)
        lo.customer_id,
        lo.offer_date,
        (CASE
            WHEN lo.customer_id % 5 IN (0,1) THEN 700 + floor(random()*120)
            ELSE                                    580 + floor(random()*120)
        END)::int AS score_value
    FROM loan_offer lo
) sub;

INSERT INTO loan_account (application_id, principal_amount, disbursement_date, outstanding_balance, status)
SELECT
    application_id,
    requested_amount,
    application_date + 5,
    round((requested_amount * (0.3 + random()*0.7))::numeric, 2),
    CASE
        WHEN customer_id % 5 = 4 AND random() < 0.5 THEN 'delinquent'
        WHEN random() < 0.1 THEN 'closed'
        ELSE 'current'
    END
FROM app_gen
WHERE status = 'approved';

-- ---------------------------------------------------------------------------
-- 11. Payment History (monthly installments; high-risk bucket gets late/missed)
-- ---------------------------------------------------------------------------
INSERT INTO payment_history (loan_account_id, due_date, amount_due, amount_paid, status)
SELECT
    la.loan_account_id,
    la.disbursement_date + (n.month_num * 30),
    round((la.principal_amount / 12)::numeric, 2) AS amount_due,
    CASE
        WHEN c.customer_id % 5 = 4 AND random() < 0.3 THEN 0
        WHEN c.customer_id % 5 = 4 AND random() < 0.5 THEN round((la.principal_amount / 12 * 0.6)::numeric, 2)
        ELSE round((la.principal_amount / 12)::numeric, 2)
    END AS amount_paid,
    CASE
        WHEN c.customer_id % 5 = 4 AND random() < 0.3 THEN 'missed'
        WHEN c.customer_id % 5 = 4 AND random() < 0.5 THEN 'late'
        ELSE 'on_time'
    END AS status
FROM loan_account la
JOIN loan_application app ON app.application_id = la.application_id
JOIN customer c ON c.customer_id = app.customer_id
CROSS JOIN generate_series(1,6) AS n(month_num);

-- ---------------------------------------------------------------------------
-- 12. Delinquency Event (loan accounts flagged delinquent above)
-- ---------------------------------------------------------------------------
INSERT INTO delinquency_event (loan_account_id, event_date, days_past_due, event_type)
SELECT
    la.loan_account_id,
    la.disbursement_date + 120,
    dpd,
    CASE WHEN dpd >= 90 THEN '90dpd' WHEN dpd >= 60 THEN '60dpd' ELSE '30dpd' END
FROM loan_account la
CROSS JOIN LATERAL (SELECT (30 + floor(random()*70))::int AS dpd) x
WHERE la.status = 'delinquent';

-- ---------------------------------------------------------------------------
-- 13. Collateral (only for secured products: Auto Loan / Home Improvement)
-- ---------------------------------------------------------------------------
INSERT INTO collateral (loan_account_id, collateral_type, estimated_value)
SELECT
    la.loan_account_id,
    CASE p.product_name WHEN 'Auto Loan' THEN 'vehicle' ELSE 'property' END,
    round((la.principal_amount * (1.1 + random()*0.4))::numeric, 2)
FROM loan_account la
JOIN loan_application app ON app.application_id = la.application_id
JOIN loan_product p ON p.product_id = app.product_id
WHERE p.product_name IN ('Auto Loan','Home Improvement Loan') AND random() < 0.7;

DROP TABLE app_gen;
