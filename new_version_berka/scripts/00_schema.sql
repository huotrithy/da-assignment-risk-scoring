-- ============================================================================
-- Berka (PKDD'99 Czech bank) data, translated to English.
-- Source: http://lisp.vse.cz/pkdd99/DATA/data_berka.zip
-- Loaded by new_version_berka/scripts/load_berka.js. Re-running drops and rebuilds the schema.
-- ============================================================================
DROP SCHEMA IF EXISTS berka CASCADE;
CREATE SCHEMA berka;

CREATE TABLE berka.district (
    district_id            INT PRIMARY KEY,
    name                   TEXT NOT NULL,
    region                 TEXT NOT NULL,
    inhabitants            INT,
    avg_salary             NUMERIC(10,2),
    unemployment_95        NUMERIC(5,2),   -- '?' in source -> NULL
    unemployment_96        NUMERIC(5,2),
    entrepreneurs_per_1000 INT,
    crimes_95              INT,            -- '?' in source -> NULL
    crimes_96              INT
);

CREATE TABLE berka.account (
    account_id  INT PRIMARY KEY,
    district_id INT NOT NULL REFERENCES berka.district,
    frequency   TEXT NOT NULL,             -- monthly | weekly | after_transaction (statement issuance)
    open_date   DATE NOT NULL
);

CREATE TABLE berka.client (
    client_id   INT PRIMARY KEY,
    birth_date  DATE NOT NULL,
    gender      CHAR(1) NOT NULL,          -- decoded from birth number; never used for scoring
    district_id INT NOT NULL REFERENCES berka.district
);

CREATE TABLE berka.disposition (
    disp_id    INT PRIMARY KEY,
    client_id  INT NOT NULL REFERENCES berka.client,
    account_id INT NOT NULL REFERENCES berka.account,
    type       TEXT NOT NULL                -- OWNER | DISPONENT (second user of the account)
);

CREATE TABLE berka.card (
    card_id     INT PRIMARY KEY,
    disp_id     INT NOT NULL REFERENCES berka.disposition,
    type        TEXT NOT NULL,             -- junior | classic | gold
    issued_date DATE NOT NULL
);

CREATE TABLE berka.loan (
    loan_id         INT PRIMARY KEY,
    account_id      INT NOT NULL UNIQUE REFERENCES berka.account,  -- at most one loan per account
    loan_date       DATE NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    duration_months INT NOT NULL,
    monthly_payment NUMERIC(12,2) NOT NULL,
    status          CHAR(1) NOT NULL,      -- A finished OK, B finished unpaid, C running OK, D running in debt
    is_bad          BOOLEAN NOT NULL       -- status B or D
);

CREATE TABLE berka.trans (
    trans_id        INT PRIMARY KEY,
    account_id      INT NOT NULL REFERENCES berka.account,
    trans_date      DATE NOT NULL,
    type            TEXT NOT NULL,         -- credit | withdrawal
    operation       TEXT,                  -- cash_deposit | transfer_in | cash_withdrawal | card_withdrawal | transfer_out
    amount          NUMERIC(12,2) NOT NULL,
    balance         NUMERIC(12,2) NOT NULL,-- balance after the transaction
    k_symbol        TEXT,                  -- purpose: penalty_interest, interest, household, pension, loan_payment, ...
    bank            TEXT,                  -- partner bank code
    partner_account TEXT
);
CREATE INDEX trans_account_date ON berka.trans (account_id, trans_date);

CREATE TABLE berka.standing_order (
    order_id   INT PRIMARY KEY,
    account_id INT NOT NULL REFERENCES berka.account,
    bank_to    TEXT,
    account_to TEXT,
    amount     NUMERIC(12,2) NOT NULL,
    k_symbol   TEXT
);
