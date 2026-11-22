-- ============================================================================
-- Retail Credit Risk Scoring — Relational Schema (Part 2 draft)
-- Target: PostgreSQL
-- Mirrors the 13 conceptual entities from Part1_Conceptual_Business_Model.md
-- ============================================================================

DROP TABLE IF EXISTS calculated_risk_score CASCADE;
DROP TABLE IF EXISTS collateral CASCADE;
DROP TABLE IF EXISTS delinquency_event CASCADE;
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS loan_account CASCADE;
DROP TABLE IF EXISTS risk_score CASCADE;
DROP TABLE IF EXISTS loan_application CASCADE;
DROP TABLE IF EXISTS loan_offer CASCADE;
DROP TABLE IF EXISTS loan_product CASCADE;
DROP TABLE IF EXISTS account_balance_history CASCADE;
DROP TABLE IF EXISTS transaction CASCADE;
DROP TABLE IF EXISTS account CASCADE;
DROP TABLE IF EXISTS income_source CASCADE;
DROP TABLE IF EXISTS customer CASCADE;

CREATE TABLE customer (
    customer_id         SERIAL PRIMARY KEY,
    full_name           TEXT NOT NULL,
    date_of_birth       DATE NOT NULL,
    national_id         TEXT NOT NULL UNIQUE,
    customer_since_date DATE NOT NULL
);

CREATE TABLE income_source (
    income_id      SERIAL PRIMARY KEY,
    customer_id    INT NOT NULL REFERENCES customer(customer_id),
    income_type    TEXT NOT NULL CHECK (income_type IN ('salary','business','rental','other')),
    monthly_income NUMERIC(12,2) NOT NULL CHECK (monthly_income >= 0),
    effective_date DATE NOT NULL
);

CREATE TABLE account (
    account_id   SERIAL PRIMARY KEY,
    customer_id  INT NOT NULL REFERENCES customer(customer_id),
    account_type TEXT NOT NULL CHECK (account_type IN ('savings','current')),
    open_date    DATE NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('active','dormant','closed'))
);

CREATE TABLE transaction (
    transaction_id   SERIAL PRIMARY KEY,
    account_id       INT NOT NULL REFERENCES account(account_id),
    transaction_date DATE NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    category         TEXT NOT NULL
);

CREATE TABLE account_balance_history (
    balance_history_id SERIAL PRIMARY KEY,
    account_id          INT NOT NULL REFERENCES account(account_id),
    snapshot_date        DATE NOT NULL,
    closing_balance      NUMERIC(12,2) NOT NULL
);

CREATE TABLE loan_product (
    product_id     SERIAL PRIMARY KEY,
    product_name   TEXT NOT NULL,
    interest_rate  NUMERIC(5,2) NOT NULL,
    min_amount     NUMERIC(12,2) NOT NULL,
    max_amount     NUMERIC(12,2) NOT NULL,
    tenor_months   INT NOT NULL
);

CREATE TABLE loan_offer (
    offer_id    SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customer(customer_id),
    product_id  INT NOT NULL REFERENCES loan_product(product_id),
    offer_date  DATE NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','expired'))
);

CREATE TABLE loan_application (
    application_id    SERIAL PRIMARY KEY,
    customer_id       INT NOT NULL REFERENCES customer(customer_id),
    product_id        INT NOT NULL REFERENCES loan_product(product_id),
    application_date  DATE NOT NULL,
    requested_amount  NUMERIC(12,2) NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('approved','rejected','pending'))
);

CREATE TABLE risk_score (
    score_id       SERIAL PRIMARY KEY,
    customer_id    INT NOT NULL REFERENCES customer(customer_id),
    application_id INT REFERENCES loan_application(application_id),
    score_value    INT NOT NULL CHECK (score_value BETWEEN 300 AND 850),
    risk_grade     CHAR(1) NOT NULL CHECK (risk_grade IN ('A','B','C','D','E')),
    score_date     DATE NOT NULL
);

CREATE TABLE loan_account (
    loan_account_id     SERIAL PRIMARY KEY,
    application_id      INT NOT NULL UNIQUE REFERENCES loan_application(application_id),
    principal_amount    NUMERIC(12,2) NOT NULL,
    disbursement_date   DATE NOT NULL,
    outstanding_balance NUMERIC(12,2) NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('current','closed','delinquent','written_off'))
);

CREATE TABLE payment_history (
    payment_id      SERIAL PRIMARY KEY,
    loan_account_id INT NOT NULL REFERENCES loan_account(loan_account_id),
    due_date        DATE NOT NULL,
    amount_due      NUMERIC(12,2) NOT NULL,
    amount_paid     NUMERIC(12,2) NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('on_time','late','missed'))
);

CREATE TABLE delinquency_event (
    event_id        SERIAL PRIMARY KEY,
    loan_account_id INT NOT NULL REFERENCES loan_account(loan_account_id),
    event_date      DATE NOT NULL,
    days_past_due   INT NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN ('30dpd','60dpd','90dpd','write_off'))
);

CREATE TABLE collateral (
    collateral_id   SERIAL PRIMARY KEY,
    loan_account_id INT NOT NULL REFERENCES loan_account(loan_account_id),
    collateral_type TEXT NOT NULL,
    estimated_value NUMERIC(12,2) NOT NULL
);

-- ============================================================================
-- Part 3: computed scorecard output (see docs/Scoring_Methodology.md).
-- Kept separate from risk_score (the mock/seeded score) so the two can be
-- compared side by side rather than one overwriting the other.
-- ============================================================================
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
